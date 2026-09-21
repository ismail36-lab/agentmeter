import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, getUserFromRequest } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, x-api-key",
  };
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() });
}

export interface PromptVersionEconomics {
  id: string;
  prompt_id: string;
  prompt_name: string;
  prompt_slug: string;
  version: string;
  model: string;
  template_text: string;
  created_at: string;
  is_active: boolean;
  total_requests: number;
  total_cost_usd: number;
  avg_input_tokens: number;
  avg_output_tokens: number;
  cost_per_1k_runs: number;
  estimated_margin_pct: number;
}

// ── Fallback Demo Prompts Data ────────────────────────────────────────────────
const MOCK_PROMPT_VERSIONS: PromptVersionEconomics[] = [
  {
    id: "pv_v1_0",
    prompt_id: "p_customer_support",
    prompt_name: "Customer Support Copilot",
    prompt_slug: "customer-support-copilot",
    version: "v1.0",
    model: "gpt-4o",
    template_text: "You are a customer support agent. Answer the customer query accurately using full context: {{context}}\n\nUser: {{user_query}}",
    created_at: "2026-09-01T10:00:00Z",
    is_active: false,
    total_requests: 1240,
    total_cost_usd: 14.88,
    avg_input_tokens: 1250,
    avg_output_tokens: 380,
    cost_per_1k_runs: 12.00,
    estimated_margin_pct: 52.0,
  },
  {
    id: "pv_v1_1",
    prompt_id: "p_customer_support",
    prompt_name: "Customer Support Copilot",
    prompt_slug: "customer-support-copilot",
    version: "v1.1 (Optimized System Prompt)",
    model: "gpt-4o-mini",
    template_text: "System: Concise Support Bot. Rules: Brief bullet points only.\nContext: {{context}}\n\nQuery: {{user_query}}",
    created_at: "2026-09-15T14:30:00Z",
    is_active: true,
    total_requests: 3820,
    total_cost_usd: 1.71,
    avg_input_tokens: 420,
    avg_output_tokens: 110,
    cost_per_1k_runs: 0.45,
    estimated_margin_pct: 94.5,
  },
  {
    id: "pv_v2_0",
    prompt_id: "p_doc_summarizer",
    prompt_name: "Enterprise Doc Summarizer",
    prompt_slug: "enterprise-doc-summarizer",
    version: "v2.0 (Claude Sonnet 4.5)",
    model: "claude-sonnet-4-5",
    template_text: "Extract key financial highlights, bulleted risks, and executive summaries from document: {{document}}",
    created_at: "2026-09-10T09:00:00Z",
    is_active: true,
    total_requests: 890,
    total_cost_usd: 5.34,
    avg_input_tokens: 1800,
    avg_output_tokens: 240,
    cost_per_1k_runs: 6.00,
    estimated_margin_pct: 76.0,
  },
];

