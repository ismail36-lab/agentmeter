import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export interface SessionRollupItem {
  session_id: string;
  agent_name: string;
  total_cost: number;
  call_count: number;
  models_used: string[];
  start_time: string;
  end_time: string;
  duration_seconds: number;
}

export async function GET(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  const NO_CACHE_HEADERS = {
    "Cache-Control": "no-store, max-age=0",
    "CDN-Cache-Control": "no-store",
    "Vercel-CDN-Cache-Control": "no-store",
  };

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_CACHE_HEADERS });
  }

  try {
    // 1. Primary lookup: Query Postgres view `session_cost_rollup`
    const { data: viewRows, error: viewError } = await supabaseAdmin
      .from("session_cost_rollup")
      .select("*");

    if (!viewError && viewRows && viewRows.length > 0) {
      const formattedFromView: SessionRollupItem[] = viewRows.map((row: any) => {
        const models = Array.isArray(row.models_used)
          ? row.models_used
          : typeof row.models_used === "string"
          ? row.models_used.split(",").map((m: string) => m.trim())
          : [row.model || "gpt-4o"];

        const startTime = new Date(row.start_time || row.first_call || row.created_at || Date.now());
        const endTime = new Date(row.end_time || row.last_call || row.created_at || Date.now());
        let durationSec = Number(row.duration_seconds ?? row.duration ?? 0);

        if (!durationSec && startTime && endTime) {
          durationSec = Math.max(0, Number(((endTime.getTime() - startTime.getTime()) / 1000).toFixed(1)));
        }

        return {
          session_id: String(row.session_id),
          agent_name: String(row.agent_name || row.agent || "AgentTask"),
          total_cost: Number(Number(row.total_cost ?? row.total_cost_usd ?? row.cost ?? 0).toFixed(6)),
          call_count: Number(row.call_count ?? row.total_calls ?? row.calls ?? 1),
          models_used: Array.from(new Set(models.filter(Boolean))),
          start_time: startTime.toISOString(),
          end_time: endTime.toISOString(),
          duration_seconds: durationSec,
        };
      });

      return NextResponse.json({ success: true, sessions: formattedFromView }, { headers: NO_CACHE_HEADERS });
    }

    // 2. Secondary fallback: Query usage_logs filtered by user_id or orphan logs with non-null session_id
    const { data: logs, error: logsError } = await supabaseAdmin
      .from("usage_logs")
      .select("*")
      .or(`user_id.eq.${user.id},user_id.is.null`)
      .order("created_at", { ascending: true });

    if (logsError) {
      console.warn("session-rollups fallback logs query notice:", logsError.message);
    }

    const allLogs = logs || [];
    const sessionMap: Record<
      string,
      {
        session_id: string;
        agent_name: string;
        total_cost: number;
        call_count: number;
        models: Set<string>;
        first_time: number;
        last_time: number;
        total_latency_ms: number;
      }
    > = {};

    allLogs.forEach((log) => {
      const sessId = String(log.session_id || log.metadata?.session_id || "").trim();
      if (!sessId) return;

      const cost = Number(log.total_cost_usd ?? log.cost ?? 0);
      const model = String(log.model || "gpt-4o");
      const agent = String(log.agent_name || log.metadata?.agent_name || "AgentTask");
      const timestampStr = log.created_at || log.timestamp || new Date().toISOString();
      const timeMs = new Date(timestampStr).getTime();
      const latencyMs = Number(log.latency_ms || log.latency || 100);

      if (!sessionMap[sessId]) {
        sessionMap[sessId] = {
          session_id: sessId,
          agent_name: agent,
          total_cost: 0,
          call_count: 0,
          models: new Set(),
          first_time: timeMs,
          last_time: timeMs,
          total_latency_ms: 0,
        };
      }

      const sess = sessionMap[sessId];
      sess.total_cost += isNaN(cost) ? 0 : cost;
      sess.call_count += 1;
      sess.models.add(model);
      sess.total_latency_ms += latencyMs;

      if (timeMs < sess.first_time) sess.first_time = timeMs;
      if (timeMs > sess.last_time) sess.last_time = timeMs;
      if (agent && agent !== "default-agent" && sess.agent_name === "default-agent") {
        sess.agent_name = agent;
      }
    });

    const sessions: SessionRollupItem[] = Object.values(sessionMap)
      .map((s) => {
        let durationSec = Number(((s.last_time - s.first_time) / 1000).toFixed(1));
        if (durationSec <= 0 && s.total_latency_ms > 0) {
          durationSec = Number((s.total_latency_ms / 1000).toFixed(1));
        }

        return {
          session_id: s.session_id,
          agent_name: s.agent_name,
          total_cost: Number(s.total_cost.toFixed(6)),
          call_count: s.call_count,
          models_used: Array.from(s.models),
          start_time: new Date(s.first_time).toISOString(),
          end_time: new Date(s.last_time).toISOString(),
          duration_seconds: durationSec,
        };
      })
      .sort((a, b) => new Date(b.end_time).getTime() - new Date(a.end_time).getTime());

    return NextResponse.json({ success: true, sessions }, { headers: NO_CACHE_HEADERS });
  } catch (error: any) {
    console.error("Session rollups API Error:", error);
    return NextResponse.json(
      { error: "Internal Server Error", details: error.message || String(error) },
      { status: 500, headers: NO_CACHE_HEADERS }
    );
  }
}
