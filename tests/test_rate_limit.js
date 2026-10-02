const { checkInMemoryRateLimit, checkRateLimitAsync } = require('./lib/rate-limiter');

async function runTests() {
  console.log("==================================================");
  console.log("Starting Rate Limiter Unit & Integration Tests");
  console.log("==================================================");

  const testKey = `test_key_${Date.now()}`;
  const freeLimit = 60;

  console.log(`\nTesting Free Tier limit (${freeLimit} req/min) for key: ${testKey}`);

  let successCount = 0;
  let rateLimitedCount = 0;
  let lastResult = null;

  for (let i = 1; i <= 65; i++) {
    const result = await checkRateLimitAsync(testKey, "free");
    if (result.allowed) {
      successCount++;
    } else {
      rateLimitedCount++;
      lastResult = result;
    }
  }

  console.log(`Total Requests Sent: 65`);
  console.log(`Allowed Requests: ${successCount} (Expected: 60)`);
  console.log(`Blocked Requests: ${rateLimitedCount} (Expected: 5)`);

  if (successCount === 60 && rateLimitedCount === 5) {
    console.log("✅ Free tier rate limit successfully enforced at 60 req/min!");
  } else {
    console.error("❌ Free tier rate limit failed! Expected 60 allowed, got", successCount);
    process.exit(1);
  }

  console.log("\nInspecting 429 Rate Limit details for 61st request:");
  console.log("Allowed:", lastResult.allowed);
  console.log("Limit:", lastResult.limit);
  console.log("Remaining:", lastResult.remaining);
  console.log("Retry-After (ms):", lastResult.retryAfterMs);

  if (lastResult.limit === 60 && lastResult.remaining === 0 && lastResult.retryAfterMs > 0) {
    console.log("✅ Rate limit metadata and headers correctly calculated!");
  } else {
    console.error("❌ Incorrect rate limit result metadata:", lastResult);
    process.exit(1);
  }

  // Testing Pro Tier limit (1,000 req/min)
  const proKey = `pro_key_${Date.now()}`;
  console.log(`\nTesting Pro Tier limit (1,000 req/min) for key: ${proKey}`);
  let proAllowedCount = 0;
  for (let i = 1; i <= 70; i++) {
    const res = await checkRateLimitAsync(proKey, "pro");
    if (res.allowed) proAllowedCount++;
  }
  console.log(`Pro key 70 requests allowed: ${proAllowedCount}/70 (Expected: 70 because Pro limit is 1000)`);

  if (proAllowedCount === 70) {
    console.log("✅ Pro tier rate limit successfully allows up to 1,000 req/min!");
  } else {
    console.error("❌ Pro tier failed! Allowed:", proAllowedCount);
    process.exit(1);
  }

  console.log("\n==================================================");
  console.log("ALL RATE LIMITER TESTS PASSED SUCCESSFULLY! 🎉");
  console.log("==================================================");
}

runTests().catch((err) => {
  console.error("Test execution failed with error:", err);
  process.exit(1);
});
