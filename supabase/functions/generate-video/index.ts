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

    // Call Replicate API with error handling
    let output;
    try {
      console.log('Making Replicate API call to wan-video/wan-2.2-i2v-fast...');
      output = await replicate.run("wan-video/wan-2.2-i2v-fast", { input });
      console.log('Replicate API call completed');
      console.log('Replicate raw output type:', typeof output);
      console.log('Replicate raw output:', JSON.stringify(output, null, 2));
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

    if (!output) {
      console.error('Replicate API error: No output returned');
      throw new Error('Video generation failed - no output returned');
    }

    // According to wan model schema, output should be a simple string URI
    let videoUrl;
    if (typeof output === 'string') {
      videoUrl = output;
      console.log('Video URL received as string:', videoUrl);
    } else {
      console.error('Replicate API error: Expected string output but got:', typeof output, output);
      throw new Error('Video generation failed - unexpected output format (expected string URI)');
    }

    // Validate that we got a proper URL
    if (!videoUrl || !videoUrl.startsWith('http')) {
      console.error('Replicate API error: Invalid video URL:', videoUrl);
      throw new Error('Video generation failed - invalid video URL returned');
    }

    console.log('Video generation completed successfully:', videoUrl);

    // Download video from Replicate and store in our Supabase storage
    console.log('Downloading video from Replicate...');
    let storageUrl = videoUrl; // Fallback to original URL if storage fails
    
    try {
      // Download the video file
      const videoResponse = await fetch(videoUrl);
      if (!videoResponse.ok) {
        throw new Error(`Failed to download video: ${videoResponse.statusText}`);
      }
      
      const videoBlob = await videoResponse.blob();
      console.log('Video downloaded, size:', videoBlob.size, 'bytes');
      
      // Generate unique filename
      const videoFileName = `video_${crypto.randomUUID()}.mp4`;
      const videoPath = `uploads/${user.id}/${videoFileName}`;
      
      // Upload to Supabase storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('videos')
        .upload(videoPath, videoBlob, {
          contentType: 'video/mp4',
          upsert: false
        });
      
      if (uploadError) {
        console.error('Failed to upload video to storage:', uploadError);
        throw new Error(`Storage upload failed: ${uploadError.message}`);
      }
      
      // Get public URL for the stored video
      const { data: { publicUrl } } = supabase.storage
        .from('videos')
        .getPublicUrl(videoPath);
      
      storageUrl = publicUrl;
      console.log('Video successfully stored in Supabase storage:', storageUrl);
      
    } catch (storageError) {
      console.error('Failed to store video in Supabase storage:', storageError);
      console.log('Falling back to Replicate URL for now');
      // Continue with original Replicate URL if storage fails
    }

    // Set thumbnail URL to the original image (Replicate doesn't provide separate thumbnails)
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

    console.log(`Video generated successfully for user ${user.id}: ${storageUrl}`);

    // Save video to database with both URLs
    const { error: saveError } = await supabase
      .from('videos')
      .insert({
        user_id: user.id,
        video_url: videoUrl, // Keep original Replicate URL for reference
        storage_url: storageUrl, // Our Supabase storage URL
        thumbnail_url: thumbnailUrl,
        prompt: prompt,
        duration: duration,
        generation_id: crypto.randomUUID(), // Generate a unique ID for tracking
        leonardo_image_id: null // No longer needed with Replicate
      });

    if (saveError) {
      console.error('Failed to save video to database:', saveError);
      // Don't fail the request if saving fails
    }

    return new Response(
      JSON.stringify({
        success: true,
        videoUrl: storageUrl, // Return our stored video URL
        originalVideoUrl: videoUrl, // Keep original for reference
        generationId: crypto.randomUUID(), // Generate a unique ID for the response
        prompt: prompt,
        duration: duration,
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