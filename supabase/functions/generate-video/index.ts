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
    const supabaseUrl = 'https://fsrabyevssdxaglriclw.supabase.co';
    const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZzcmFieWV2c3NkeGFnbHJpY2x3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUzMzI4MzYsImV4cCI6MjA3MDkwODgzNn0.7AGyjAJZSnwQIVF3UZCP_7m_73_-5ba6kin1E1VsecQ';
    
    const supabase = createClient(supabaseUrl, supabaseKey, {
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
    const { imageUrl, prompt = "Transform this image into a cinematic video", duration = 5 } = body;
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
      .select('credits')
      .eq('id', user.id)
      .single();

    if (profileError || !profile || profile.credits < 1) {
      console.error('Insufficient credits or profile error:', profileError);
      return new Response(
        JSON.stringify({ error: 'Insufficient credits. Please purchase more credits.' }),
        { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate video with Replicate using wan-video/wan-2.2-i2v-fast model
    console.log('Sending video generation request to Replicate...');

    const input = {
      image: imageUrl,
      prompt: prompt,
      go_fast: true, // Use fast mode for better performance
      num_frames: 81, // Recommended for best results
      resolution: "720p", // Higher resolution
      frames_per_second: 16, // Standard frame rate
    };

    console.log('Replicate input:', JSON.stringify(input, null, 2));

    // Call Replicate API with error handling - using predictions for async processing
    let prediction;
    try {
      console.log('Creating Replicate prediction for wan-video/wan-2.2-i2v-fast...');
      
      // Build webhook URL with secret token
      const WEBHOOK_BASE_URL = Deno.env.get("SUPABASE_URL") || "https://fsrabyevssdxaglriclw.supabase.co";
      const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET") || "your-secret-key-here";
      const webhookWan = `${WEBHOOK_BASE_URL}/functions/v1/video-pipeline-webhook?stage=wan&token=${WEBHOOK_SECRET}`;
      
        prediction = await replicate.predictions.create({
        model: "wan-video/wan-2.2-i2v-fast",
        input: input,
        webhook: webhookWan,
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
        throw new Error('Replicate model error. The wan-video/wan-2.2-i2v-fast model may not be available.');
      } else if (apiError.message?.includes('input')) {
        throw new Error('Replicate input error. Please check the image URL and prompt format.');
      } else {
        throw new Error(`Replicate API error: ${apiError.message || 'Unknown error'}`);
      }
    }

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
      // Don't fail the request if saving fails
    }

    // Return immediately with generation ID for polling
    return new Response(
      JSON.stringify({
        success: true,
        generationId: generationId,
        predictionId: prediction.id,
        status: 'processing',
        message: 'Video generation started. Please check back in a few minutes.',
        creditsRemaining: profile.credits - 1
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error) {
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