import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'
import Replicate from "https://esm.sh/replicate@0.29.4"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface VideoGenerationRequest {
  imageUrl: string;
  prompt?: string;
  duration?: number;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Generate video function called');

    const replicateApiKey = Deno.env.get('REPLICATE_API_TOKEN');
    if (!replicateApiKey) {
      console.error('REPLICATE_API_TOKEN not found in environment variables');
      throw new Error('REPLICATE_API_TOKEN not found in environment variables');
    }

    console.log('Replicate API key found (length:', replicateApiKey.length + ')');

    // Initialize Replicate client
    const replicate = new Replicate({
      auth: replicateApiKey,
    });

    console.log('Replicate client initialized successfully');

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase credentials');
    }
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      global: {
        headers: { Authorization: req.headers.get('Authorization')! },
      },
    });

    // Get user from token
    console.log('Getting user from auth token');
    const authHeader = req.headers.get('Authorization') || '';
    const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!jwt) {
      console.error('Missing Authorization header or JWT');
      return new Response(
        JSON.stringify({ error: 'Authentication required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const { data: { user }, error: userError } = await supabase.auth.getUser(jwt);
    if (userError || !user) {
      console.error('Authentication error:', userError);
      return new Response(
        JSON.stringify({ error: 'Authentication required', details: userError?.message }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    console.log('User authenticated:', user.id);

    const body = await req.json();
    const { imageUrl, prompt = "A cinematic transformation with dramatic movement, atmosphere, and natural ambient audio", duration = 5 } = body;
    console.log('Request payload:', { imageUrl: imageUrl ? imageUrl.substring(0, 50) + '...' : null, prompt, duration });

    if (!imageUrl) {
      console.error('No image URL provided');
      return new Response(
        JSON.stringify({ error: 'Image URL is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate image URL format
    try {
      new URL(imageUrl);
    } catch {
      console.error('Invalid image URL format:', imageUrl);
      return new Response(
        JSON.stringify({ error: 'Invalid image URL format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Generating video for user ${user.id} with image URL: ${imageUrl}`);

    // Check user credits
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('credits, videos_generated, total_render_time')
      .eq('id', user.id)
      .single();

    if (profileError || !profile || profile.credits < 1) {
      console.error('Insufficient credits or profile error:', profileError);
      return new Response(
        JSON.stringify({ error: 'Insufficient credits. Please purchase more credits.' }),
        { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate video with Replicate using wan-video/wan-2.5-i2v model (with native audio!)
    console.log('Creating async prediction for wan-2.5-i2v with audio...');

    const input = {
      image: imageUrl,
      prompt: prompt,
    };

    console.log('Replicate input:', JSON.stringify(input, null, 2));

    // Build webhook URL
    const webhookUrl = `${supabaseUrl}/functions/v1/video-generation-webhook`;
    console.log('Webhook URL:', webhookUrl);

    // Create async prediction with webhook
    let prediction;
    try {
      console.log('Creating Replicate prediction for wan-video/wan-2.5-i2v...');
      
      prediction = await replicate.predictions.create({
        model: "wan-video/wan-2.5-i2v",
        input: input,
        webhook: webhookUrl,
        webhook_events_filter: ["completed"]
      });
      console.log('Replicate prediction created:', prediction.id);
    } catch (apiError: any) {
      console.error('Replicate API call failed:', apiError);
      console.error('API Error details:', JSON.stringify(apiError, null, 2));

      // Provide more specific error messages
      if (apiError.message?.includes('authentication')) {
        throw new Error('Replicate API authentication failed. Please check your API token.');
      } else if (apiError.message?.includes('model')) {
        throw new Error('Replicate model error. The wan-video/wan-2.5-i2v model may not be available.');
      } else if (apiError.message?.includes('input')) {
        throw new Error('Replicate input error. Please check the image URL and prompt format.');
      } else {
        throw new Error(`Replicate API error: ${apiError.message || 'Unknown error'}`);
      }
    }

    // Deduct credit from user's profile
    console.log('Deducting credit from user profile...');
    const { error: deductError } = await supabase
      .from('profiles')
      .update({
        credits: profile.credits - 1
      })
      .eq('id', user.id);

    if (deductError) {
      console.error('Failed to deduct credit:', deductError);
      return new Response(
        JSON.stringify({ error: 'Failed to deduct credit. Please try again.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Credit deducted successfully. Remaining credits:', profile.credits - 1);

    // Save the prediction to database for tracking
    const generationId = crypto.randomUUID();
    const { error: savePredictionError } = await supabase
      .from('video_generations')
      .insert({
        id: generationId,
        user_id: user.id,
        prediction_id: prediction.id,
        status: 'processing',
        image_url: imageUrl,
        prompt: prompt,
        duration: duration,
        created_at: new Date().toISOString()
      });

    if (savePredictionError) {
      console.error('Failed to save prediction to database:', savePredictionError);
      // Refund the credit since we couldn't save the generation
      await supabase
        .from('profiles')
        .update({
          credits: profile.credits
        })
        .eq('id', user.id);
      
      return new Response(
        JSON.stringify({ error: 'Failed to save generation record. Credit refunded.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Prediction saved to database with ID:', generationId);

    // Return immediately with generation ID for polling
    return new Response(
      JSON.stringify({
        success: true,
        generationId: generationId,
        predictionId: prediction.id,
        status: 'processing',
        message: 'Video generation with audio started. Webhook will process completion.',
        creditsRemaining: profile.credits - 1
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error: any) {
    console.error('Error in generate-video function:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Video generation failed', 
        details: error.message 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});
