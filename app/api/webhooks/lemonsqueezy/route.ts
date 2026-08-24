import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// Lemon Squeezy sends the raw body and an HMAC-SHA256 signature in the
// X-Signature header. We must verify this before processing any event.
export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-signature") || "";
    const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;

    // ── 1. Signature Verification ─────────────────────────────────────────────
    if (!secret) {
      console.error("LEMONSQUEEZY_WEBHOOK_SECRET is not set.");
      return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
    }

    if (!signature) {
      console.error("Missing X-Signature header on Lemon Squeezy webhook request.");
      return NextResponse.json({ error: "Missing signature" }, { status: 401 });
    }

    const hmac = crypto.createHmac("sha256", secret);
    const digest = Buffer.from(hmac.update(rawBody).digest("hex"), "utf8");
    const signatureBuffer = Buffer.from(signature, "utf8");

    // Constant-time comparison to prevent timing attacks
    if (
      digest.length !== signatureBuffer.length ||
      !crypto.timingSafeEqual(digest, signatureBuffer)
    ) {
      console.error("Lemon Squeezy webhook signature mismatch.");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    // ── 2. Parse Payload ──────────────────────────────────────────────────────
    const payload = JSON.parse(rawBody);
    const eventName: string = payload?.meta?.event_name ?? "";
    const customData = payload?.meta?.custom_data ?? {};

    // The checkout route embeds the Supabase Auth user ID as custom.user_id
    const userId: string | undefined = customData.user_id;

    if (!userId) {
      console.warn(`Lemon Squeezy Webhook [${eventName}]: Missing user_id in meta.custom_data — cannot map to profile.`);
      // Return 200 so Lemon Squeezy doesn't keep retrying; log the gap for debugging.
      return NextResponse.json({ message: "Ignored: Missing user_id" }, { status: 200 });
    }

    const attributes = payload?.data?.attributes ?? {};
    const subscriptionStatus: string = attributes.status ?? "";
    const subscriptionId: string | null = payload?.data?.id ? String(payload.data.id) : null;
    const customerId: string | null = attributes.customer_id
      ? String(attributes.customer_id)
      : null;

    // ── 3. Event Routing ──────────────────────────────────────────────────────
    switch (eventName) {
      // Fired when a new subscription is successfully created (first payment)
      case "subscription_created":
      // Fired on renewals, plan changes, reactivations
      case "subscription_updated": {
        const isActive =
          subscriptionStatus === "active" || subscriptionStatus === "on_trial";

        if (!isActive) {
          // e.g. past_due, paused — do not grant Pro access
          console.log(
            `Lemon Squeezy [${eventName}]: Subscription status is "${subscriptionStatus}" — skipping Pro grant.`
          );
          break;
        }

        const { error } = await supabaseAdmin
          .from("profiles")
          .upsert({
            id: userId,
            lemon_squeezy_customer_id: customerId,
            lemon_squeezy_subscription_id: subscriptionId,
            plan: "pro",
            subscription_status: "active",
            updated_at: new Date().toISOString(),
          });

        if (error) {
          console.error(`Error upserting profile for [${eventName}]:`, error.message);
          return NextResponse.json({ error: "Database update failed" }, { status: 500 });
        }

        console.log(`Lemon Squeezy [${eventName}]: User ${userId} upgraded to Pro.`);
        break;
      }

      // Fired when a subscription is cancelled (may still be active until period end)
      case "subscription_cancelled": {
        const { error } = await supabaseAdmin
          .from("profiles")
          .update({
            plan: "free",
            subscription_status: "canceled",
            updated_at: new Date().toISOString(),
          })
          .eq("id", userId);

        if (error) {
          console.error("Error updating profile for [subscription_cancelled]:", error.message);
          return NextResponse.json({ error: "Database update failed" }, { status: 500 });
        }

        console.log(`Lemon Squeezy [subscription_cancelled]: User ${userId} reverted to Free.`);
        break;
      }

      default:
        // Log unhandled events for monitoring — return 200 so LS doesn't retry
        console.log(`Lemon Squeezy: Unhandled event type "${eventName}" — acknowledged.`);
    }

    // ── 4. Acknowledge Receipt ────────────────────────────────────────────────
    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error: any) {
    console.error("Lemon Squeezy webhook unhandled error:", error);
    return NextResponse.json(
      { error: "Internal Server Error", details: error.message },
      { status: 500 }
    );
  }
}
