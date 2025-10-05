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
    const { imageUrl, prompt = "A cinematic transformation of this image with dramatic movement and atmosphere", duration = 5 } = body;
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
    console.log('Sending video generation request to Replicate (wan-2.5-i2v with audio)...');

    const input = {
      image: imageUrl,
      prompt: prompt,
    };

    console.log('Replicate input:', JSON.stringify(input, null, 2));

    // Call Replicate API with error handling
    let output;
    try {
      console.log('Making Replicate API call to wan-video/wan-2.5-i2v...');
      output = await replicate.run("wan-video/wan-2.5-i2v", { input });
      console.log('Replicate API call completed');
      console.log('Replicate raw output type:', typeof output);
      console.log('Replicate raw output:', output);
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

    if (!output) {
      console.error('Replicate API error: No output returned');
      throw new Error('Video generation failed - no output returned');
    }

    // Extract video URL from output
    // The new wan-2.5 model returns an object with a url() method
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
        // Sometimes Replicate returns an array
        videoUrl = output[0];
        console.log('Video URL extracted from array:', videoUrl);
      } else {
        console.error('Replicate API error: Unexpected object format:', output);
        throw new Error('Video generation failed - unexpected output format');
      }
    } else {
      console.error('Replicate API error: Expected string or object but got:', typeof output, output);
      throw new Error('Video generation failed - unexpected output format');
    }

    // Validate that we got a proper URL
    if (!videoUrl || !videoUrl.startsWith('http')) {
      console.error('Replicate API error: Invalid video URL:', videoUrl);
      throw new Error('Video generation failed - invalid video URL returned');
    }

    console.log('Video generation completed successfully with audio:', videoUrl);

    // Download video from Replicate and store in our Supabase storage
    console.log('Downloading video from Replicate...');
    let storageUrl: string | null = null;
    
    try {
      // Download the video file
      console.log('Fetching video from:', videoUrl);
      const videoResponse = await fetch(videoUrl);
      if (!videoResponse.ok) {
        throw new Error(`Failed to download video: ${videoResponse.status} ${videoResponse.statusText}`);
      }
      
      const videoBlob = await videoResponse.blob();
      console.log('Video downloaded, size:', videoBlob.size, 'bytes', 'type:', videoBlob.type);
      
      // Generate unique filename
      const videoFileName = `video_${crypto.randomUUID()}.mp4`;
      const videoPath = `uploads/${user.id}/${videoFileName}`;
      
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
      // Don't fall back - we want to know if storage fails
      throw new Error(`Failed to store video in Supabase storage: ${storageError.message}`);
    }

    // Set thumbnail URL to the original image
    const thumbnailUrl = imageUrl;

    // Deduct credits and update stats
    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        credits: profile.credits - 1,
        videos_generated: (profile.videos_generated || 0) + 1,
        total_render_time: (profile.total_render_time || 0) + duration
      })
      .eq('id', user.id);

    if (updateError) {
      console.error('Failed to update user profile:', updateError);
      // Don't fail the request if profile update fails
    }

    console.log(`Video generated and stored successfully for user ${user.id}: ${storageUrl}`);

    // Save video to database with storage URL
    const generationId = crypto.randomUUID();
    const { error: saveError } = await supabase
      .from('videos')
      .insert({
        user_id: user.id,
        video_url: videoUrl, // Original Replicate URL for reference
        storage_url: storageUrl, // Our Supabase storage URL (this is what we'll use)
        thumbnail_url: thumbnailUrl,
        prompt: prompt,
        duration: duration,
        generation_id: generationId,
        leonardo_image_id: null
      });

    if (saveError) {
      console.error('Failed to save video to database:', saveError);
      throw new Error(`Failed to save video to database: ${saveError.message}`);
    }

    console.log('Video saved to database successfully');

    return new Response(
      JSON.stringify({
        success: true,
        videoUrl: storageUrl, // Return Supabase storage URL
        originalVideoUrl: videoUrl, // Original Replicate URL
        generationId: generationId,
        prompt: prompt,
        duration: duration,
        creditsRemaining: profile.credits - 1,
        hasAudio: true // Indicate that video includes native audio
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
