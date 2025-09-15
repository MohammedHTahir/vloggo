import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'

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
    console.log('Check video status function called');

    // Initialize Supabase client
    const supabaseUrl = 'https://fsrabyevssdxaglriclw.supabase.co';
    const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZzcmFieWV2c3NkeGFnbHJpY2x3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUzMzI4MzYsImV4cCI6MjA3MDkwODgzNn0.7AGyjAJZSnwQIVF3UZCP_7m_73_-5ba6kin1E1VsecQ';
    
    const supabase = createClient(supabaseUrl, supabaseKey, {
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
    const replicate = new Replicate({ auth: replicateApiKey });

    // Check video generation status if still processing
    if (generation.status === 'processing' && generation.prediction_id) {
      console.log('Checking video prediction status:', generation.prediction_id);
      
      try {
        const videoPrediction = await replicate.predictions.get(generation.prediction_id);
        console.log('Video prediction status:', videoPrediction.status);

        if (videoPrediction.status === 'succeeded' && videoPrediction.output) {
          console.log('Video generation completed, starting audio generation...');
          
          const videoUrl = typeof videoPrediction.output === 'string' 
            ? videoPrediction.output 
            : videoPrediction.output.video || videoPrediction.output;

          // Update to adding_audio status
          await supabase
            .from('video_generations')
            .update({
              status: 'adding_audio',
              video_url: videoUrl,
              storage_url: videoUrl
            })
            .eq('id', generation.id);

          // Start audio generation
          const audioInput = {
            video: videoUrl,
            prompt: generation.prompt
          };

          const audioPrediction = await replicate.predictions.create({
            model: "hunyuanvideo-community/hunyuanvideo-foley",
            input: audioInput
          });

          // Update with audio prediction ID
          await supabase
            .from('video_generations')
            .update({
              audio_prediction_id: audioPrediction.id
            })
            .eq('id', generation.id);

          console.log('Audio generation started:', audioPrediction.id);

          return new Response(
            JSON.stringify({
              success: true,
              generationId: generation.id,
              status: 'adding_audio',
              videoUrl: videoUrl,
              errorMessage: null,
              createdAt: generation.created_at,
              completedAt: null
            }),
            {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              status: 200
            }
          );

        } else if (videoPrediction.status === 'failed') {
          console.log('Video generation failed');
          
          await supabase
            .from('video_generations')
            .update({
              status: 'failed',
              error_message: videoPrediction.error?.message || 'Video generation failed',
              completed_at: new Date().toISOString()
            })
            .eq('id', generation.id);

          // Refund credit
          await supabase
            .from('profiles')
            .update({
              credits: supabase.raw('credits + 1')
            })
            .eq('id', generation.user_id);

          return new Response(
            JSON.stringify({
              success: true,
              generationId: generation.id,
              status: 'failed',
              videoUrl: null,
              errorMessage: videoPrediction.error?.message || 'Video generation failed',
              createdAt: generation.created_at,
              completedAt: new Date().toISOString()
            }),
            {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              status: 200
            }
          );
        }
      } catch (error) {
        console.error('Error checking video prediction:', error);
      }
    }

    // Check audio generation status if adding_audio
    if (generation.status === 'adding_audio') {
      // If no audio prediction ID yet, start audio generation
      if (!generation.audio_prediction_id && generation.video_url) {
        console.log('Starting audio generation for completed video...');
        
        try {
          const audioInput = {
            video: generation.video_url,
            prompt: generation.prompt
          };

          const audioPrediction = await replicate.predictions.create({
            model: "hunyuanvideo-community/hunyuanvideo-foley",
            input: audioInput
          });

          // Update with audio prediction ID
          await supabase
            .from('video_generations')
            .update({
              audio_prediction_id: audioPrediction.id
            })
            .eq('id', generation.id);

          console.log('Audio generation started:', audioPrediction.id);

          return new Response(
            JSON.stringify({
              success: true,
              generationId: generation.id,
              status: 'adding_audio',
              videoUrl: generation.video_url,
              errorMessage: null,
              createdAt: generation.created_at,
              completedAt: null
            }),
            {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              status: 200
            }
          );
        } catch (error) {
          console.error('Failed to start audio generation:', error);
          
          // Complete without audio if audio generation fails to start
          await supabase
            .from('video_generations')
            .update({
              status: 'completed',
              completed_at: new Date().toISOString()
            })
            .eq('id', generation.id);

          // Save video without audio
          await supabase
            .from('videos')
            .insert({
              user_id: generation.user_id,
              video_url: generation.video_url,
              storage_url: generation.video_url,
              thumbnail_url: generation.image_url,
              prompt: generation.prompt,
              duration: generation.duration,
              generation_id: generation.id
            });

          return new Response(
            JSON.stringify({
              success: true,
              generationId: generation.id,
              status: 'completed',
              videoUrl: generation.video_url,
              errorMessage: 'Failed to start audio generation, video completed without audio',
              createdAt: generation.created_at,
              completedAt: new Date().toISOString()
            }),
            {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              status: 200
            }
          );
        }
      }
      
      // If we have audio prediction ID, check its status
      if (generation.audio_prediction_id) {
        console.log('Checking audio prediction status:', generation.audio_prediction_id);
      
        try {
          const audioPrediction = await replicate.predictions.get(generation.audio_prediction_id);
          console.log('Audio prediction status:', audioPrediction.status);

          if (audioPrediction.status === 'succeeded' && audioPrediction.output) {
            console.log('Audio generation completed, finalizing...');
            
            const finalVideoUrl = typeof audioPrediction.output === 'string' 
              ? audioPrediction.output 
              : audioPrediction.output.video || audioPrediction.output;

            // Update to completed status
            await supabase
              .from('video_generations')
              .update({
                status: 'completed',
                storage_url: finalVideoUrl,
                completed_at: new Date().toISOString()
              })
              .eq('id', generation.id);

            // Save to videos table
            await supabase
              .from('videos')
              .insert({
                user_id: generation.user_id,
                video_url: finalVideoUrl,
                storage_url: finalVideoUrl,
                thumbnail_url: generation.image_url,
                prompt: generation.prompt,
                duration: generation.duration,
                generation_id: generation.id
              });

            console.log('Generation completed successfully');

            return new Response(
              JSON.stringify({
                success: true,
                generationId: generation.id,
                status: 'completed',
                videoUrl: finalVideoUrl,
                errorMessage: null,
                createdAt: generation.created_at,
                completedAt: new Date().toISOString()
              }),
              {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200
              }
            );

          } else if (audioPrediction.status === 'failed') {
            console.log('Audio generation failed, completing without audio');
            
            await supabase
              .from('video_generations')
              .update({
                status: 'completed',
                completed_at: new Date().toISOString()
              })
              .eq('id', generation.id);

            // Save video without audio
            const videoUrl = generation.storage_url || generation.video_url;
            await supabase
            .from('videos')
            .insert({
              user_id: generation.user_id,
              video_url: videoUrl,
              storage_url: videoUrl,
              thumbnail_url: generation.image_url,
              prompt: generation.prompt,
              duration: generation.duration,
              generation_id: generation.id
            });

          return new Response(
            JSON.stringify({
              success: true,
              generationId: generation.id,
              status: 'completed',
              videoUrl: videoUrl,
              errorMessage: 'Audio generation failed, video completed without audio',
              createdAt: generation.created_at,
              completedAt: new Date().toISOString()
            }),
            {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              status: 200
            }
          );
        }
      } catch (error) {
        console.error('Error checking audio prediction:', error);
      }
    }

    // Return current status if no updates
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

  } catch (error) {
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
