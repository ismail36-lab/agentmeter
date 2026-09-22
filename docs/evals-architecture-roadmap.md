# Meterix — Evaluation & Output-Quality Layer Architecture

**Step 34 · Meterix CTO Master Execution Roadmap**
**Status:** Specification / Future Implementation
**Target Release:** v1.1 (post-launch)

---

## 1. Overview

The Evaluation Layer adds a structured, feedback-loop-aware quality dimension on top of the existing cost telemetry pipeline. Rather than only tracking *how much* an LLM call cost, Meterix will track *how good the output was* — and surface the combined metric as **cost-per-quality** (CPQ) on the dashboard.

The design philosophy is additive: the entire eval system is built as a thin overlay that joins against `usage_logs.id`. No existing tables, columns, or API contracts change.

---

## 2. Data Model

### 2.1 Existing anchor table

```sql
-- Already in production (see supabase/migrations/20260920_*)
public.usage_logs (
  id              UUID PRIMARY KEY,
  user_id         UUID NOT NULL REFERENCES auth.users(id),
  model           TEXT NOT NULL,
  provider        TEXT NOT NULL,
  input_tokens    INT,
  output_tokens   INT,
  total_cost_usd  NUMERIC(12,6),
  prompt_version_id TEXT,       -- added in Step 32
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ...
)
```

### 2.2 New `evaluations` table

```sql
-- Migration: supabase/migrations/20261001_evaluations.sql

CREATE TABLE IF NOT EXISTS public.evaluations (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Foreign key back to the specific LLM call being evaluated
  log_id      UUID        NOT NULL
                          REFERENCES public.usage_logs(id)
                          ON DELETE CASCADE,

  -- Name of the evaluation criterion (e.g. "faithfulness", "toxicity", "helpfulness")
  eval_name   TEXT        NOT NULL,

  -- Normalised score: 0.0 (worst) → 1.0 (best)
  -- Stored as NUMERIC to avoid float precision loss in aggregations
  score       NUMERIC(5,4) NOT NULL CHECK (score >= 0 AND score <= 1),

  -- Human or model-generated explanation / critique
  feedback    TEXT,

  -- Who/what produced this eval: 'human', 'llm-judge', 'automated'
  evaluator   TEXT        NOT NULL DEFAULT 'automated',

  -- Optional: which prompt version was active when this eval was produced
  prompt_version_id TEXT,

  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast lookups for the dashboard CPQ queries
CREATE INDEX IF NOT EXISTS idx_evaluations_log_id
  ON public.evaluations (log_id);

CREATE INDEX IF NOT EXISTS idx_evaluations_eval_name_created
  ON public.evaluations (eval_name, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_evaluations_prompt_version
  ON public.evaluations (prompt_version_id, eval_name);

-- Row Level Security
ALTER TABLE public.evaluations ENABLE ROW LEVEL SECURITY;

-- Users can only see evals tied to their own usage_logs
CREATE POLICY "evaluations_select_policy" ON public.evaluations
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.usage_logs ul
      WHERE ul.id = log_id AND ul.user_id = auth.uid()
    )
  );

CREATE POLICY "evaluations_insert_policy" ON public.evaluations
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.usage_logs ul
      WHERE ul.id = log_id AND ul.user_id = auth.uid()
    )
  );
```

### 2.3 Entity-relationship diagram

```
public.usage_logs                public.evaluations
─────────────────                ──────────────────
id  ◄────────────────────────── log_id  (FK, CASCADE DELETE)
user_id                          id
model                            eval_name
provider                         score
total_cost_usd                   feedback
prompt_version_id                evaluator
created_at                       prompt_version_id
                                 created_at
```

---

## 3. API Endpoint — `POST /api/v1/evals`

### 3.1 Route specification

```
POST /api/v1/evals
Authorization: Bearer mx_live_<key>
Content-Type: application/json
```

