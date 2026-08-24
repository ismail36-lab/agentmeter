/**
 * STRIPE WEBHOOK — DISABLED
 *
 * This route has been superseded by /api/webhooks/lemonsqueezy.
 * The Stripe SDK has been removed from this project. This file is kept
 * for reference only and will always return 410 Gone.
 *
 * To re-enable Stripe: add `"stripe": "^22.5.0"` back to package.json,
 * restore the Stripe env vars, and revert /api/checkout/route.ts.
 */

import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: "Stripe webhooks are disabled. This project uses Lemon Squeezy." },
    { status: 410 }
  );
}
