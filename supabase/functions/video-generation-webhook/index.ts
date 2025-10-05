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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
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
        if (typeof (output as any).url === 'function') {
          videoUrl = (output as any).url();
          console.log('Video URL extracted via url() method:', videoUrl);
        } else if (typeof (output as any).url === 'string') {
          videoUrl = (output as any).url;
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

      // Update user stats
      const { error: updateStatsError } = await supabase
        .from('profiles')
        .update({
          videos_generated: supabase.raw('COALESCE(videos_generated, 0) + 1'),
          total_render_time: supabase.raw(`COALESCE(total_render_time, 0) + ${generation.duration || 5}`)
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

      console.log('Credit refunded for failed generation');

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
