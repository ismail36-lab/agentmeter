import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getActiveModels } from "@/lib/model-pricing";

export const dynamic = "force-dynamic";

function getCorsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: getCorsHeaders() });
}

/**
 * GET /api/models
 * Returns all active rows from model_pricing, ordered by provider → model_name.
 * Uses the service-role admin client so RLS does not block the query.
 */
export async function GET() {
  try {
    const data = await getActiveModels();

    return NextResponse.json(
      { models: data ?? [] },
      {
        status: 200,
        headers: {
          ...getCorsHeaders(),
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
        },
      }
    );
  } catch (err: any) {
    console.error("GET /api/models exception:", err);
    return NextResponse.json(
      { error: err.message || "Internal Server Error", models: [] },
      { status: 500, headers: getCorsHeaders() }
    );
  }
}
