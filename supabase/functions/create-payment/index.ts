import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PaymentRequest {
  credits: number;
  amount: number; // in cents
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Create Supabase client using the anon key for user authentication
  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? ""
  );

  try {
    // Retrieve authenticated user
    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    const { data } = await supabaseClient.auth.getUser(token);
    const user = data.user;
    if (!user?.email) throw new Error("User not authenticated or email not available");

    console.log("Creating payment for user:", user.email);

    // Get request body and resolve origin robustly
    const body = await req.json();
    const credits: number = body.credits;
    const amount: number = body.amount;
    const originFromBody: string | undefined = body.origin;

    if (!credits || !amount) {
      throw new Error("Credits and amount are required");
    }

    // Resolve origin from body, headers, or referer as fallback
    let origin = originFromBody || req.headers.get("origin") || "";
    const referer = req.headers.get("referer") || "";
    if (!origin && referer) {
      try { origin = new URL(referer).origin; } catch (_e) { /* ignore */ }
    }
    if (!origin) {
      const xfh = req.headers.get("x-forwarded-host");
      const xfp = req.headers.get("x-forwarded-proto") || "https";
      if (xfh) origin = `${xfp}://${xfh}`;
    }

    // Initialize Stripe
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
    console.log("Checking Stripe secret key...", stripeSecretKey ? "Found" : "Not found");
    
    if (!stripeSecretKey) {
      console.error("STRIPE_SECRET_KEY environment variable is not set");
      throw new Error("STRIPE_SECRET_KEY environment variable is not set");
    }
    
    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: "2023-10-16",
    });

    // Check if a Stripe customer record exists for this user
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    let customerId;
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
    }

    console.log("Customer ID:", customerId);

    // Create a one-time payment session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      customer_email: customerId ? undefined : user.email,
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: { 
              name: `${credits} Credits`,
              description: `Purchase ${credits} credits for AI video generation`
            },
            unit_amount: amount,
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${origin}/payment-success?session_id={CHECKOUT_SESSION_ID}&credits=${credits}`,
      cancel_url: `${origin}/dashboard`,
      metadata: {
        user_id: user.id,
        credits: credits.toString(),
      },
    });

    console.log("Payment session created:", session.id);

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("Error in create-payment:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});