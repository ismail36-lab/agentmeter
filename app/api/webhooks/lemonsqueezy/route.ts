import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

/**
 * LemonSqueezy Webhook Payload Type Definitions
 */
export interface LemonSqueezyPayload {
  meta?: {
    event_name?: string;
    custom_data?: {
      user_id?: string;
      userId?: string;
      user_email?: string;
      email?: string;
      [key: string]: unknown;
    };
  };
  data?: {
    id?: string | number;
    type?: string;
    attributes?: {
      store_id?: number;
      customer_id?: number | string;
      order_id?: number;
      user_email?: string;
      customer_email?: string;
      user_name?: string;
      status?: string;
      status_formatted?: string;
      ends_at?: string | null;
      renews_at?: string | null;
      created_at?: string;
      updated_at?: string;
      [key: string]: unknown;
    };
  };
}

/**
 * Verify LemonSqueezy signature using SHA-256 HMAC timing-safe comparison.
 */
function verifySignature(rawBody: string, signature: string, secret: string): boolean {
  if (!signature || !secret || !rawBody) return false;
  try {
    const hmac = crypto.createHmac("sha256", secret);
    const digest = Buffer.from(hmac.update(rawBody).digest("hex"), "utf8");
    const signatureBuffer = Buffer.from(signature, "utf8");

    if (digest.length !== signatureBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(digest, signatureBuffer);
  } catch (error) {
    console.error("Error calculating timing-safe signature verification:", error);
    return false;
  }
}

/**
 * POST handler for LemonSqueezy Webhooks
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
    if (!secret) {
      console.error("LEMONSQUEEZY_WEBHOOK_SECRET environment variable is missing.");
      return NextResponse.json(
        { error: "LEMONSQUEEZY_WEBHOOK_SECRET is not configured on the server" },
        { status: 500 }
      );
    }

    const signature = req.headers.get("x-signature") || req.headers.get("X-Signature");
    if (!signature) {
      console.error("Missing x-signature header on LemonSqueezy webhook request.");
      return NextResponse.json(
        { error: "Missing x-signature header" },
        { status: 400 }
      );
    }

    const rawBody = await req.text();
    if (!rawBody) {
      console.error("Empty payload body received in LemonSqueezy webhook.");
      return NextResponse.json(
        { error: "Empty request body" },
        { status: 400 }
      );
    }

    const isValidSignature = verifySignature(rawBody, signature, secret);
    if (!isValidSignature) {
      console.error("LemonSqueezy webhook signature verification failed.");
      return NextResponse.json(
        { error: "Invalid x-signature header verification failed" },
        { status: 401 }
      );
    }

    let payload: LemonSqueezyPayload;
    try {
      payload = JSON.parse(rawBody);
    } catch (parseErr) {
      console.error("Failed to parse LemonSqueezy webhook JSON payload:", parseErr);
      return NextResponse.json(
        { error: "Invalid JSON payload" },
        { status: 400 }
      );
    }

    const eventName = payload.meta?.event_name;
    if (!eventName) {
      console.warn("LemonSqueezy webhook payload missing meta.event_name.");
      return NextResponse.json(
        { message: "Ignored: Missing meta.event_name" },
        { status: 200 }
      );
    }

    const customData = payload.meta?.custom_data ?? {};
    const attributes = payload.data?.attributes ?? {};

    // Extract user identification (user_email or custom_data.user_id)
    const userId = customData.user_id || customData.userId;
    const userEmail =
      attributes.user_email ||
      attributes.customer_email ||
      customData.user_email ||
      customData.email;

    if (!userId && !userEmail) {
      console.warn(
        `LemonSqueezy webhook [${eventName}]: No user_id or user_email identified in payload.`
      );
      return NextResponse.json(
        { message: "Ignored: User identifier (user_id / user_email) not found" },
        { status: 200 }
      );
    }

    // Connect to Supabase using @supabase/supabase-js with service role key
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variable.");
      return NextResponse.json(
        { error: "Supabase service role configuration error" },
        { status: 500 }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    // Resolve target Supabase user ID
    let targetUserId: string | null = userId ? String(userId) : null;

    if (!targetUserId && userEmail) {
      // Look up user profile by email
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("email", userEmail)
        .maybeSingle();

      if (profile?.id) {
        targetUserId = profile.id;
      } else {
        // Fallback: Query Supabase Auth Admin API
        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.listUsers();
        if (!authError && authData?.users) {
          const matchedUser = authData.users.find(
            (u) => u.email?.toLowerCase() === userEmail.toLowerCase()
          );
          if (matchedUser?.id) {
            targetUserId = matchedUser.id;
          }
        }
      }
    }

    if (!targetUserId) {
      console.warn(
        `LemonSqueezy webhook [${eventName}]: Could not resolve Supabase user ID for email: ${userEmail}`
      );
      return NextResponse.json(
        { message: `User record not found for email ${userEmail}` },
        { status: 200 }
      );
    }

    const customerId = attributes.customer_id ? String(attributes.customer_id) : null;
    const subscriptionId = payload.data?.id ? String(payload.data.id) : null;

    // Handle supported event types
    switch (eventName) {
      case "order_created":
      case "subscription_created":
      case "subscription_updated": {
        const subStatus = (attributes.status ?? "").toLowerCase();
        const isActive =
          subStatus === "active" ||
          subStatus === "on_trial" ||
          eventName === "order_created";

        const profileUpdate: Record<string, unknown> = {
          id: targetUserId,
          plan: isActive ? "pro" : "free",
          subscription_status: isActive ? "active" : subStatus || "inactive",
          updated_at: new Date().toISOString(),
        };

        if (customerId) profileUpdate.lemon_squeezy_customer_id = customerId;
        if (subscriptionId) profileUpdate.lemon_squeezy_subscription_id = subscriptionId;

        const { error: dbError } = await supabaseAdmin
          .from("profiles")
          .upsert(profileUpdate);

        if (dbError) {
          console.error(
            `Supabase error updating profile for [${eventName}]:`,
            dbError.message
          );
          return NextResponse.json(
            { error: "Database update failed", details: dbError.message },
            { status: 500 }
          );
        }

        console.log(
          `LemonSqueezy webhook [${eventName}]: User ${targetUserId} successfully updated (plan=pro, subscription_status=active).`
        );
        break;
      }

      case "subscription_cancelled":
      case "subscription_expired": {
        const subStatus = eventName === "subscription_cancelled" ? "canceled" : "expired";

        const { error: dbError } = await supabaseAdmin
          .from("profiles")
          .update({
            plan: "free",
            subscription_status: subStatus,
            updated_at: new Date().toISOString(),
          })
          .eq("id", targetUserId);

        if (dbError) {
          console.error(
            `Supabase error updating profile for [${eventName}]:`,
            dbError.message
          );
          return NextResponse.json(
            { error: "Database update failed", details: dbError.message },
            { status: 500 }
          );
        }

        console.log(
          `LemonSqueezy webhook [${eventName}]: User ${targetUserId} reverted to plan=free, status=${subStatus}.`
        );
        break;
      }

      default: {
        console.log(`LemonSqueezy webhook event [${eventName}] acknowledged.`);
        break;
      }
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (err: any) {
    console.error("Unhandled error processing LemonSqueezy webhook:", err);
    return NextResponse.json(
      { error: "Internal Server Error", details: err?.message },
      { status: 500 }
    );
  }
}
