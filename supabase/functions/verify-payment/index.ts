import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Initialize Supabase with service role to bypass RLS
    const supabaseService = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Public verification: use Stripe session metadata for user linkage
    const { session_id } = await req.json();
    if (!session_id) throw new Error("Session ID is required");

    console.log("Verifying payment for session:", session_id);

    // Initialize Stripe
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");
    
    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });

    // Retrieve the checkout session
    const session = await stripe.checkout.sessions.retrieve(session_id);
    console.log("Payment session status:", session.payment_status);

    if (session.payment_status === "paid") {
      const credits = parseInt(session.metadata?.credits || "0");
      const description = `Payment for ${credits} credits - Session ${session_id}`;
      const targetUserId = session.metadata?.user_id as string | undefined;
      if (!targetUserId) throw new Error("Missing user_id in Stripe session metadata");

      console.log(`Adding ${credits} credits to user ${targetUserId}`);

      // Use the database function to add credits and record transaction
      const { error: functionError } = await supabaseService.rpc('add_credits_with_transaction', {
        p_user_id: targetUserId,
        p_credits: credits,
        p_description: description,
        p_stripe_session_id: session_id
      });

      if (functionError) {
        console.error("Error calling add_credits_with_transaction:", functionError);
        throw new Error(`Failed to add credits: ${functionError.message}`);
      }

      console.log("Credits added successfully");

      return new Response(JSON.stringify({ 
        success: true, 
        credits_added: credits,
        message: "Payment verified and credits added"
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    } else {
      console.log("Payment not completed, status:", session.payment_status);
      return new Response(JSON.stringify({ 
        success: false, 
        message: "Payment not completed" 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }
  } catch (error) {
    console.error("Error in verify-payment:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});