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
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { searchParams } = new URL(req.url);
  let plan = searchParams.get("plan") || "pro";

  if (req.method === "POST") {
    try {
      const body = await req.json();
      if (body?.plan) plan = body.plan;
    } catch {}
  }

  const requestedPlan = String(plan).toLowerCase();

  // If user is authenticated, optimistically upgrade plan in metadata as a fast-path
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

  // ── Lemon Squeezy Checkout ──────────────────────────────────────────────────
  const lsApiKey = process.env.LEMONSQUEEZY_API_KEY;
  const lsStoreId = process.env.LEMONSQUEEZY_STORE_ID;
  const lsVariantId = process.env.LEMONSQUEEZY_PRO_VARIANT_ID;

  if (lsApiKey && lsStoreId && lsVariantId) {
    try {
      const domain = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;

      const lsPayload = {
        data: {
          type: "checkouts",
          attributes: {
            checkout_data: {
              // Attach authenticated user ID so the webhook can map back to Supabase
              custom: {
                ...(user?.id ? { user_id: user.id } : {}),
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

      const lsRes = await fetch("https://api.lemonsqueezy.com/v1/checkouts", {
        method: "POST",
        headers: {
          Accept: "application/vnd.api+json",
          "Content-Type": "application/vnd.api+json",
          Authorization: `Bearer ${lsApiKey}`,
        },
        body: JSON.stringify(lsPayload),
      });

      if (lsRes.ok) {
        const lsData = await lsRes.json();
        const checkoutUrl = lsData?.data?.attributes?.url;

        if (checkoutUrl) {
          if (req.headers.get("accept")?.includes("text/html")) {
            return NextResponse.redirect(checkoutUrl);
          }
          return NextResponse.json({ url: checkoutUrl });
        }
      } else {
        const errBody = await lsRes.text();
        console.warn("Lemon Squeezy Checkout Error:", lsRes.status, errBody);
      }
    } catch (err) {
      console.warn("Lemon Squeezy Checkout Error, falling back to dashboard redirect:", err);
    }
  }

  // ── Sandbox / Default Fallback Redirect ────────────────────────────────────
  const redirectUrl = user
    ? `/dashboard?checkout=success&plan=${requestedPlan}`
    : `/login?plan=${requestedPlan}&checkout=pending`;

  if (req.headers.get("accept")?.includes("text/html") || req.method === "GET") {
    return NextResponse.redirect(new URL(redirectUrl, req.url));
  }

  return NextResponse.json({ url: redirectUrl });
}
