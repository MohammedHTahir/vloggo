import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'

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
    
    const leonardoApiKey = Deno.env.get('LEONARDO_API_KEY');
    if (!leonardoApiKey) {
      console.error('LEONARDO_API_KEY not found in environment variables');
      throw new Error('LEONARDO_API_KEY not found in environment variables');
    }

    console.log('Leonardo AI API key found');

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
    const { imageUrl, leonardoImageId, prompt = "Transform this image into a cinematic video", duration = 5 } = body;
    console.log('Request payload:', { hasImageUrl: !!imageUrl, hasLeonardoId: !!leonardoImageId, prompt, duration });

    if (!leonardoImageId && !imageUrl) {
      console.error('No Leonardo image ID or image URL provided');
      return new Response(
        JSON.stringify({ error: 'Leonardo image ID or image URL is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Generating video for user ${user.id} with Leonardo image ID: ${leonardoImageId || 'from URL'}`);

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

    let finalLeonardoImageId = leonardoImageId;

    // If no Leonardo image ID provided, upload from URL using VEO3 workflow
    if (!finalLeonardoImageId && imageUrl) {
      console.log('Uploading image to Leonardo AI using VEO3 workflow...');
      
      // Fetch the image from Supabase storage
      const imageResponse = await fetch(imageUrl);
      if (!imageResponse.ok) {
        throw new Error('Failed to fetch image from storage');
      }
      
      const imageBuffer = await imageResponse.arrayBuffer();
      const contentType = imageResponse.headers.get('content-type') || 'image/jpeg';
      
      // Detect file extension from URL or Content-Type
      const cleanUrl = imageUrl.split('?')[0];
      let fileExtension = cleanUrl.includes('.') ? cleanUrl.split('.').pop()!.toLowerCase() : '';
      if (!fileExtension) {
        if (contentType.includes('jpeg')) fileExtension = 'jpg';
        else if (contentType.includes('png')) fileExtension = 'png';
        else if (contentType.includes('webp')) fileExtension = 'webp';
        else fileExtension = 'jpg';
      }
      
      // Step 1: Get presigned URL for uploading an image
      console.log('Step 1: Getting presigned URL...');
      const initResponse = await fetch('https://cloud.leonardo.ai/api/rest/v1/init-image', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${leonardoApiKey}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ extension: fileExtension })
      });
      
      if (!initResponse.ok) {
        const errorText = await initResponse.text();
        console.error('Leonardo AI init-image error:', errorText);
        throw new Error(`Failed to get presigned URL: ${initResponse.status} - ${errorText}`);
      }
      
      const initResult = await initResponse.json();
      console.log('Init response:', JSON.stringify(initResult, null, 2));
      
      if (!initResult.uploadInitImage?.fields || !initResult.uploadInitImage?.url || !initResult.uploadInitImage?.id) {
        throw new Error('Failed to get upload details from Leonardo AI');
      }
      
      // Step 2: Extract fields, URL, and image ID
      const fields = JSON.parse(initResult.uploadInitImage.fields);
      const uploadUrl = initResult.uploadInitImage.url;
      const imageId = initResult.uploadInitImage.id;
      
      console.log('Step 2: Extracted upload details, image ID:', imageId);
      
      // Step 3: Upload image via presigned URL (no auth headers)
      console.log('Step 3: Uploading image via presigned URL...');
      const uploadFormData = new FormData();
      
      // Add all fields from the presigned URL
      Object.entries(fields).forEach(([key, value]) => {
        uploadFormData.append(key, value as string);
      });
      
      // Add the file last
      uploadFormData.append('file', new Blob([imageBuffer], { type: contentType }), `image.${fileExtension}`);
      
      // Upload without authorization headers as per documentation
      const uploadResponse = await fetch(uploadUrl, {
        method: 'POST',
        body: uploadFormData
      });
      
      console.log('Upload response status:', uploadResponse.status);
      
      // VEO3 upload should return 204 success with no content
      if (uploadResponse.status !== 204) {
        const errorText = await uploadResponse.text();
        console.error('Leonardo AI upload error:', uploadResponse.status, errorText);
        throw new Error(`Failed to upload image: ${uploadResponse.status} - ${errorText}`);
      }
      
      finalLeonardoImageId = imageId;
      console.log('VEO3 upload successful, image ID:', finalLeonardoImageId);
    }

    // Now generate video with Motion 2.0 (image-to-video) using the uploaded image
    const leonardoRequest = {
      prompt,
      imageId: finalLeonardoImageId,
      imageType: "UPLOADED",
      resolution: "RESOLUTION_720",
      isPublic: false
    };

    console.log('Sending video generation request to Leonardo AI:', JSON.stringify(leonardoRequest, null, 2));

    // Call Leonardo AI video generation API
    const leonardoResponse = await fetch('https://cloud.leonardo.ai/api/rest/v1/generations-image-to-video', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${leonardoApiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(leonardoRequest)
    });

    if (!leonardoResponse.ok) {
      const errorText = await leonardoResponse.text();
      console.error('Leonardo AI API error:', errorText);
      throw new Error(`Leonardo AI API error: ${leonardoResponse.status} - ${errorText}`);
    }

    const leonardoResult = await leonardoResponse.json();
    console.log('Leonardo AI API response:', JSON.stringify(leonardoResult, null, 2));

    // Check if generation was created successfully - Leonardo AI returns motionVideoGenerationJob
    const generationJob = leonardoResult.motionVideoGenerationJob || leonardoResult.sdGenerationJob;
    if (!generationJob?.generationId) {
      console.error('No generation job found in response:', leonardoResult);
      throw new Error('Video generation failed - no generation job returned');
    }

    const generationJobId = generationJob.generationId;
    const apiCreditCost = generationJob.apiCreditCost || 0;
    console.log(`Generation job ID: ${generationJobId}, API cost: ${apiCreditCost} credits`);

    // Poll for completion (Leonardo AI is async)
    let videoUrl = null;
    let thumbnailUrl = null;
    let attempts = 0;
    const maxAttempts = 30; // 5 minutes max wait
    
    while (!videoUrl && attempts < maxAttempts) {
      attempts++;
      console.log(`Polling attempt ${attempts}/${maxAttempts}`);
      
      await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds
      
      // Check generation status
      const statusResponse = await fetch(`https://cloud.leonardo.ai/api/rest/v1/generations/${generationJobId}`, {
        headers: {
          'Authorization': `Bearer ${leonardoApiKey}`,
          'Accept': 'application/json'
        }
      });
      
      if (statusResponse.ok) {
        const statusResult = await statusResponse.json();
        console.log('Status check result:', JSON.stringify(statusResult, null, 2));
        
        const gen = statusResult.generations_by_pk;
        if (gen?.status === 'COMPLETE') {
          const fromVideos = gen?.generated_videos?.[0]?.url || null;
          const fromImages = gen?.generated_images?.[0]?.motionMP4URL || null;
          videoUrl = fromVideos || fromImages;
          thumbnailUrl = gen?.generated_images?.[0]?.url || null;
          if (videoUrl) {
            console.log('Video generation completed:', videoUrl);
            break;
          }
        } else if (gen?.status === 'FAILED') {
          throw new Error('Video generation failed on Leonardo AI');
        }

        console.log('Generation status:', statusResult.generations_by_pk?.status);
      }
    }

    if (!videoUrl) {
      throw new Error('Video generation timed out - please try again');
    }

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

    console.log(`Video generated successfully for user ${user.id}: ${videoUrl}`);

    // Save video to database
    const { error: saveError } = await supabase
      .from('videos')
      .insert({
        user_id: user.id,
        video_url: videoUrl,
        thumbnail_url: thumbnailUrl,
        prompt: prompt,
        duration: duration,
        generation_id: generationJobId,
        leonardo_image_id: finalLeonardoImageId
      });

    if (saveError) {
      console.error('Failed to save video to database:', saveError);
      // Don't fail the request if saving fails
    }

    return new Response(
      JSON.stringify({
        success: true,
        videoUrl: videoUrl,
        generationId: generationJobId,
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