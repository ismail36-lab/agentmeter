import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

// Initialize Stripe SDK with Secret Key from Environment Variables
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2024-06-20" as any,
});

// Initialize Supabase Admin Client using SUPABASE_SERVICE_ROLE_KEY to bypass Row Level Security (RLS)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);

export async function POST(req: NextRequest) {
  // Read request body as text for Stripe webhook signature verification
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  // Edge Case: Missing webhook secret or Stripe signature header
  if (!signature || !webhookSecret) {
    console.error("Missing stripe-signature header or STRIPE_WEBHOOK_SECRET env variable.");
    return NextResponse.json(
      { error: "Missing webhook secret or signature" },
      { status: 400 }
    );
  }

  let event: Stripe.Event;

  // 1. Verify Event Signature using Stripe SDK
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err: any) {
    console.error(`Webhook signature verification failed: ${err.message}`);
    return NextResponse.json(
      { error: `Webhook signature verification failed: ${err.message}` },
      { status: 400 }
    );
  }

  // 2. Event Processing Logic
  try {
    switch (event.type) {
      // Event: Successful Checkout Session Completion
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;

        // Extract User ID (passed as client_reference_id), Customer ID, and Subscription ID
        const userId = session.client_reference_id;
        const customerId = session.customer as string;
        const subscriptionId = session.subscription as string;

        if (!userId) {
          console.warn("checkout.session.completed: Missing client_reference_id for user ID mapping.");
          break;
        }

        // Upsert 'profiles' table in Supabase bypassing RLS with Admin Client.
        // Uses upsert() so if no profile row exists yet for this user, one is created automatically.
        const { error } = await supabaseAdmin
          .from("profiles")
          .upsert({
            id: userId,
            stripe_customer_id: customerId,
            stripe_subscription_id: subscriptionId,
            plan: "pro",
            subscription_status: "active",
            updated_at: new Date().toISOString(),
          });

        if (error) {
          console.error("Error updating profile for checkout.session.completed:", error);
          return NextResponse.json(
            { error: "Database update failed" },
            { status: 500 }
          );
        }

        break;
      }

      // Event: Subscription Cancellation / Deletion
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;

        // Extract Subscription ID
        const subscriptionId = subscription.id;

        if (!subscriptionId) {
          console.warn("customer.subscription.deleted: Missing subscription ID.");
          break;
        }

        // Update 'profiles' table in Supabase to revoke pro plan and mark status as canceled
        const { error } = await supabaseAdmin
          .from("profiles")
          .update({
            plan: "free",
            subscription_status: "canceled",
          })
          .eq("stripe_subscription_id", subscriptionId);

        if (error) {
          console.error("Error updating profile for customer.subscription.deleted:", error);
          return NextResponse.json(
            { error: "Database update failed" },
            { status: 500 }
          );
        }

        break;
      }

      default:
        // Log unhandled events for monitoring
        console.log(`Unhandled Stripe event type: ${event.type}`);
    }

    // Acknowledge receipt of the webhook event to Stripe with HTTP 200
    return NextResponse.json({ received: true }, { status: 200 });
  } catch (err: any) {
    console.error("Unhandled server error while processing webhook:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
