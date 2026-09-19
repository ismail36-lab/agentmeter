import { getStartOfCurrentMonthISO, checkMonthlyQuota, MONTHLY_PLAN_LIMITS } from "./lib/quota";

async function runMonthlyQuotaTests() {
  console.log("==================================================");
  console.log("Starting Monthly Quota Reset & Utility Unit Tests");
  console.log("==================================================");

  // 1. Verify getStartOfCurrentMonthISO()
  const startOfMonthStr = getStartOfCurrentMonthISO();
  const startOfMonthDate = new Date(startOfMonthStr);

  console.log("Start of current UTC month ISO:", startOfMonthStr);
  console.log("Parsed Date UTC Day:", startOfMonthDate.getUTCDate());
  console.log("Parsed Date UTC Hours:", startOfMonthDate.getUTCHours());

  if (startOfMonthDate.getUTCDate() === 1 && startOfMonthDate.getUTCHours() === 0) {
    console.log("✅ getStartOfCurrentMonthISO() correctly returns 00:00:00.000 UTC on day 1 of current month!");
  } else {
    console.error("❌ Incorrect start of month calculation:", startOfMonthStr);
    process.exit(1);
  }

  // 2. Verify MONTHLY_PLAN_LIMITS mapping
  console.log("\nVerifying Monthly Plan Limits:");
  console.log("Free Tier Limit:", MONTHLY_PLAN_LIMITS.free, "(Expected: 5,000)");
  console.log("Pro Tier Limit:", MONTHLY_PLAN_LIMITS.pro, "(Expected: 500,000)");

  if (MONTHLY_PLAN_LIMITS.free === 5000 && MONTHLY_PLAN_LIMITS.pro === 500000) {
    console.log("✅ Plan limits correctly match CTO roadmap specs!");
  } else {
    console.error("❌ Invalid plan limits!");
    process.exit(1);
  }

  // 3. Test checkMonthlyQuota for null/unauthenticated user
  const nullUserQuota = await checkMonthlyQuota(null, "free");
  console.log("\nNull user monthly quota check result:", nullUserQuota);
  if (nullUserQuota.allowed && nullUserQuota.currentCount === 0 && nullUserQuota.monthlyLimit === 5000) {
    console.log("✅ Null user fallback handled safely!");
  } else {
    console.error("❌ Null user quota check failed:", nullUserQuota);
    process.exit(1);
  }

  console.log("\n==================================================");
  console.log("ALL MONTHLY QUOTA TESTS PASSED SUCCESSFULLY! 🎉");
  console.log("==================================================");
}

runMonthlyQuotaTests().catch((err) => {
  console.error("Monthly quota test error:", err);
  process.exit(1);
});
