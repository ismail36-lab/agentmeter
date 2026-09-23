import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return handleCheckout(req);
}

export async function POST(req: NextRequest) {
  return handleCheckout(req);
}

async function handleCheckout(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  let plan = searchParams.get("plan") || "pro";

  if (req.method === "POST") {
    try {
      const body = await req.json();
      if (body?.plan) plan = body.plan;
    } catch { }
  }

  const requestedPlan = String(plan).toLowerCase();

  const lsApiKey = process.env.LEMONSQUEEZY_API_KEY;
  const lsStoreId = process.env.LEMONSQUEEZY_STORE_ID;
  const lsVariantId = process.env.LEMONSQUEEZY_PRO_VARIANT_ID;

  if (!lsApiKey || !lsStoreId || !lsVariantId) {
    console.error(
      "Lemon Squeezy is not configured. Missing:",
      !lsApiKey ? "LEMONSQUEEZY_API_KEY " : "",
      !lsStoreId ? "LEMONSQUEEZY_STORE_ID " : "",
      !lsVariantId ? "LEMONSQUEEZY_PRO_VARIANT_ID" : ""
    );
    return NextResponse.json(
      { error: "Billing is not configured on the server. Contact support." },
      { status: 500 }
    );
  }

  const domain = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;

  const lsPayload = {
    data: {
      type: "checkouts",
      attributes: {
        checkout_data: {
          email: user.email ?? undefined,
          custom: {
            user_id: user.id,
          },
        },
        product_options: {
          redirect_url: `${domain}/dashboard?checkout=success&plan=${requestedPlan}`,
        },
      },
      relationships: {
        store: {
          data: { type: "stores", id: String(lsStoreId) },
        },
        variant: {
          data: { type: "variants", id: String(lsVariantId) },
        },
      },
    },
  };

  let lsRes: Response;
  try {
    lsRes = await fetch("https://api.lemonsqueezy.com/v1/checkouts", {
      method: "POST",
      headers: {
        Accept: "application/vnd.api+json",
        "Content-Type": "application/vnd.api+json",
        Authorization: `Bearer ${lsApiKey}`,
      },
      body: JSON.stringify(lsPayload),
    });
  } catch (err) {
    console.error("Lemon Squeezy checkout request failed to send:", err);
    return NextResponse.json(
      { error: "Could not reach Lemon Squeezy. Try again shortly." },
      { status: 502 }
    );
  }

  if (!lsRes.ok) {
    const errBody = await lsRes.text();
    console.error("Lemon Squeezy Checkout Error:", lsRes.status, errBody);
    return NextResponse.json(
      { error: "Lemon Squeezy rejected the checkout request.", details: errBody },
      { status: 502 }
    );
  }

  const lsData = await lsRes.json();
  const checkoutUrl = lsData?.data?.attributes?.url;

  if (!checkoutUrl) {
    console.error("Lemon Squeezy response had no checkout URL:", JSON.stringify(lsData));
    return NextResponse.json(
      { error: "Lemon Squeezy did not return a checkout URL." },
      { status: 502 }
    );
  }

  if (req.headers.get("accept")?.includes("text/html")) {
    return NextResponse.redirect(checkoutUrl);
  }

  return NextResponse.json({ url: checkoutUrl });
}