**Request body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `log_id` | UUID string | ✅ | The `usage_logs.id` returned by the ingest endpoint |
| `eval_name` | string | ✅ | Evaluation criterion name (e.g. `"faithfulness"`) |
| `score` | number `[0, 1]` | ✅ | Normalised quality score |
| `feedback` | string | ❌ | Human-readable explanation |
| `evaluator` | `"human"` \| `"llm-judge"` \| `"automated"` | ❌ | Defaults to `"automated"` |
| `prompt_version_id` | string | ❌ | Propagated from the original log for prompt analytics |

**Success response — HTTP 200**

```json
{
  "success": true,
  "eval_id": "c3a7b812-...",
  "log_id": "9c7260e4-...",
  "eval_name": "faithfulness",
  "score": 0.87
}
```

**Error responses**

| Code | Condition |
|------|-----------|
| 401 | Missing / invalid API key |
| 400 | `log_id` not found, `score` out of range, missing required fields |
| 500 | Database insert error |

### 3.2 File location

```
app/api/v1/evals/route.ts
```

Authentication reuses the same SHA-256 hash → `api_keys.key_hash` lookup pattern established in `app/api/v1/ingest/edge/route.ts` (Step 32).

### 3.3 Pseudocode sketch

```typescript
// app/api/v1/evals/route.ts  (to be implemented in v1.1)

export async function POST(req: Request) {
  // 1. Auth: Bearer → SHA-256 → api_keys.key_hash lookup
  const userId = await authenticateRequest(req);

  // 2. Parse + validate body
  const { log_id, eval_name, score, feedback, evaluator, prompt_version_id } = await req.json();
  if (score < 0 || score > 1) return error(400, "score must be in [0, 1]");

  // 3. Verify log_id belongs to this user (prevents cross-tenant eval injection)
  const logRow = await supabase
    .from("usage_logs")
    .select("id, prompt_version_id, total_cost_usd")
    .eq("id", log_id)
    .eq("user_id", userId)
    .single();
  if (!logRow) return error(400, "log_id not found or not owned by this API key");

  // 4. Insert evaluation
  const { data } = await supabase
    .from("evaluations")
    .insert({
      log_id,
      eval_name,
      score,
      feedback: feedback ?? null,
      evaluator: evaluator ?? "automated",
      prompt_version_id: prompt_version_id ?? logRow.prompt_version_id ?? null,
    })
    .select("id")
    .single();

  return json({ success: true, eval_id: data.id, log_id, eval_name, score }, 200);
}
```

---

## 4. Cost-Per-Quality (CPQ) Metrics

### 4.1 Core formula

```
CPQ = total_cost_usd / avg(score)
```

A lower CPQ means you are spending less money per unit of quality. This is the primary efficiency KPI for prompt engineers and ML teams.

### 4.2 Dashboard query (no schema refactoring required)

The following query can be run against the existing + new tables with a simple JOIN — no columns need to change in `usage_logs`:

```sql
-- Cost-per-quality by model, last 30 days
SELECT
  ul.model,
  ul.provider,
  COUNT(*)                                          AS call_count,
  SUM(ul.total_cost_usd)                            AS total_cost_usd,
  AVG(e.score)                                      AS avg_quality_score,
  SUM(ul.total_cost_usd) / NULLIF(AVG(e.score), 0) AS cost_per_quality
FROM public.usage_logs ul
JOIN public.evaluations e ON e.log_id = ul.id
WHERE
  ul.user_id = $1
  AND ul.created_at >= NOW() - INTERVAL '30 days'
GROUP BY ul.model, ul.provider
ORDER BY cost_per_quality ASC;
```

```sql
-- Cost-per-quality by prompt version (prompt A/B testing)
SELECT
  ul.prompt_version_id,
  COUNT(*)                                          AS call_count,
  AVG(ul.total_cost_usd)                            AS avg_cost_usd,
  AVG(e.score)                                      AS avg_quality_score,
  AVG(ul.total_cost_usd) / NULLIF(AVG(e.score), 0) AS cost_per_quality
FROM public.usage_logs ul
JOIN public.evaluations e ON e.log_id = ul.id
WHERE
  ul.user_id = $1
  AND ul.prompt_version_id IS NOT NULL
GROUP BY ul.prompt_version_id
ORDER BY cost_per_quality ASC;
```

