export const runtime = "edge";

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

export async function POST(req: Request) {
  try {
    const supabaseUrl =
      process.env.NEXT_PUBLIC_SUPABASE_URL ||
      process.env.SUPABASE_URL ||
      "";
    const supabaseServiceKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.SUPABASE_ANON_KEY ||
      "";

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: "Server Configuration Error: Missing Supabase Env Vars" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Parse Auth Header
    const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing Authorization Header" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    const rawToken = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!rawToken) {
      return new Response(
        JSON.stringify({ error: "Missing Authorization Header" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    // Compute SHA-256 Hash using standard Web Crypto API
    const encoder = new TextEncoder();
    const data = encoder.encode(rawToken);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const keyHash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

    // Initialize Supabase Client dynamically inside handler (edge compatible, no server-only imports)
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Query api_keys
    const { data: keyData } = await supabase
      .from("api_keys")
      .select("user_id")
      .eq("key_hash", keyHash)
      .maybeSingle();

    let userId = keyData?.user_id;

    // Fallback search if hash lookup didn't match
    if (!userId) {
      const { data: fallbackKey } = await supabase
        .from("api_keys")
        .select("user_id")
        .or(`key.eq.${rawToken},display_prefix.eq.${rawToken.substring(0, 10)}`)
        .maybeSingle();

      userId = fallbackKey?.user_id;
    }

    if (!userId) {
      return new Response(
        JSON.stringify({ error: "Unauthorized: Invalid API key" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    // Parse Body
    const body = await req.json().catch(() => ({}));
    const promptVersionId = body.prompt_version_id || null;
    const model = body.model || "unknown";
    const inputTokens = body.input_tokens || body.prompt_tokens || 0;
    const outputTokens = body.output_tokens || body.completion_tokens || 0;
    const cost = body.cost || 0;

    // Insert into usage_logs with resilient cost column mapping
    const basePayload: Record<string, any> = {
      user_id: userId,
      model: model,
      prompt_version_id: promptVersionId,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      created_at: new Date().toISOString(),
    };

    // Primary insert payload using total_cost_usd (standard column name in schema)
    let { error: insertErr } = await supabase
      .from("usage_logs")
      .insert([{ ...basePayload, total_cost_usd: cost }]);

    if (insertErr) {
      // Fallback 1: retry with total_cost column name
      const { error: fallbackErr1 } = await supabase
        .from("usage_logs")
        .insert([{ ...basePayload, total_cost: cost }]);

      if (fallbackErr1) {
        // Fallback 2: retry with cost column name
        const { error: fallbackErr2 } = await supabase
          .from("usage_logs")
          .insert([{ ...basePayload, cost: cost }]);

        if (fallbackErr2) {
          return new Response(
            JSON.stringify({
              error: "Database Insert Error",
              details: insertErr.message || fallbackErr1.message || fallbackErr2.message,
            }),
            { status: 500, headers: { "Content-Type": "application/json" } }
          );
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        user_id: userId,
        prompt_version_id: promptVersionId,
        logged: true,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: "Internal Edge Error", message: err?.message || String(err) }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
