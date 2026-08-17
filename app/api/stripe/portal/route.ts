import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getUserFromRequest, getSupabaseAdminClient } from "@/lib/supabase";

// Initialize Stripe SDK
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2024-06-20" as any,
});

export async function POST(req: NextRequest) {
  // 1. Authenticate the requesting user
  const user = await getUserFromRequest(req);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Fetch the user's stripe_customer_id from the profiles table using the Admin client (bypasses RLS)
  const supabaseAdmin = getSupabaseAdminClient();

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    console.error("Error fetching profile:", profileError);
    return NextResponse.json(
      { error: "Could not retrieve billing profile" },
      { status: 404 }
    );
  }

  const { stripe_customer_id: customerId } = profile;

  if (!customerId) {
    return NextResponse.json(
      { error: "No Stripe customer found for this user. Please complete a checkout first." },
      { status: 400 }
    );
  }

  // 3. Derive the return URL from the request origin
  const origin = req.headers.get("origin") || process.env.NEXT_PUBLIC_APP_URL || "";
  const returnUrl = `${origin}/dashboard`;

  // 4. Create a Stripe Billing Portal session
  try {
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });

    return NextResponse.json({ url: portalSession.url }, { status: 200 });
  } catch (err: any) {
    console.error("Stripe billing portal session creation failed:", err.message);
    return NextResponse.json(
      { error: `Failed to create billing portal session: ${err.message}` },
      { status: 500 }
    );
  }
}
