import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Fetches active models handling database schema discrepancies seamlessly.
 * Tries `model_name` first, falls back to `model`.
 */
export async function getActiveModels() {
  let firstErr: any = null;

  try {
    const { data, error } = await supabaseAdmin
      .from("model_pricing")
      .select("model_name, provider, input_price_per_million, output_price_per_million, is_active")
      .eq("is_active", true)
      .order("provider", { ascending: true })
      .order("model_name", { ascending: true });

    if (!error) return data;
    firstErr = error;
  } catch (err) {
    firstErr = err;
  }

  // Fallback to 'model' column
  try {
    const { data, error } = await supabaseAdmin
      .from("model_pricing")
      .select("model, provider, input_price_per_million, output_price_per_million, is_active")
      .eq("is_active", true)
      .order("provider", { ascending: true })
      .order("model", { ascending: true });

    if (!error && data) {
      return data.map((row: any) => ({
        ...row,
        model_name: row.model_name || row.model,
      }));
    }

    if (error) throw error;
  } catch (fallbackErr) {
    throw new Error(`Failed to fetch models using both schemas. Err1: ${firstErr?.message || "Unknown"} Err2: ${(fallbackErr as any)?.message || "Unknown"}`);
  }

  return [];
}
