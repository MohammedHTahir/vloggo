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
    console.log('Video generation webhook called');
    
    const body = await req.json();
    console.log('Webhook payload:', JSON.stringify(body, null, 2));

    const { id: predictionId, status, output, error } = body;

    if (!predictionId) {
      console.error('No prediction ID in webhook payload');
      return new Response(
        JSON.stringify({ error: 'No prediction ID provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client with service role key (no user auth required for webhooks)
    const supabaseUrl = 'https://fsrabyevssdxaglriclw.supabase.co';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZzcmFieWV2c3NkeGFnbHJpY2x3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NTMzMjgzNiwiZXhwIjoyMDcwOTA4ODM2fQ.YVf_JcNzXKDOZUOqjWbf0Tr-7_0Oe8LXSYLpbAiJRRE';
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Find the generation record - check both video and audio prediction IDs
    let { data: generation, error: generationError } = await supabase
      .from('video_generations')
      .select('*')
      .eq('prediction_id', predictionId)
      .single();

    // If not found by video prediction_id, try audio_prediction_id
    if (generationError || !generation) {
      const { data: audioGeneration, error: audioGenerationError } = await supabase
        .from('video_generations')
        .select('*')
        .eq('audio_prediction_id', predictionId)
        .single();
      
      if (!audioGenerationError && audioGeneration) {
        generation = audioGeneration;
        generationError = null;
      }
    }

    if (generationError || !generation) {
      console.error('Generation not found for prediction ID:', predictionId);
      return new Response(
        JSON.stringify({ error: 'Generation not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Found generation:', generation.id);

    if (status === 'succeeded' && output) {
      console.log('Generation succeeded, processing output...');
      
      // Get the video URL from output
      let videoUrl;
      if (typeof output === 'string') {
        videoUrl = output;
      } else if (output && typeof output === 'object' && output.video) {
        videoUrl = output.video;
      } else {
        console.error('Unexpected output format:', output);
        throw new Error('Unexpected output format from Replicate');
      }

      if (!videoUrl || !videoUrl.startsWith('http')) {
        console.error('Invalid video URL:', videoUrl);
        throw new Error('Invalid video URL from Replicate');
      }

      console.log('Video URL received:', videoUrl);

      // Check if this is an audio completion (prediction_id matches audio_prediction_id)
      const isAudioCompletion = generation.audio_prediction_id === predictionId;
      
      if (isAudioCompletion) {
        console.log('Audio generation completed, updating final video URL...');
        
        // Download and store final video with audio in Supabase storage
        let storageUrl = videoUrl; // Fallback to original URL
        
        try {
          console.log('Downloading final video with audio from Replicate...');
          const videoResponse = await fetch(videoUrl);
          if (!videoResponse.ok) {
            throw new Error(`Failed to download video: ${videoResponse.statusText}`);
          }
          
          const videoBlob = await videoResponse.blob();
          console.log('Final video downloaded, size:', videoBlob.size, 'bytes');
          
          // Generate unique filename
          const videoFileName = `video_${crypto.randomUUID()}.mp4`;
          const videoPath = `uploads/${generation.user_id}/${videoFileName}`;
          
          // Upload to Supabase storage
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('videos')
            .upload(videoPath, videoBlob, {
              contentType: 'video/mp4',
              upsert: false
            });
          
          if (uploadError) {
            console.error('Failed to upload final video to storage:', uploadError);
            throw new Error(`Storage upload failed: ${uploadError.message}`);
          }
          
          // Get public URL for the stored video
          const { data: { publicUrl } } = supabase.storage
            .from('videos')
            .getPublicUrl(videoPath);
          
          storageUrl = publicUrl;
          console.log('Final video successfully stored in Supabase storage:', storageUrl);
          
        } catch (storageError) {
          console.error('Failed to store final video in Supabase storage:', storageError);
          console.log('Falling back to Replicate URL');
        }

        // Update generation record with final completion
        const { error: updateGenerationError } = await supabase
          .from('video_generations')
          .update({
            status: 'completed',
            storage_url: storageUrl,
            completed_at: new Date().toISOString()
          })
          .eq('id', generation.id);

        if (updateGenerationError) {
          console.error('Failed to update generation record:', updateGenerationError);
        }

        // Save video to videos table
        const { error: saveVideoError } = await supabase
          .from('videos')
          .insert({
            user_id: generation.user_id,
            video_url: videoUrl,
            storage_url: storageUrl,
            thumbnail_url: generation.image_url,
            prompt: generation.prompt,
            duration: generation.duration,
            generation_id: generation.id
          });

        if (saveVideoError) {
          console.error('Failed to save video to database:', saveVideoError);
        }

        console.log('Video with audio generation completed successfully for user:', generation.user_id);
      } else {
        console.log('Video generation completed, updating status to adding_audio...');
        
        // This is the initial video completion, update status to adding_audio
        const { error: updateGenerationError } = await supabase
          .from('video_generations')
          .update({
            status: 'adding_audio',
            video_url: videoUrl,
            storage_url: videoUrl
          })
          .eq('id', generation.id);

        if (updateGenerationError) {
          console.error('Failed to update generation record:', updateGenerationError);
        }

        console.log('Video generation completed, now starting audio generation for user:', generation.user_id);
        
        // Start audio generation with the video URL
        try {
          const replicateApiKey = Deno.env.get('REPLICATE_API_TOKEN');
          if (!replicateApiKey) {
            throw new Error('REPLICATE_API_TOKEN not found');
          }

          // Create Replicate client for audio generation
          const { default: Replicate } = await import('https://esm.sh/replicate@0.29.4');
          const replicate = new Replicate({ auth: replicateApiKey });

          // Start audio generation
          const audioInput = {
            video: videoUrl,
            prompt: generation.prompt
          };

          console.log('Starting audio generation with input:', JSON.stringify(audioInput, null, 2));
          
          const audioPrediction = await replicate.predictions.create({
            model: "hunyuanvideo-community/hunyuanvideo-foley",
            input: audioInput
            // No webhook - we'll poll for completion instead
          });

          console.log('Audio prediction created:', audioPrediction.id);

          // Update the generation record with the audio prediction ID
          const { error: updateAudioPredictionError } = await supabase
            .from('video_generations')
            .update({
              audio_prediction_id: audioPrediction.id
            })
            .eq('id', generation.id);

          if (updateAudioPredictionError) {
            console.error('Failed to update audio prediction ID:', updateAudioPredictionError);
          }

        } catch (audioError) {
          console.error('Failed to start audio generation:', audioError);
          
          // If audio generation fails, mark the video as completed without audio
          const { error: fallbackUpdateError } = await supabase
            .from('video_generations')
            .update({
              status: 'completed',
              completed_at: new Date().toISOString()
            })
            .eq('id', generation.id);

          if (fallbackUpdateError) {
            console.error('Failed to update generation record as completed:', fallbackUpdateError);
          }

          // Save video to videos table without audio
          const { error: saveVideoError } = await supabase
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

          if (saveVideoError) {
            console.error('Failed to save video to database:', saveVideoError);
          }
        }
      }

    } else if (status === 'failed') {
      console.error('Video generation failed:', error);
      
      // Update generation record with failure
      const { error: updateGenerationError } = await supabase
        .from('video_generations')
        .update({
          status: 'failed',
          error_message: error?.message || 'Video generation failed',
          completed_at: new Date().toISOString()
        })
        .eq('id', generation.id);

      if (updateGenerationError) {
        console.error('Failed to update generation record with failure:', updateGenerationError);
      }

      // Refund the credit since generation failed
      const { error: refundError } = await supabase
        .from('profiles')
        .update({
          credits: supabase.raw('credits + 1')
        })
        .eq('id', generation.user_id);

      if (refundError) {
        console.error('Failed to refund credit:', refundError);
      }

    } else {
      console.log('Video generation status:', status);
    }

    return new Response(
      JSON.stringify({ success: true }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error) {
    console.error('Error in video generation webhook:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Webhook processing failed', 
        details: error.message 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});