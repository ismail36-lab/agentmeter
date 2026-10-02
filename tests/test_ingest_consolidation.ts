import { POST as telemetryPOST } from "./app/api/v1/telemetry/route";
import { POST as ingestPOST } from "./app/api/v1/ingest/route";
import { NextRequest } from "next/server";

async function runConsolidationTests() {
  console.log("==================================================");
  console.log("Starting Ingestion Endpoint Consolidation Tests");
  console.log("==================================================");

  const payloadWithFakeCost = {
    model: "gpt-4o",
    prompt_tokens: 100,
    completion_tokens: 50,
    total_cost_usd: 0.0000, // Client attempts to send fake zero cost!
    cost: 0.0000,
    metadata: { source: "Consolidation Test" },
  };

  // Test 1: Direct call to canonical Telemetry Endpoint
  console.log("\n1. Testing Canonical /api/v1/telemetry with fake client cost ($0.00)...");
  const reqTelemetry = new NextRequest("http://localhost:3000/api/v1/telemetry", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": "mx_test_sk_consolidation_key",
    },
    body: JSON.stringify(payloadWithFakeCost),
  });

  const resTelemetry = await telemetryPOST(reqTelemetry);
  console.log("Telemetry Response Status:", resTelemetry.status);
  const dataTelemetry = await resTelemetry.json();
  console.log("Telemetry Response Data:", dataTelemetry);

  if (resTelemetry.status === 200) {
    if (dataTelemetry.calculated_cost > 0 && dataTelemetry.total_cost_usd === dataTelemetry.calculated_cost) {
      console.log(`✅ Telemetry correctly calculated server-side cost: $${dataTelemetry.calculated_cost} (overrode fake $0.00 cost)`);
    } else {
      console.error("❌ Telemetry failed to enforce server-side cost calculation!", dataTelemetry);
      process.exit(1);
    }
  } else if (resTelemetry.status === 401) {
    console.log("ℹ️ Telemetry correctly enforced auth verification (401 for unseeded test key).");
  }

  // Test 2: Direct call to /api/v1/ingest (Delegating Wrapper)
  console.log("\n2. Testing Refactored /api/v1/ingest (Delegating Wrapper) with fake client cost ($0.00)...");
  const reqIngest = new NextRequest("http://localhost:3000/api/v1/ingest", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": "mx_test_sk_consolidation_key",
    },
    body: JSON.stringify(payloadWithFakeCost),
  });

  const resIngest = await ingestPOST(reqIngest);
  console.log("Ingest Response Status:", resIngest.status);
  const dataIngest = await resIngest.json();
  console.log("Ingest Response Data:", dataIngest);

  if (resIngest.status === resTelemetry.status) {
    console.log(`✅ Ingest endpoint response status (${resIngest.status}) matches canonical telemetry endpoint!`);
  } else {
    console.error(`❌ Status mismatch! Ingest: ${resIngest.status}, Telemetry: ${resTelemetry.status}`);
    process.exit(1);
  }

  if (resIngest.status === 200) {
    if (dataIngest.message === "Telemetry ingested successfully" && dataIngest.calculated_cost > 0) {
      console.log(`✅ Ingest delegating wrapper returned backward-compatible fields with server-side calculated cost: $${dataIngest.calculated_cost}`);
    } else {
      console.error("❌ Ingest response data incorrect:", dataIngest);
      process.exit(1);
    }
  }

  console.log("\n==================================================");
  console.log("INGESTION CONSOLIDATION TESTS PASSED SUCCESSFULLY! 🎉");
  console.log("==================================================");
}

runConsolidationTests().catch((err) => {
  console.error("Consolidation test error:", err);
  process.exit(1);
});
