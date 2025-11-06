import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'
import Replicate from "https://esm.sh/replicate@0.29.4"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Continue segment generation function called');

    const replicateApiKey = Deno.env.get('REPLICATE_API_TOKEN');
    if (!replicateApiKey) {
      throw new Error('REPLICATE_API_TOKEN not found');
    }

    const replicate = new Replicate({
      auth: replicateApiKey,
    });

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase credentials');
    }
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      global: {
        headers: { Authorization: req.headers.get('Authorization')! },
      },
    });

    // Get user from token
    const authHeader = req.headers.get('Authorization') || '';
    const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!jwt) {
      return new Response(
        JSON.stringify({ error: 'Authentication required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const { data: { user }, error: userError } = await supabase.auth.getUser(jwt);
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Authentication required', details: userError?.message }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json();
    const { parentGenerationId, segmentIndex, prompt, lastFrameUrl } = body;

    if (!parentGenerationId || segmentIndex === undefined || !prompt || !lastFrameUrl) {
      return new Response(
        JSON.stringify({ error: 'Parent generation ID, segment index, prompt, and last frame URL are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get parent generation
    const { data: parentGeneration } = await supabase
      .from('video_generations')
      .select('*')
      .eq('id', parentGenerationId)
      .eq('user_id', user.id)
      .single();

    if (!parentGeneration) {
      return new Response(
        JSON.stringify({ error: 'Parent generation not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get next segment details
    const { data: nextSegment } = await supabase
      .from('video_segments')
      .select('duration')
      .eq('parent_generation_id', parentGenerationId)
      .eq('segment_index', segmentIndex)
      .single();

    if (!nextSegment) {
      return new Response(
        JSON.stringify({ error: 'Next segment not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update segment prompt
    await supabase
      .from('video_segments')
      .update({ prompt: prompt })
      .eq('parent_generation_id', parentGenerationId)
      .eq('segment_index', segmentIndex);

    // Update parent generation status back to processing
    await supabase
      .from('video_generations')
      .update({
        status: 'processing'
      })
      .eq('id', parentGenerationId);

    // Generate video with Replicate
    const segmentType = nextSegment.duration === 6 ? 6 : 10;
    const input = {
      image: lastFrameUrl,
      prompt: prompt,
      duration: nextSegment.duration,
      resolution: "1080p",
      generate_audio: true
    };

    const webhookUrl = `${supabaseUrl}/functions/v1/video-generation-webhook`;

    const prediction = await replicate.predictions.create({
      model: "lightricks/ltx-2-fast",
      input: input,
      webhook: webhookUrl,
      webhook_events_filter: ["completed"]
    });

    // Create segment generation record
    const segmentGenerationId = crypto.randomUUID();
    await supabase.from('video_generations').insert({
      id: segmentGenerationId,
      user_id: user.id,
      prediction_id: prediction.id,
      status: 'processing',
      image_url: lastFrameUrl,
      prompt: prompt,
      duration: nextSegment.duration,
      is_segment: true,
      parent_generation_id: parentGenerationId,
      segment_index: segmentIndex,
      total_segments: parentGeneration.total_segments,
      created_at: new Date().toISOString()
    });

    console.log('Next segment generation started:', segmentGenerationId);

    return new Response(
      JSON.stringify({
        success: true,
        segmentGenerationId: segmentGenerationId,
        predictionId: prediction.id,
        status: 'processing',
        message: `Segment ${segmentIndex + 1} generation started`
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error: any) {
    console.error('Error in continue-segment-generation function:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Segment generation failed', 
        details: error.message 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});

