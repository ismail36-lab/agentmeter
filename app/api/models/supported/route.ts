import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Formats an array of model names into a clean readable string.
 * Examples:
 * - ["gpt-4o"] => "gpt-4o"
 * - ["gpt-4o", "claude-3-5-sonnet"] => "gpt-4o and claude-3-5-sonnet"
 * - ["gpt-4o", "claude-3-5-sonnet", "gemini-1.5-pro"] => "gpt-4o, claude-3-5-sonnet, and gemini-1.5-pro"
 * - ["gpt-4o", "claude-3-5-sonnet", "gemini-1.5-pro", "gpt-4o-mini"] => "gpt-4o, claude-3-5-sonnet, gemini-1.5-pro, and more"
 */
function formatSupportedModels(models: string[]): string {
  if (!models || models.length === 0) {
    return "OpenAI, Anthropic, and Gemini models";
  }
  if (models.length === 1) {
    return models[0];
  }
  if (models.length === 2) {
    return `${models[0]} and ${models[1]}`;
  }
  if (models.length === 3) {
    return `${models[0]}, ${models[1]}, and ${models[2]}`;
  }
  return `${models[0]}, ${models[1]}, ${models[2]}, and more`;
}

export async function GET() {
  const HEADERS = {
    "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
    "Access-Control-Allow-Origin": "*",
  };

  try {
    const { data, error } = await supabaseAdmin
      .from("model_pricing")
      .select("model_name")
      .eq("is_active", true)
      .order("model_name", { ascending: true });

    if (error) {
      console.error("[models/supported] DB error:", error.message);
      const fallbackModels = ["gpt-4o", "gpt-4o-mini", "claude-3-5-sonnet"];
      return NextResponse.json(
        {
          models: fallbackModels,
          formatted: formatSupportedModels(fallbackModels),
          fallback: true,
        },
        { headers: HEADERS }
      );
    }

    const modelNames = (data || []).map((row: { model_name: string }) => row.model_name);
    const distinctModels = Array.from(new Set(modelNames)).filter(Boolean);

    const finalModels =
      distinctModels.length > 0
        ? distinctModels
        : ["gpt-4o", "gpt-4o-mini", "claude-3-5-sonnet"];

    return NextResponse.json(
      {
        models: finalModels,
        formatted: formatSupportedModels(finalModels),
        fallback: distinctModels.length === 0,
      },
      { headers: HEADERS }
    );
  } catch (err: any) {
    console.error("[models/supported] Exception:", err);
    const fallbackModels = ["gpt-4o", "gpt-4o-mini", "claude-3-5-sonnet"];
    return NextResponse.json(
      {
        models: fallbackModels,
        formatted: formatSupportedModels(fallbackModels),
        fallback: true,
      },
      { headers: HEADERS }
    );
  }
}