```sql
-- Score trend by eval_name over time (for time-series chart)
SELECT
  DATE_TRUNC('day', e.created_at) AS day,
  e.eval_name,
  AVG(e.score)                    AS avg_score,
  COUNT(*)                        AS eval_count
FROM public.evaluations e
JOIN public.usage_logs ul ON ul.id = e.log_id
WHERE ul.user_id = $1
GROUP BY day, e.eval_name
ORDER BY day DESC;
```

### 4.3 Dashboard UI integration plan

| Panel | Data source | New component needed |
|-------|------------|---------------------|
| **CPQ by model** | `/api/metrics?view=cpq_model` | `CostPerQualityChart.tsx` |
| **CPQ by prompt version** | `/api/metrics?view=cpq_prompt` | extends `ModelDistributionChart.tsx` |
| **Quality score trend** | `/api/metrics?view=quality_trend` | new time-series panel |
| **Evaluation log table** | `/api/logs?include_evals=true` | adds `score` + `eval_name` columns |

No changes to existing dashboard page or existing API routes are required for initial read-only display. New panels are additive components.

---

## 5. Evaluation Ingestion Patterns

### 5.1 Human-in-the-loop (HITL)

```python
# After receiving LLM output and human review
meterix.log_eval(
    log_id="9c7260e4-68cc-4f63-a80c-36b98f91c5e1",
    eval_name="helpfulness",
    score=0.9,
    feedback="Response was accurate and concise",
    evaluator="human"
)
```

### 5.2 LLM-as-judge (automated)

```python
# Run a judge model, then send the score
judge_score = call_judge_llm(original_prompt, llm_output)

meterix.log_eval(
    log_id=ingest_response["log_id"],
    eval_name="faithfulness",
    score=judge_score,
    evaluator="llm-judge"
)
```

### 5.3 Programmatic / regression testing

```python
# CI pipeline running a fixed eval suite
for test_case in eval_suite:
    ingest_resp = meterix.ingest(...)
    score = run_eval(test_case, ingest_resp["output"])
    meterix.log_eval(log_id=ingest_resp["log_id"], eval_name="regression", score=score)
```

---

## 6. Migration Strategy

| Phase | Action | Risk |
|-------|--------|------|
| v1.1 — Schema | Apply `20261001_evaluations.sql` migration | Zero downtime — additive only |
| v1.1 — API | Deploy `POST /api/v1/evals` route | No breaking changes |
| v1.1 — SDK | Publish `meterix.log_eval()` method in Python + JS SDKs | Backward compatible |
| v1.2 — Dashboard | Add CPQ panels to dashboard page | Read-only UI additions |
| v1.2 — Alerts | Add eval-score drop webhook trigger | Additive alert type |

---

## 7. Security Considerations

- **Tenant isolation**: Every eval write is gated by a JOIN on `usage_logs.user_id = auth.uid()` — a user can only create evals for their own logs.
- **RLS enforced**: The `evaluations` table has RLS enabled with policies mirroring `usage_logs`.
- **Score validation**: DB `CHECK (score >= 0 AND score <= 1)` + API-level validation prevent poisoned data.
- **Eval injection**: `log_id` ownership check prevents an attacker from attaching scores to another tenant's logs.

---

## 8. Open Questions / Design Decisions

| # | Question | Recommendation |
|---|----------|---------------|
| 1 | Should a single `log_id` support multiple evals with the same `eval_name`? | **Yes** — use `created_at` for versioning; averaging is handled at query time |
| 2 | Should scores support negative values (e.g. toxicity)? | **No** — normalise to `[0, 1]` where `1 = best`, invert at the SDK layer if needed |
| 3 | Should eval scores trigger webhooks (e.g. score < 0.5)? | **Yes** — add to the existing webhook system in `lib/webhooks.ts` in v1.2 |
| 4 | Should `evaluations` have a `project_id` column? | **Yes** — add in the same migration to align with `usage_logs` multi-tenancy model |

---

*Document owner: CTO / Engineering Lead*
*Last updated: 2026-09-23*
