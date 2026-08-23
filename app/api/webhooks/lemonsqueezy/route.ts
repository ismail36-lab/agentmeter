import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-signature") || "";
    const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;

    if (!secret || !signature) {
      return NextResponse.json({ error: "Missing signature or webhook secret" }, { status: 401 });
    }

    const hmac = crypto.createHmac("sha256", secret);
    const digest = Buffer.from(hmac.update(rawBody).digest("hex"), "utf8");
    const signatureBuffer = Buffer.from(signature, "utf8");

    if (digest.length !== signatureBuffer.length || !crypto.timingSafeEqual(digest, signatureBuffer)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const payload = JSON.parse(rawBody);
    const eventName = payload?.meta?.event_name;
    const customData = payload?.meta?.custom_data || {};
    const organizationId = customData.organization_id;

    if (!organizationId) {
      console.warn("Lemon Squeezy Webhook: Missing organization_id in meta.custom_data");
      return NextResponse.json({ message: "Ignored: Missing organization_id" }, { status: 200 });
    }

    const attributes = payload?.data?.attributes || {};
    const status = attributes.status;
    const subscriptionId = payload?.data?.id ? String(payload.data.id) : null;
    const customerId = attributes.customer_id ? String(attributes.customer_id) : null;

    if (eventName === "subscription_created" || eventName === "subscription_updated") {
      if (status === "active" || status === "on_trial") {
        const { error } = await supabaseAdmin
          .from("organizations")
          .update({
            plan_type: "pro",
            monthly_log_limit: 250000,
            lemon_squeezy_customer_id: customerId,
            lemon_squeezy_subscription_id: subscriptionId,
          })
          .eq("id", organizationId);

        if (error) {
          console.error("Error updating organization to Pro:", error.message);
          return NextResponse.json({ error: error.message }, { status: 500 });
        }
      }
    } else if (eventName === "subscription_cancelled" || eventName === "subscription_expired") {
      const { error } = await supabaseAdmin
        .from("organizations")
        .update({
          plan_type: "free",
          monthly_log_limit: 1000,
        })
        .eq("id", organizationId);

      if (error) {
        console.error("Error updating organization to Free:", error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error: any) {
    console.error("Lemon Squeezy webhook error:", error);
    return NextResponse.json({ error: "Internal Server Error", details: error.message }, { status: 500 });
  }
}
