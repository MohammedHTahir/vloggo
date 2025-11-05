import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Custom UUID generation function for Deno compatibility
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : r & 0x3 | 0x8;
    return v.toString(16);
  });
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Check video status function called');

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

    const body = await req.json();
    const { generationId } = body;

    if (!generationId) {
      return new Response(
        JSON.stringify({ error: 'Generation ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get the generation record
    const { data: generation, error: generationError } = await supabase
      .from('video_generations')
      .select('*')
      .eq('id', generationId)
      .eq('user_id', user.id)
      .single();

    if (generationError || !generation) {
      console.error('Generation not found:', generationError);
      return new Response(
        JSON.stringify({ error: 'Generation not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Generation status:', generation.status);

    // Check if this is a multi-segment generation
    if (generation.is_segment === false && generation.total_segments && generation.total_segments > 1) {
      // Get segment progress
      const { data: segments } = await supabase
        .from('video_segments')
        .select('segment_index, completed_at')
        .eq('parent_generation_id', generation.id)
        .order('segment_index', { ascending: true });

      const segmentsCompleted = segments?.filter(s => s.completed_at).length || 0;
      const totalSegments = generation.total_segments || 1;

      // If generation is already completed, return immediately
      if (generation.status === 'completed') {
        return new Response(
          JSON.stringify({
            success: true,
            generationId: generation.id,
            status: generation.status,
            videoUrl: generation.stitched_storage_url || generation.stitched_video_url || generation.storage_url || generation.video_url,
            errorMessage: generation.error_message,
            createdAt: generation.created_at,
            completedAt: generation.completed_at,
            isMultiSegment: true,
            segmentsCompleted: segmentsCompleted,
            totalSegments: totalSegments,
            isStitching: false
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200
          }
        );
      }

      // If generation is failed, return immediately
      if (generation.status === 'failed') {
        return new Response(
          JSON.stringify({
            success: true,
            generationId: generation.id,
            status: generation.status,
            videoUrl: generation.stitched_storage_url || generation.stitched_video_url || null,
            errorMessage: generation.error_message,
            createdAt: generation.created_at,
            completedAt: generation.completed_at,
            isMultiSegment: true,
            segmentsCompleted: segmentsCompleted,
            totalSegments: totalSegments,
            isStitching: false
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200
          }
        );
      }

      // Determine video URL (use stitched video if available, otherwise null)
      let videoUrl = generation.stitched_storage_url || generation.stitched_video_url || null;

      return new Response(
        JSON.stringify({
          success: true,
          generationId: generation.id,
          status: generation.status,
          videoUrl: videoUrl,
          errorMessage: generation.error_message,
          createdAt: generation.created_at,
          completedAt: generation.completed_at,
          isMultiSegment: true,
          segmentsCompleted: segmentsCompleted,
          totalSegments: totalSegments,
          currentSegment: generation.status === 'stitching' ? null : segmentsCompleted + 1,
          isStitching: generation.status === 'stitching'
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200
        }
      );
    }

    // Single segment or segment itself - return current status
    // For segments, return parent generation info if available
    if (generation.is_segment && generation.parent_generation_id) {
      const { data: parentGeneration } = await supabase
        .from('video_generations')
        .select('*')
        .eq('id', generation.parent_generation_id)
        .single();

      if (parentGeneration) {
        const { data: segments } = await supabase
          .from('video_segments')
          .select('segment_index, completed_at')
          .eq('parent_generation_id', parentGeneration.id)
          .order('segment_index', { ascending: true });

        const segmentsCompleted = segments?.filter(s => s.completed_at).length || 0;
        const totalSegments = parentGeneration.total_segments || 1;

        return new Response(
          JSON.stringify({
            success: true,
            generationId: parentGeneration.id,
            status: parentGeneration.status,
            videoUrl: parentGeneration.stitched_storage_url || parentGeneration.stitched_video_url || parentGeneration.storage_url || parentGeneration.video_url,
            errorMessage: parentGeneration.error_message,
            createdAt: parentGeneration.created_at,
            completedAt: parentGeneration.completed_at,
            isMultiSegment: true,
            segmentsCompleted: segmentsCompleted,
            totalSegments: totalSegments,
            currentSegment: parentGeneration.status === 'stitching' ? null : segmentsCompleted + 1,
            isStitching: parentGeneration.status === 'stitching'
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200
          }
        );
      }
    }

    // If generation is already completed, return immediately
    if (generation.status === 'completed') {
      return new Response(
        JSON.stringify({
          success: true,
          generationId: generation.id,
          status: generation.status,
          videoUrl: generation.storage_url || generation.video_url,
          errorMessage: generation.error_message,
          createdAt: generation.created_at,
          completedAt: generation.completed_at
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200
        }
      );
    }

    // If generation is failed, return immediately
    if (generation.status === 'failed') {
      return new Response(
        JSON.stringify({
          success: true,
          generationId: generation.id,
          status: generation.status,
          videoUrl: generation.storage_url || generation.video_url,
          errorMessage: generation.error_message,
          createdAt: generation.created_at,
          completedAt: generation.completed_at
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200
        }
      );
    }

    // Initialize Replicate client for status checking
    const replicateApiKey = Deno.env.get('REPLICATE_API_TOKEN');
    if (!replicateApiKey) {
      console.error('REPLICATE_API_TOKEN not found');
      return new Response(
        JSON.stringify({
          success: true,
          generationId: generation.id,
          status: generation.status,
          videoUrl: generation.storage_url || generation.video_url,
          errorMessage: generation.error_message,
          createdAt: generation.created_at,
          completedAt: generation.completed_at
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200
        }
      );
    }

    const { default: Replicate } = await import('https://esm.sh/replicate@0.29.4');
    const replicate = new Replicate({
      auth: replicateApiKey
    });

    // Check video generation status if still processing
    if (generation.status === 'processing' && generation.prediction_id) {
      console.log('Checking video prediction status:', generation.prediction_id);

      try {
        const videoPrediction = await replicate.predictions.get(generation.prediction_id);
        console.log('Video prediction status:', videoPrediction.status);

        if (videoPrediction.status === 'succeeded' && videoPrediction.output) {
          console.log('Video with native audio completed!');

          let videoUrl: string;
          if (typeof videoPrediction.output === 'string') {
            videoUrl = videoPrediction.output;
          } else if (videoPrediction.output && typeof videoPrediction.output === 'object') {
            videoUrl = (videoPrediction.output as any).video || videoPrediction.output as any;
          } else {
            videoUrl = videoPrediction.output as any;
          }

          // Download and store the video with native audio
          let storageUrl = videoUrl;

          try {
            console.log('Downloading video with native audio...');
            const videoResponse = await fetch(videoUrl);

            if (videoResponse.ok) {
              const videoBlob = await videoResponse.blob();
              console.log('Video downloaded, size:', videoBlob.size, 'bytes');

              const videoFileName = `video_${generateUUID()}.mp4`;
              const videoPath = `uploads/${generation.user_id}/${videoFileName}`;

              console.log('Uploading video to storage, path:', videoPath);

              const { data: uploadData, error: uploadError } = await supabase.storage
                .from('videos')
                .upload(videoPath, videoBlob, {
                  contentType: 'video/mp4',
                  upsert: false,
                  cacheControl: '3600'
                });

              if (!uploadError) {
                const { data: { publicUrl } } = supabase.storage
                  .from('videos')
                  .getPublicUrl(videoPath);

                storageUrl = publicUrl;
                console.log('Video successfully stored:', storageUrl);
              } else {
                console.error('Failed to upload video:', uploadError);
              }
            }
          } catch (storageError) {
            console.error('Failed to store video:', storageError);
          }

          // Update generation record to completed
          await supabase.from('video_generations').update({
            status: 'completed',
            video_url: videoUrl,
            storage_url: storageUrl,
            completed_at: new Date().toISOString()
          }).eq('id', generation.id);

          // Update user stats
          const { data: profileData } = await supabase
            .from('profiles')
            .select('videos_generated, total_render_time')
            .eq('id', generation.user_id)
            .single();

          await supabase.from('profiles').update({
            videos_generated: (profileData?.videos_generated || 0) + 1,
            total_render_time: (profileData?.total_render_time || 0) + (generation.duration === 6 ? 6 : generation.duration || 10)
          }).eq('id', generation.user_id);

          // Save video to videos table
          await supabase.from('videos').insert({
            user_id: generation.user_id,
            video_url: videoUrl,
            storage_url: storageUrl,
            thumbnail_url: generation.image_url,
            prompt: generation.prompt,
            duration: generation.duration,
            generation_id: generation.id
          });

          console.log('Video with native audio completed successfully for user:', generation.user_id);

          return new Response(
            JSON.stringify({
              success: true,
              generationId: generation.id,
              status: 'completed',
              videoUrl: storageUrl,
              message: 'Video with native audio completed!'
            }),
            {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              status: 200
            }
          );
        } else if (videoPrediction.status === 'failed') {
          console.error('Video generation failed:', videoPrediction.error);

          // Update generation record with failure
          await supabase.from('video_generations').update({
            status: 'failed',
            error_message: videoPrediction.error?.message || 'Video generation failed',
            completed_at: new Date().toISOString()
          }).eq('id', generation.id);

          return new Response(
            JSON.stringify({
              success: true,
              generationId: generation.id,
              status: 'failed',
              error: videoPrediction.error?.message || 'Video generation failed'
            }),
            {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              status: 200
            }
          );
        } else {
          console.log('Video generation still processing...');

          return new Response(
            JSON.stringify({
              success: true,
              generationId: generation.id,
              status: 'processing',
              message: 'Video generation in progress...'
            }),
            {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              status: 200
            }
          );
        }
      } catch (error) {
        console.error('Error checking video prediction:', error);

        return new Response(
          JSON.stringify({
            success: true,
            generationId: generation.id,
            status: generation.status,
            error: 'Failed to check video status'
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200
          }
        );
      }
    }

    // Return current status
    return new Response(
      JSON.stringify({
        success: true,
        generationId: generation.id,
        status: generation.status,
        videoUrl: generation.storage_url || generation.video_url,
        errorMessage: generation.error_message,
        createdAt: generation.created_at,
        completedAt: generation.completed_at
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error: any) {
    console.error('Error in check video status function:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Status check failed', 
        details: error.message 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});
