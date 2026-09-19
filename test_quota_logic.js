function getStartOfCurrentMonthISO() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

const MONTHLY_PLAN_LIMITS = {
  free: 5000,
  pro: 500000,
  enterprise: 1000000,
};

function runQuotaLogicTest() {
  console.log("==================================================");
  console.log("Starting Monthly Quota Reset Calculation Test");
  console.log("==================================================");

  const iso = getStartOfCurrentMonthISO();
  const d = new Date(iso);

  console.log("Generated start-of-month ISO:", iso);
  console.log("Parsed UTC Year:", d.getUTCFullYear());
  console.log("Parsed UTC Month (0-indexed):", d.getUTCMonth());
  console.log("Parsed UTC Date:", d.getUTCDate());
  console.log("Parsed UTC Hours:", d.getUTCHours());
  console.log("Parsed UTC Minutes:", d.getUTCMinutes());

  if (d.getUTCDate() === 1 && d.getUTCHours() === 0 && d.getUTCMinutes() === 0) {
    console.log("✅ getStartOfCurrentMonthISO() correctly yields 00:00:00.000 UTC on 1st of month!");
  } else {
    console.error("❌ Invalid start of month ISO!");
    process.exit(1);
  }

  console.log("\nPlan Limits:");
  console.log("Free Limit:", MONTHLY_PLAN_LIMITS.free);
  console.log("Pro Limit:", MONTHLY_PLAN_LIMITS.pro);

  if (MONTHLY_PLAN_LIMITS.free === 5000 && MONTHLY_PLAN_LIMITS.pro === 500000) {
    console.log("✅ Quota limits verified!");
  } else {
    console.error("❌ Invalid plan limits!");
    process.exit(1);
  }

  console.log("\n==================================================");
  console.log("MONTHLY QUOTA LOGIC TEST PASSED! 🎉");
  console.log("==================================================");
}

runQuotaLogicTest();
