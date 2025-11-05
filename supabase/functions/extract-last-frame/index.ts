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
    console.log('Extract last frame function called');

    const body = await req.json();
    const { videoUrl } = body;

    if (!videoUrl) {
      return new Response(
        JSON.stringify({ error: 'Video URL is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase credentials');
    }
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user ID from request if available (for storage path)
    const authHeader = req.headers.get('Authorization') || '';
    const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    let userId: string | undefined;
    
    if (jwt) {
      const { data: { user } } = await supabase.auth.getUser(jwt);
      userId = user?.id;
    }

    console.log('Downloading video from:', videoUrl);

    // Download video
    const videoResponse = await fetch(videoUrl);
    if (!videoResponse.ok) {
      throw new Error(`Failed to download video: ${videoResponse.status}`);
    }

    const videoBlob = await videoResponse.blob();
    const videoArrayBuffer = await videoBlob.arrayBuffer();
    const videoBytes = new Uint8Array(videoArrayBuffer);

    console.log('Video downloaded, size:', videoBytes.length, 'bytes');

    // Create temporary video file
    const tempVideoPath = `/tmp/video_${crypto.randomUUID()}.mp4`;
    await Deno.writeFile(tempVideoPath, videoBytes);

    console.log('Temporary video file created:', tempVideoPath);

    // Extract last frame using FFmpeg
    // FFmpeg command: ffmpeg -i input.mp4 -vf "select=eq(n\,$(ffprobe -v error -select_streams v:0 -count_packets -show_entries stream=nb_frames -of csv=p=0 input.mp4))" -vframes 1 -y output.jpg
    // Simpler approach: ffmpeg -sseof -3 -i input.mp4 -vsync 0 -q:v 2 -update true output.jpg
    
    const tempFramePath = `/tmp/frame_${crypto.randomUUID()}.jpg`;
    
    try {
      // Use FFmpeg to extract last frame
      // Note: This requires FFmpeg to be available in the Deno environment
      // If FFmpeg is not available, we'll need to use an external service
      const ffmpegCommand = new Deno.Command('ffmpeg', {
        args: [
          '-sseof', '-3',
          '-i', tempVideoPath,
          '-vsync', '0',
          '-q:v', '2',
          '-update', 'true',
          '-frames:v', '1',
          '-y',
          tempFramePath
        ],
        stdout: 'piped',
        stderr: 'piped'
      });

      const ffmpegProcess = await ffmpegCommand.output();
      
      if (!ffmpegProcess.success) {
        const errorText = new TextDecoder().decode(ffmpegProcess.stderr);
        console.error('FFmpeg error:', errorText);
        
        // Fallback: Try alternative FFmpeg command
        const altCommand = new Deno.Command('ffmpeg', {
          args: [
            '-i', tempVideoPath,
            '-vf', 'select=eq(n\\, -1)',
            '-vframes', '1',
            '-y',
            tempFramePath
          ],
          stdout: 'piped',
          stderr: 'piped'
        });

        const altProcess = await altCommand.output();
        if (!altProcess.success) {
          const altErrorText = new TextDecoder().decode(altProcess.stderr);
          console.error('Alternative FFmpeg command also failed:', altErrorText);
          throw new Error('Failed to extract frame using FFmpeg. Please ensure FFmpeg is available or use an external service.');
        }
      }

      console.log('Frame extracted successfully');

      // Read the extracted frame
      const frameBytes = await Deno.readFile(tempFramePath);
      console.log('Frame file size:', frameBytes.length, 'bytes');

      // Upload frame to Supabase storage
      const frameFileName = `frame_${crypto.randomUUID()}.jpg`;
      const framePath = userId ? `frames/${userId}/${frameFileName}` : `frames/${frameFileName}`;

      console.log('Uploading frame to Supabase storage, path:', framePath);

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('images')
        .upload(framePath, frameBytes, {
          contentType: 'image/jpeg',
          upsert: false,
          cacheControl: '3600'
        });

      if (uploadError) {
        console.error('Failed to upload frame to storage:', uploadError);
        throw new Error(`Storage upload failed: ${uploadError.message}`);
      }

      console.log('Frame uploaded successfully:', uploadData);

      // Get public URL for the stored frame
      const { data: { publicUrl } } = supabase.storage
        .from('images')
        .getPublicUrl(framePath);

      // Clean up temporary files
      try {
        await Deno.remove(tempVideoPath);
        await Deno.remove(tempFramePath);
      } catch (cleanupError) {
        console.warn('Failed to clean up temporary files:', cleanupError);
      }

      console.log('Frame extraction completed successfully, URL:', publicUrl);

      return new Response(
        JSON.stringify({
          success: true,
          frameUrl: publicUrl,
          storagePath: framePath
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200
        }
      );

    } catch (ffmpegError: any) {
      console.error('FFmpeg processing error:', ffmpegError);
      
      // Clean up temporary files
      try {
        await Deno.remove(tempVideoPath);
        if (await Deno.stat(tempFramePath).catch(() => null)) {
          await Deno.remove(tempFramePath);
        }
      } catch (cleanupError) {
        console.warn('Failed to clean up temporary files:', cleanupError);
      }

      // If FFmpeg is not available, return error with suggestion to use external service
      return new Response(
        JSON.stringify({
          error: 'FFmpeg not available',
          details: 'FFmpeg is required for frame extraction. Please configure FFmpeg in the environment or use an external FFmpeg service.',
          fallback: 'Consider using Cloudinary Transform API or similar service for frame extraction'
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500
        }
      );
    }

  } catch (error: any) {
    console.error('Error in extract-last-frame function:', error);
    return new Response(
      JSON.stringify({
        error: 'Frame extraction failed',
        details: error.message
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});

