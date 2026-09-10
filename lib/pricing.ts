/**
 * Prompt Caching Cost Calculator & Multipliers
 * --------------------------------------------
 * Defines discount rates and multipliers for prompt caching across LLM providers:
 * 1. OpenAI cached prompt tokens: 50% discount (0.5x rate)
 * 2. Anthropic cached read tokens: 90% discount (0.1x rate)
 * 3. Gemini cached tokens: 75% discount (0.25x rate)
 */

export function getCacheReadMultiplier(provider?: string, model?: string): number {
  const p = String(provider || "").toLowerCase().trim();
  const m = String(model || "").toLowerCase().trim();

  if (p === "anthropic" || m.startsWith("claude")) {
    return 0.10; // 90% discount (0.1x rate)
  }
  if (
    p === "gemini" ||
    p === "google" ||
    p.includes("gemini") ||
    p.includes("google") ||
    m.startsWith("gemini")
  ) {
    return 0.25; // 75% discount (0.25x rate)
  }
  // OpenAI and standard default fallback: 50% discount (0.5x rate)
  return 0.50;
}
