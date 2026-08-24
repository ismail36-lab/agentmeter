import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest, getSupabaseAdminClient } from "@/lib/supabase";

// Lemon Squeezy Customer Portal
// Fetches the customer's portal URL from Lemon Squeezy using their customer ID stored in profiles.
export async function POST(req: NextRequest) {
  // 1. Authenticate the requesting user
  const user = await getUserFromRequest(req);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Fetch the user's lemon_squeezy_customer_id from the profiles table (bypasses RLS)
  const supabaseAdmin = getSupabaseAdminClient();

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("lemon_squeezy_customer_id")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    console.error("Error fetching profile:", profileError);
    return NextResponse.json(
      { error: "Could not retrieve billing profile" },
      { status: 404 }
    );
  }

  const { lemon_squeezy_customer_id: customerId } = profile;

  if (!customerId) {
    return NextResponse.json(
      { error: "No Lemon Squeezy customer found for this user. Please complete a checkout first." },
      { status: 400 }
    );
  }

  // 3. Fetch Customer Portal URL from Lemon Squeezy API
  const lsApiKey = process.env.LEMONSQUEEZY_API_KEY;

  if (!lsApiKey) {
    return NextResponse.json({ error: "Lemon Squeezy API key not configured." }, { status: 500 });
  }

  try {
    const lsRes = await fetch(
      `https://api.lemonsqueezy.com/v1/customers/${customerId}`,
      {
        headers: {
          Accept: "application/vnd.api+json",
          Authorization: `Bearer ${lsApiKey}`,
        },
      }
    );

    if (!lsRes.ok) {
      const errText = await lsRes.text();
      console.error("Lemon Squeezy customer fetch failed:", lsRes.status, errText);
      return NextResponse.json(
        { error: "Failed to fetch customer portal URL" },
        { status: 502 }
      );
    }

    const lsData = await lsRes.json();
    // Lemon Squeezy returns the portal URL in data.attributes.urls.customer_portal
    const portalUrl: string | undefined = lsData?.data?.attributes?.urls?.customer_portal;

    if (!portalUrl) {
      return NextResponse.json(
        { error: "Customer portal URL not available" },
        { status: 404 }
      );
    }

    return NextResponse.json({ url: portalUrl }, { status: 200 });
  } catch (err: any) {
    console.error("Lemon Squeezy billing portal fetch failed:", err.message);
    return NextResponse.json(
      { error: `Failed to create billing portal session: ${err.message}` },
      { status: 500 }
    );
  }
}
