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
    const { imageUrl, prompt = "A cinematic transformation with dramatic movement, atmosphere, and natural ambient audio", duration = 6, parentGenerationId, segmentIndex, isSegment, segmentType = 6 } = body;
    console.log('Request payload:', { imageUrl: imageUrl ? imageUrl.substring(0, 50) + '...' : null, prompt, duration, parentGenerationId, segmentIndex, isSegment, segmentType });

    if (!imageUrl) {
      console.error('No image URL provided');
      return new Response(
        JSON.stringify({ error: 'Image URL is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate duration (6 to 240 seconds)
    if (duration < 6 || duration > 240) {
      console.error('Invalid duration:', duration);
      return new Response(
        JSON.stringify({ error: 'Duration must be between 6 and 240 seconds' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Calculate segments and credit cost based on segment type
    function calculateSegments(duration: number, segType: 6 | 10): { segments: number[], creditCost: number } {
      const segments: number[] = [];
      const segmentCount = Math.ceil(duration / segType);
      
      // Add segments (all segments use the same duration)
      for (let i = 0; i < segmentCount; i++) {
        segments.push(segType);
      }
      
      const creditCost = segments.reduce((sum, seg) => sum + (seg === 6 ? 1 : 2), 0);
      return { segments, creditCost };
    }

    // Use segmentType from request, or default based on duration if not provided (for backward compatibility)
    const finalSegmentType = segmentType || (duration <= 6 ? 6 : 10);
    const isMultiSegment = duration > finalSegmentType && !isSegment;
    const { segments, creditCost } = isMultiSegment ? calculateSegments(duration, finalSegmentType) : { segments: [duration], creditCost: duration === 6 ? 1 : 2 };
    
    console.log(`Duration: ${duration}s, Is multi-segment: ${isMultiSegment}, Segments: ${segments.join(',')}s, Credit cost: ${creditCost}`);

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

    if (profileError || !profile || profile.credits < creditCost) {
      console.error('Insufficient credits or profile error:', profileError);
      return new Response(
        JSON.stringify({ error: `Insufficient credits. You need ${creditCost} credit${creditCost > 1 ? 's' : ''} for a ${duration}-second video (${segments.length} segment${segments.length > 1 ? 's' : ''}). Please purchase more credits.` }),
        { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Determine segment duration (for multi-segment, use first segment; for single segment, use duration)
    const segmentDuration = isSegment ? duration : segments[0];

    // Generate video with Replicate using lightricks/ltx-2-fast model
    console.log('Creating async prediction for lightricks/ltx-2-fast...');

    const input = {
      image: imageUrl,
      prompt: prompt,
      duration: segmentDuration,
      resolution: "1080p",
      generate_audio: true
    };

    console.log('Replicate input:', JSON.stringify(input, null, 2));

    // Build webhook URL
    const webhookUrl = `${supabaseUrl}/functions/v1/video-generation-webhook`;
    console.log('Webhook URL:', webhookUrl);

    // Create async prediction with webhook
    let prediction;
    try {
      console.log('Creating video...');
      
      prediction = await replicate.predictions.create({
        model: "lightricks/ltx-2-fast",
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
        throw new Error('Replicate model error. The lightricks/ltx-2-fast model may not be available.');
      } else if (apiError.message?.includes('input')) {
        throw new Error('Replicate input error. Please check the image URL and prompt format.');
      } else {
        throw new Error(`Replicate API error: ${apiError.message || 'Unknown error'}`);
      }
    }

    // Handle multi-segment generation
    if (isMultiSegment) {
      console.log('Creating multi-segment generation...');
      
      // Create parent generation record
      const parentGenerationId = crypto.randomUUID();
      const { error: saveParentError } = await supabase
        .from('video_generations')
        .insert({
          id: parentGenerationId,
          user_id: user.id,
          prediction_id: prediction.id,
          status: 'processing',
          image_url: imageUrl,
          prompt: prompt,
          duration: duration,
          is_segment: false,
          total_segments: segments.length,
          segments_completed: 0,
          created_at: new Date().toISOString()
        });

      if (saveParentError) {
        console.error('Failed to save parent generation:', saveParentError);
        return new Response(
          JSON.stringify({ error: `Failed to save generation record.` }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Deduct all credits upfront
      console.log(`Deducting ${creditCost} credit${creditCost > 1 ? 's' : ''} from user profile...`);
      const { error: deductError } = await supabase
        .from('profiles')
        .update({
          credits: profile.credits - creditCost
        })
        .eq('id', user.id);

      if (deductError) {
        console.error('Failed to deduct credits:', deductError);
        // Delete parent generation
        await supabase.from('video_generations').delete().eq('id', parentGenerationId);
        return new Response(
          JSON.stringify({ error: 'Failed to deduct credits. Please try again.' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Create segment records
      let firstSegmentGenerationId: string | null = null;
      for (let i = 0; i < segments.length; i++) {
        const segmentGenerationId = crypto.randomUUID();
        
        // Create segment generation record (first segment uses actual prediction, others will be created later)
        if (i === 0) {
          firstSegmentGenerationId = segmentGenerationId;
          const { error: saveSegmentError } = await supabase
            .from('video_generations')
            .insert({
              id: segmentGenerationId,
              user_id: user.id,
              prediction_id: prediction.id,
              status: 'processing',
              image_url: imageUrl,
              prompt: prompt,
              duration: segments[i],
              is_segment: true,
              parent_generation_id: parentGenerationId,
              segment_index: i,
              total_segments: segments.length,
              created_at: new Date().toISOString()
            });

          if (saveSegmentError) {
            console.error('Failed to save segment generation:', saveSegmentError);
            // Refund credits and cleanup
            await supabase.from('profiles').update({ credits: profile.credits }).eq('id', user.id);
            await supabase.from('video_generations').delete().eq('id', parentGenerationId);
            return new Response(
              JSON.stringify({ error: 'Failed to save segment record.' }),
              { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }

          // Create segment record in video_segments table
          await supabase.from('video_segments').insert({
            parent_generation_id: parentGenerationId,
            segment_index: i,
            prompt: prompt,
            duration: segments[i]
          });
        } else {
          // Create placeholder segment records for remaining segments
          await supabase.from('video_segments').insert({
            parent_generation_id: parentGenerationId,
            segment_index: i,
            prompt: '', // Will be generated later
            duration: segments[i]
          });
        }
      }

      console.log('Multi-segment generation created, parent ID:', parentGenerationId);

      return new Response(
        JSON.stringify({
          success: true,
          generationId: parentGenerationId,
          segmentGenerationId: firstSegmentGenerationId,
          predictionId: prediction.id,
          status: 'processing',
          message: `${duration}-second video generation started (${segments.length} segment${segments.length > 1 ? 's' : ''}). Webhook will process completion.`,
          creditsUsed: creditCost,
          creditsRemaining: profile.credits - creditCost,
          totalSegments: segments.length,
          isMultiSegment: true
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200
        }
      );
    }

    // Handle single segment or subsequent segment generation
    const generationId = parentGenerationId || crypto.randomUUID();
    const { error: savePredictionError } = await supabase
      .from('video_generations')
      .insert({
        id: generationId,
        user_id: user.id,
        prediction_id: prediction.id,
        status: 'processing',
        image_url: imageUrl,
        prompt: prompt,
        duration: segmentDuration,
        is_segment: isSegment || false,
        parent_generation_id: parentGenerationId || null,
        segment_index: segmentIndex !== undefined ? segmentIndex : null,
        total_segments: isSegment && parentGenerationId ? null : 1,
        created_at: new Date().toISOString()
      });

    if (savePredictionError) {
      console.error('Failed to save prediction to database:', savePredictionError);
      // Only refund if this is not a segment (segments already deducted credits)
      if (!isSegment) {
        await supabase
          .from('profiles')
          .update({
            credits: profile.credits
          })
          .eq('id', user.id);
        
        return new Response(
          JSON.stringify({ error: `Failed to save generation record. ${creditCost} credit${creditCost > 1 ? 's' : ''} refunded.` }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } else {
        return new Response(
          JSON.stringify({ error: 'Failed to save segment record.' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Deduct credits only for single-segment (multi-segment already deducted)
    if (!isSegment) {
      console.log(`Deducting ${creditCost} credit${creditCost > 1 ? 's' : ''} from user profile...`);
      const { error: deductError } = await supabase
        .from('profiles')
        .update({
          credits: profile.credits - creditCost
        })
        .eq('id', user.id);

      if (deductError) {
        console.error('Failed to deduct credits:', deductError);
        await supabase.from('video_generations').delete().eq('id', generationId);
        return new Response(
          JSON.stringify({ error: 'Failed to deduct credits. Please try again.' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log(`Credits deducted successfully. Remaining credits: ${profile.credits - creditCost}`);
    }

    console.log('Prediction saved to database with ID:', generationId);

    // Return immediately with generation ID for polling
    return new Response(
      JSON.stringify({
        success: true,
        generationId: generationId,
        predictionId: prediction.id,
        status: 'processing',
        message: `${segmentDuration}-second video generation with audio started. Webhook will process completion.`,
        creditsUsed: isSegment ? 0 : creditCost,
        creditsRemaining: isSegment ? profile.credits : profile.credits - creditCost,
        isSegment: isSegment || false
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
