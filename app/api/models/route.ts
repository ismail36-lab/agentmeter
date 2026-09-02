import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

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
    const { data, error } = await supabaseAdmin
      .from("model_pricing")
      .select("model_name, provider, input_price_per_million, output_price_per_million")
      .eq("is_active", true)
      .order("provider", { ascending: true })
      .order("model_name", { ascending: true });

    if (error) {
      console.error("GET /api/models error:", error.message);
      return NextResponse.json(
        { error: error.message, models: [] },
        { status: 500, headers: getCorsHeaders() }
      );
    }

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
