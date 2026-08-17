import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return handleCheckout(req);
}

export async function POST(req: NextRequest) {
  return handleCheckout(req);
}

async function handleCheckout(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { searchParams } = new URL(req.url);
  let plan = searchParams.get("plan") || "pro";

  if (req.method === "POST") {
    try {
      const body = await req.json();
      if (body?.plan) plan = body.plan;
    } catch {}
  }

  const requestedPlan = String(plan).toLowerCase();

  // If user is authenticated, upgrade plan in metadata
  if (user) {
    try {
      const updatedMetadata = {
        ...(user.user_metadata || {}),
        plan: requestedPlan,
        updated_at: new Date().toISOString(),
      };

      await supabaseAdmin.auth.admin.updateUserById(user.id, {
        user_metadata: updatedMetadata,
      });
    } catch (err) {
      console.warn("Could not auto-update user metadata plan:", err);
    }
  }

  // Check if Stripe is configured
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (stripeSecretKey) {
    try {
      const priceId = process.env.STRIPE_PRO_PRICE_ID || "price_pro_monthly";
      const domain = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;

      const stripeRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${stripeSecretKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          "payment_method_types[0]": "card",
          "line_items[0][price]": priceId,
          "line_items[0][quantity]": "1",
          mode: "subscription",
          success_url: `${domain}/dashboard?checkout=success&plan=${requestedPlan}`,
          cancel_url: `${domain}/#pricing`,
          // Pass the authenticated user's ID so the webhook can match the session to a Supabase profile
          ...(user?.id ? { client_reference_id: user.id } : {}),
          ...(user?.email ? { customer_email: user.email } : {}),
        }).toString(),
      });

      if (stripeRes.ok) {
        const stripeData = await stripeRes.json();
        if (stripeData?.url) {
          if (req.headers.get("accept")?.includes("text/html")) {
            return NextResponse.redirect(stripeData.url);
          }
          return NextResponse.json({ url: stripeData.url });
        }
      }
    } catch (err) {
      console.warn("Stripe Checkout Error, falling back to dashboard redirect:", err);
    }
  }

  // Sandbox / Default Fallback Redirect
  const redirectUrl = user
    ? `/dashboard?checkout=success&plan=${requestedPlan}`
    : `/login?plan=${requestedPlan}&checkout=pending`;

  if (req.headers.get("accept")?.includes("text/html") || req.method === "GET") {
    return NextResponse.redirect(new URL(redirectUrl, req.url));
  }

  return NextResponse.json({ url: redirectUrl });
}