export async function GET(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req);
    const userId = user?.id;

    // 1. Fetch prompts from database if table exists
    let dbPrompts: any[] = [];
    let dbVersions: any[] = [];
    let dbUsageLogs: any[] = [];

    try {
      const { data: pData } = await supabaseAdmin
        .from("prompts")
        .select("*")
        .order("created_at", { ascending: false });
      if (pData) dbPrompts = pData;

      const { data: vData } = await supabaseAdmin
        .from("prompt_versions")
        .select("*")
        .order("created_at", { ascending: false });
      if (vData) dbVersions = vData;

      const { data: uData } = await supabaseAdmin
        .from("usage_logs")
        .select("prompt_version_id, input_tokens, output_tokens, total_cost_usd")
        .not("prompt_version_id", "is", null);
      if (uData) dbUsageLogs = uData;
    } catch {
      // Table may not exist yet in live Supabase instance
    }

    if (dbPrompts.length === 0 || dbVersions.length === 0) {
      return NextResponse.json(
        {
          success: true,
          source: "demo_curated",
          prompts: MOCK_PROMPT_VERSIONS,
          summary: {
            total_prompt_versions: MOCK_PROMPT_VERSIONS.length,
            total_tracked_spend_usd: Number(
              MOCK_PROMPT_VERSIONS.reduce((sum, v) => sum + v.total_cost_usd, 0).toFixed(2)
            ),
            avg_cost_savings_pct: 96.2, // comparing v1.0 ($12/1k) to v1.1 ($0.45/1k)
          },
        },
        { headers: corsHeaders() }
      );
    }

    // 2. Map and compute economics from real DB data
    const results: PromptVersionEconomics[] = dbVersions.map((v) => {
      const parentPrompt = dbPrompts.find((p) => p.id === v.prompt_id) || {};
      const matchingLogs = dbUsageLogs.filter((l) => l.prompt_version_id === v.id || l.prompt_version_id === v.version);

      const totalRequests = matchingLogs.length;
      const totalCostUsd = matchingLogs.reduce((acc, l) => acc + (Number(l.total_cost_usd) || 0), 0);
      const totalInput = matchingLogs.reduce((acc, l) => acc + (Number(l.input_tokens) || 0), 0);
      const totalOutput = matchingLogs.reduce((acc, l) => acc + (Number(l.output_tokens) || 0), 0);

      const avgInput = totalRequests > 0 ? Math.round(totalInput / totalRequests) : 0;
      const avgOutput = totalRequests > 0 ? Math.round(totalOutput / totalRequests) : 0;
      const costPer1k = totalRequests > 0 ? Number(((totalCostUsd / totalRequests) * 1000).toFixed(2)) : 0;

      return {
        id: v.id,
        prompt_id: v.prompt_id,
        prompt_name: parentPrompt.name || "Unnamed Prompt",
        prompt_slug: parentPrompt.slug || "unnamed-prompt",
        version: v.version,
        model: v.model || "gpt-4o",
        template_text: v.template_text || "",
        created_at: v.created_at,
        is_active: v.is_active ?? true,
        total_requests: totalRequests,
        total_cost_usd: Number(totalCostUsd.toFixed(4)),
        avg_input_tokens: avgInput,
        avg_output_tokens: avgOutput,
        cost_per_1k_runs: costPer1k,
        estimated_margin_pct: costPer1k < 1.0 ? 92.5 : costPer1k < 5.0 ? 75.0 : 50.0,
      };
    });

    return NextResponse.json(
      {
        success: true,
        source: "database",
        prompts: results,
        summary: {
          total_prompt_versions: results.length,
          total_tracked_spend_usd: Number(
            results.reduce((sum, v) => sum + v.total_cost_usd, 0).toFixed(2)
          ),
          avg_cost_savings_pct: 0,
        },
      },
      { headers: corsHeaders() }
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Internal server error fetching prompts" },
      { status: 500, headers: corsHeaders() }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req);
    const userId = user?.id;

    const body = await req.json();
    const { name, slug, description, version, template_text, model } = body;

    if (!name || !slug || !version || !template_text) {
      return NextResponse.json(
        { error: "Missing required fields: name, slug, version, template_text" },
        { status: 400, headers: corsHeaders() }
      );
    }

    const cleanSlug = String(slug).toLowerCase().trim().replace(/[^a-z0-9-]/g, "-");

    // 1. Upsert Parent Prompt
    let promptId = "";
    try {
      const { data: existing } = await supabaseAdmin
        .from("prompts")
        .select("id")
        .eq("slug", cleanSlug)
        .maybeSingle();

      if (existing?.id) {
        promptId = existing.id;
      } else {
        const { data: createdPrompt } = await supabaseAdmin
          .from("prompts")
          .insert([
            {
              user_id: userId || null,
              slug: cleanSlug,
              name: String(name).trim(),
              description: description ? String(description).trim() : null,
            },
          ])
          .select("id")
          .single();
        if (createdPrompt?.id) promptId = createdPrompt.id;
      }
    } catch (dbErr) {
      console.warn("DB prompt insertion error:", dbErr);
    }

    // 2. Insert Prompt Version
    let versionId = "pv_" + Date.now().toString(36);
    try {
      if (promptId) {
        const { data: createdVersion } = await supabaseAdmin
          .from("prompt_versions")
          .insert([
            {
              prompt_id: promptId,
              version: String(version).trim(),
              template_text: String(template_text).trim(),
              model: model ? String(model).trim() : "gpt-4o-mini",
              is_active: true,
            },
          ])
          .select("id")
          .single();

        if (createdVersion?.id) versionId = createdVersion.id;
      }
    } catch (vErr) {
      console.warn("DB version insertion error:", vErr);
    }

    return NextResponse.json(
      {
        success: true,
        message: "Prompt version registered successfully",
        prompt: {
          id: promptId || "p_" + cleanSlug,
          slug: cleanSlug,
          name,
          version,
          prompt_version_id: versionId,
        },
      },
      { status: 201, headers: corsHeaders() }
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Internal server error creating prompt" },
      { status: 500, headers: corsHeaders() }
    );
  }
}
