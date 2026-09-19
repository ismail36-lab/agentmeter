import { supabaseAdmin } from "@/lib/supabase/admin";

export const MONTHLY_PLAN_LIMITS: Record<string, number> = {
  free: 5_000,
  pro: 500_000,
  enterprise: 1_000_000,
};

/**
 * Returns the ISO 8601 timestamp for the start of the current calendar month in UTC (00:00:00.000 UTC on the 1st).
 */
export function getStartOfCurrentMonthISO(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

export interface MonthlyQuotaResult {
  allowed: boolean;
  currentCount: number;
  monthlyLimit: number;
  plan: string;
  startOfMonthISO: string;
}

/**
 * Checks a user's usage log count for the current calendar month against their plan ceiling.
 * Scoped strictly to logs created at or after the 1st day of the active UTC month.
 */
export async function checkMonthlyQuota(
  userId: string | null,
  plan: string = "free"
): Promise<MonthlyQuotaResult> {
  const planKey = String(plan).toLowerCase();
  const monthlyLimit = MONTHLY_PLAN_LIMITS[planKey] ?? MONTHLY_PLAN_LIMITS.free;
  const startOfMonthISO = getStartOfCurrentMonthISO();

  let currentCount = 0;

  if (userId) {
    try {
      const { count, error } = await supabaseAdmin
        .from("usage_logs")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .gte("created_at", startOfMonthISO);

      if (!error && count !== null) {
        currentCount = count;
      } else if (error) {
        console.warn("[quota] Supabase usage_logs count error:", error.message);
      }
    } catch (err) {
      console.warn("[quota] Exception checking monthly quota:", err);
    }
  }

  const allowed = currentCount < monthlyLimit;

  return {
    allowed,
    currentCount,
    monthlyLimit,
    plan: planKey,
    startOfMonthISO,
  };
}
