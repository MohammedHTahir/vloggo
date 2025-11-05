import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
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
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase credentials');
    }
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Find the generation record
    const { data: generation, error: generationError } = await supabase
      .from('video_generations')
      .select('*')
      .eq('prediction_id', predictionId)
      .single();

    if (generationError || !generation) {
      console.error('Generation not found for prediction ID:', predictionId);
      return new Response(
        JSON.stringify({ error: 'Generation not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Found generation:', generation.id);

    if (status === 'succeeded' && output) {
      console.log('Video generation succeeded with native audio!');
      
      // Extract video URL from output
      let videoUrl: string;
      
      if (typeof output === 'string') {
        // Direct string URL
        videoUrl = output;
        console.log('Video URL received as string:', videoUrl);
      } else if (output && typeof output === 'object') {
        // Object with url() method or url property
        if (typeof output.url === 'function') {
          videoUrl = output.url();
          console.log('Video URL extracted via url() method:', videoUrl);
        } else if (typeof output.url === 'string') {
          videoUrl = output.url;
          console.log('Video URL extracted from url property:', videoUrl);
        } else if (Array.isArray(output) && output.length > 0) {
          videoUrl = output[0];
          console.log('Video URL extracted from array:', videoUrl);
        } else {
          console.error('Unexpected output format:', output);
          throw new Error('Unexpected output format from Replicate');
        }
      } else {
        console.error('Unexpected output type:', typeof output);
        throw new Error('Unexpected output type from Replicate');
      }

      if (!videoUrl || !videoUrl.startsWith('http')) {
        console.error('Invalid video URL:', videoUrl);
        throw new Error('Invalid video URL from Replicate');
      }

      console.log('Video URL with audio:', videoUrl);

      // Download and store video in Supabase storage
      let storageUrl = videoUrl; // Fallback to original URL
      
      try {
        console.log('Downloading video with audio from Replicate...');
        const videoResponse = await fetch(videoUrl);
        if (!videoResponse.ok) {
          throw new Error(`Failed to download video: ${videoResponse.status} ${videoResponse.statusText}`);
        }
        
        const videoBlob = await videoResponse.blob();
        console.log('Video downloaded, size:', videoBlob.size, 'bytes');
        
        // Generate unique filename
        const videoFileName = `video_${crypto.randomUUID()}.mp4`;
        const videoPath = `uploads/${generation.user_id}/${videoFileName}`;
        
        console.log('Uploading to Supabase storage, path:', videoPath);
        
        // Upload to Supabase storage
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('videos')
          .upload(videoPath, videoBlob, {
            contentType: 'video/mp4',
            upsert: false,
            cacheControl: '3600'
          });
        
        if (uploadError) {
          console.error('Failed to upload video to storage:', uploadError);
          throw new Error(`Storage upload failed: ${uploadError.message}`);
        }
        
        console.log('Upload successful:', uploadData);
        
        // Get public URL for the stored video
        const { data: { publicUrl } } = supabase.storage
          .from('videos')
          .getPublicUrl(videoPath);
        
        storageUrl = publicUrl;
        console.log('Video successfully stored in Supabase storage:', storageUrl);

      } catch (storageError: any) {
        console.error('Failed to store video in Supabase storage:', storageError);
        console.error('Storage error details:', storageError.message);
        console.log('Falling back to Replicate URL');
        // Continue with original Replicate URL if storage fails
      }

      // Check if this is a segment of a multi-segment generation
      if (generation.is_segment && generation.parent_generation_id) {
        console.log('Processing segment completion for multi-segment generation');
        
        // Update segment generation record
        const { error: updateSegmentError } = await supabase
          .from('video_generations')
          .update({
            status: 'completed',
            video_url: videoUrl,
            storage_url: storageUrl,
            completed_at: new Date().toISOString()
          })
          .eq('id', generation.id);

        if (updateSegmentError) {
          console.error('Failed to update segment generation record:', updateSegmentError);
        }

        // Update segment record in video_segments table
        await supabase
          .from('video_segments')
          .update({
            video_url: videoUrl,
            storage_url: storageUrl,
            completed_at: new Date().toISOString()
          })
          .eq('parent_generation_id', generation.parent_generation_id)
          .eq('segment_index', generation.segment_index);

        // Get parent generation
        const { data: parentGeneration } = await supabase
          .from('video_generations')
          .select('*')
          .eq('id', generation.parent_generation_id)
          .single();

        if (!parentGeneration) {
          console.error('Parent generation not found');
          return new Response(
            JSON.stringify({ error: 'Parent generation not found' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Increment segments_completed
        const segmentsCompleted = (parentGeneration.segments_completed || 0) + 1;
        const totalSegments = parentGeneration.total_segments || 1;

        const { error: updateParentError } = await supabase
          .from('video_generations')
          .update({
            segments_completed: segmentsCompleted
          })
          .eq('id', parentGeneration.id);

        if (updateParentError) {
          console.error('Failed to update parent generation:', updateParentError);
        }

        console.log(`Segment ${segmentsCompleted}/${totalSegments} completed`);

        // Check if more segments remain
        if (segmentsCompleted < totalSegments) {
          console.log('Triggering next segment generation...');
          
          try {
            // Get all previous prompts for context
            const { data: previousSegments } = await supabase
              .from('video_segments')
              .select('prompt')
              .eq('parent_generation_id', parentGeneration.id)
              .order('segment_index', { ascending: true });

            const previousPrompts = previousSegments?.map(s => s.prompt).filter(Boolean) || [];

            // Extract last frame from completed segment
            const extractFrameResponse = await fetch(`${supabaseUrl}/functions/v1/extract-last-frame`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${supabaseServiceKey}`
              },
              body: JSON.stringify({
                videoUrl: storageUrl
              })
            });

            if (!extractFrameResponse.ok) {
              throw new Error('Failed to extract last frame');
            }

            const extractFrameData = await extractFrameResponse.json();
            const nextImageUrl = extractFrameData.frameUrl;

            console.log('Last frame extracted:', nextImageUrl);

            // Generate continuation prompt
            const continuationPromptResponse = await fetch(`${supabaseUrl}/functions/v1/generate-prompt-continuation`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${supabaseServiceKey}`
              },
              body: JSON.stringify({
                originalPrompt: parentGeneration.prompt,
                segmentIndex: segmentsCompleted,
                previousPrompts: previousPrompts
              })
            });

            if (!continuationPromptResponse.ok) {
              throw new Error('Failed to generate continuation prompt');
            }

            const continuationPromptData = await continuationPromptResponse.json();
            const nextPrompt = continuationPromptData.continuationPrompt;

            console.log('Continuation prompt generated:', nextPrompt);

            // Get next segment duration
            const { data: nextSegment } = await supabase
              .from('video_segments')
              .select('duration')
              .eq('parent_generation_id', parentGeneration.id)
              .eq('segment_index', segmentsCompleted)
              .single();

            if (!nextSegment) {
              throw new Error('Next segment not found');
            }

            // Update segment prompt
            await supabase
              .from('video_segments')
              .update({ prompt: nextPrompt })
              .eq('parent_generation_id', parentGeneration.id)
              .eq('segment_index', segmentsCompleted);

            // Trigger next segment generation
            // Determine segmentType from segment duration (all segments in a generation use the same type)
            const segmentType = nextSegment.duration === 6 ? 6 : 10;
            
            const generateSegmentResponse = await fetch(`${supabaseUrl}/functions/v1/generate-video`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${supabaseServiceKey}`
              },
              body: JSON.stringify({
                imageUrl: nextImageUrl,
                prompt: nextPrompt,
                duration: nextSegment.duration,
                segmentType: segmentType,
                parentGenerationId: parentGeneration.id,
                segmentIndex: segmentsCompleted,
                isSegment: true
              })
            });

            if (!generateSegmentResponse.ok) {
              throw new Error('Failed to trigger next segment generation');
            }

            console.log('Next segment generation triggered successfully');

          } catch (segmentError: any) {
            console.error('Error triggering next segment:', segmentError);
            // Mark parent generation as failed
            await supabase
              .from('video_generations')
              .update({
                status: 'failed',
                error_message: `Failed to generate segment ${segmentsCompleted + 1}: ${segmentError.message}`
              })
              .eq('id', parentGeneration.id);
          }

        } else {
          // All segments completed, stitch them together
          console.log('All segments completed, stitching videos...');

          // Update parent generation status to stitching
          await supabase
            .from('video_generations')
            .update({
              status: 'stitching'
            })
            .eq('id', parentGeneration.id);

          // Get all segment storage URLs
          const { data: allSegments } = await supabase
            .from('video_segments')
            .select('storage_url')
            .eq('parent_generation_id', parentGeneration.id)
            .order('segment_index', { ascending: true });

          if (!allSegments || allSegments.length === 0) {
            throw new Error('No segments found for stitching');
          }

          const segmentUrls = allSegments.map(s => s.storage_url).filter(Boolean) as string[];

          console.log(`Stitching ${segmentUrls.length} segments...`);

          // Call stitch-videos function
          const stitchResponse = await fetch(`${supabaseUrl}/functions/v1/stitch-videos`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseServiceKey}`
            },
            body: JSON.stringify({
              videoUrls: segmentUrls,
              parentGenerationId: parentGeneration.id
            })
          });

          if (!stitchResponse.ok) {
            throw new Error('Failed to stitch videos');
          }

          const stitchData = await stitchResponse.json();
          const stitchedVideoUrl = stitchData.stitchedVideoUrl;
          const stitchedStorageUrl = stitchData.storagePath;

          console.log('Videos stitched successfully:', stitchedVideoUrl);

          // Update parent generation with stitched video
          await supabase
            .from('video_generations')
            .update({
              status: 'completed',
              stitched_video_url: stitchedVideoUrl,
              stitched_storage_url: stitchedStorageUrl,
              completed_at: new Date().toISOString()
            })
            .eq('id', parentGeneration.id);

          // Update user stats
          const { data: profileData } = await supabase
            .from('profiles')
            .select('videos_generated, total_render_time')
            .eq('id', parentGeneration.user_id)
            .single();

          await supabase
            .from('profiles')
            .update({
              videos_generated: (profileData?.videos_generated || 0) + 1,
              total_render_time: (profileData?.total_render_time || 0) + (parentGeneration.duration || 0)
            })
            .eq('id', parentGeneration.user_id);

          // Save final stitched video to videos table
          await supabase.from('videos').insert({
            user_id: parentGeneration.user_id,
            video_url: stitchedVideoUrl,
            storage_url: stitchedStorageUrl,
            thumbnail_url: parentGeneration.image_url,
            prompt: parentGeneration.prompt,
            duration: parentGeneration.duration,
            generation_id: parentGeneration.id
          });

          console.log('Multi-segment video completed successfully');
        }

      } else {
        // Single segment video - existing behavior
        console.log('Processing single segment video completion');

        // Update generation record to completed
        const { error: updateGenerationError } = await supabase
          .from('video_generations')
          .update({
            status: 'completed',
            video_url: videoUrl,
            storage_url: storageUrl,
            completed_at: new Date().toISOString()
          })
          .eq('id', generation.id);

        if (updateGenerationError) {
          console.error('Failed to update generation record:', updateGenerationError);
        }

        // Update user stats - fetch current values first
        const { data: profileData } = await supabase
          .from('profiles')
          .select('videos_generated, total_render_time')
          .eq('id', generation.user_id)
          .single();

        const { error: updateStatsError } = await supabase
          .from('profiles')
          .update({
            videos_generated: (profileData?.videos_generated || 0) + 1,
            total_render_time: (profileData?.total_render_time || 0) + (generation.duration === 6 ? 6 : generation.duration || 10)
          })
          .eq('id', generation.user_id);

        if (updateStatsError) {
          console.error('Failed to update user stats:', updateStatsError);
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

        console.log('Video with audio completed successfully for user:', generation.user_id);
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

      // Refund the credits since generation failed
      const { data: profileData } = await supabase
        .from('profiles')
        .select('credits')
        .eq('id', generation.user_id)
        .single();

      // Calculate credit cost based on duration
      const creditCost = generation.duration === 6 ? 1 : 2;

      const { error: refundError } = await supabase
        .from('profiles')
        .update({
          credits: (profileData?.credits || 0) + creditCost
        })
        .eq('id', generation.user_id);

      if (refundError) {
        console.error('Failed to refund credits:', refundError);
      }

      console.log(`${creditCost} credit${creditCost > 1 ? 's' : ''} refunded for failed generation`);

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

  } catch (error: any) {
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
