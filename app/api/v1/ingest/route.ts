import { NextRequest, NextResponse } from "next/server";
import { POST as telemetryPOST } from "@/app/api/v1/telemetry/route";

export const dynamic = "force-dynamic";

function getCorsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, x-api-key, x-key-id",
  };
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: getCorsHeaders() });
}

/**
 * Delegate ingestion to the canonical /api/v1/telemetry route provider.
 * Guarantees server-side model pricing calculation via model_pricing DB lookups
 * and prevents reliance on client-reported cost fields.
 */
export async function POST(req: NextRequest) {
  try {
    const response = await telemetryPOST(req);

    // If telemetryPOST returned an error status (e.g. 401, 429, 400, 402, 403, 500),
    // pass through the response directly with status and headers intact.
    if (!response.ok) {
      return response;
    }

    // Parse the successful canonical telemetry payload
    const data = await response.json();

    // Augment with backward-compatible response fields expected by legacy /api/v1/ingest callers
    return NextResponse.json(
      {
        ...data,
        message: "Telemetry ingested successfully",
        total_cost_usd: data.calculated_cost ?? data.total_cost_usd ?? 0,
      },
      {
        status: 200,
        headers: response.headers,
      }
    );
  } catch (error: any) {
    console.error("[ingest-wrapper] Error delegating to canonical telemetry route:", error);
    return NextResponse.json(
      { error: "Internal Server Error", details: error.message || String(error) },
      { status: 500, headers: getCorsHeaders() }
    );
  }
}
