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
    console.log('Stitch videos function called');

    const body = await req.json();
    const { videoUrls, parentGenerationId } = body;

    if (!videoUrls || !Array.isArray(videoUrls) || videoUrls.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Video URLs array is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!parentGenerationId) {
      return new Response(
        JSON.stringify({ error: 'Parent generation ID is required' }),
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

    // Get user ID from parent generation
    const { data: parentGeneration } = await supabase
      .from('video_generations')
      .select('user_id')
      .eq('id', parentGenerationId)
      .single();

    if (!parentGeneration) {
      throw new Error('Parent generation not found');
    }

    const userId = parentGeneration.user_id;

    console.log(`Stitching ${videoUrls.length} videos for user ${userId}`);

    // Download all videos
    const tempVideoPaths: string[] = [];
    const tempFiles: string[] = [];

    try {
      for (let i = 0; i < videoUrls.length; i++) {
        const videoUrl = videoUrls[i];
        console.log(`Downloading video ${i + 1}/${videoUrls.length}:`, videoUrl);

        const videoResponse = await fetch(videoUrl);
        if (!videoResponse.ok) {
          throw new Error(`Failed to download video ${i + 1}: ${videoResponse.status}`);
        }

        const videoBlob = await videoResponse.blob();
        const videoArrayBuffer = await videoBlob.arrayBuffer();
        const videoBytes = new Uint8Array(videoArrayBuffer);

        const tempVideoPath = `/tmp/segment_${i}_${crypto.randomUUID()}.mp4`;
        await Deno.writeFile(tempVideoPath, videoBytes);
        tempVideoPaths.push(tempVideoPath);
        tempFiles.push(tempVideoPath);

        console.log(`Video ${i + 1} downloaded and saved to:`, tempVideoPath);
      }

      // Create FFmpeg concat file
      const concatFilePath = `/tmp/concat_${crypto.randomUUID()}.txt`;
      const concatContent = tempVideoPaths.map(path => `file '${path}'`).join('\n');
      await Deno.writeFile(concatFilePath, new TextEncoder().encode(concatContent));
      tempFiles.push(concatFilePath);

      console.log('Concat file created:', concatFilePath);

      // Stitch videos using FFmpeg
      const outputPath = `/tmp/stitched_${crypto.randomUUID()}.mp4`;

      try {
        // Use FFmpeg concat demuxer for better quality
        const ffmpegCommand = new Deno.Command('ffmpeg', {
          args: [
            '-f', 'concat',
            '-safe', '0',
            '-i', concatFilePath,
            '-c', 'copy',
            '-y',
            outputPath
          ],
          stdout: 'piped',
          stderr: 'piped'
        });

        const ffmpegProcess = await ffmpegCommand.output();

        if (!ffmpegProcess.success) {
          const errorText = new TextDecoder().decode(ffmpegProcess.stderr);
          console.error('FFmpeg concat error:', errorText);

          // Fallback: Use re-encoding if codec copy fails
          console.log('Trying re-encoding approach...');
          const reencodeCommand = new Deno.Command('ffmpeg', {
            args: [
              '-f', 'concat',
              '-safe', '0',
              '-i', concatFilePath,
              '-c:v', 'libx264',
              '-c:a', 'aac',
              '-preset', 'medium',
              '-crf', '23',
              '-y',
              outputPath
            ],
            stdout: 'piped',
            stderr: 'piped'
          });

          const reencodeProcess = await reencodeCommand.output();
          if (!reencodeProcess.success) {
            const reencodeErrorText = new TextDecoder().decode(reencodeProcess.stderr);
            console.error('FFmpeg re-encoding error:', reencodeErrorText);
            throw new Error('Failed to stitch videos using FFmpeg');
          }
        }

        console.log('Videos stitched successfully');

        // Read the stitched video
        const stitchedVideoBytes = await Deno.readFile(outputPath);
        console.log('Stitched video size:', stitchedVideoBytes.length, 'bytes');

        // Upload stitched video to Supabase storage
        const videoFileName = `stitched_${crypto.randomUUID()}.mp4`;
        const videoPath = `uploads/${userId}/${videoFileName}`;

        console.log('Uploading stitched video to Supabase storage, path:', videoPath);

        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('videos')
          .upload(videoPath, stitchedVideoBytes, {
            contentType: 'video/mp4',
            upsert: false,
            cacheControl: '3600'
          });

        if (uploadError) {
          console.error('Failed to upload stitched video to storage:', uploadError);
          throw new Error(`Storage upload failed: ${uploadError.message}`);
        }

        console.log('Stitched video uploaded successfully:', uploadData);

        // Get public URL for the stored video
        const { data: { publicUrl } } = supabase.storage
          .from('videos')
          .getPublicUrl(videoPath);

        // Clean up temporary files
        tempFiles.push(outputPath);
        for (const file of tempFiles) {
          try {
            await Deno.remove(file);
          } catch (cleanupError) {
            console.warn(`Failed to remove temporary file ${file}:`, cleanupError);
          }
        }

        console.log('Video stitching completed successfully, URL:', publicUrl);

        return new Response(
          JSON.stringify({
            success: true,
            stitchedVideoUrl: publicUrl,
            storagePath: videoPath
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200
          }
        );

      } catch (ffmpegError: any) {
        console.error('FFmpeg processing error:', ffmpegError);
        
        // Clean up temporary files
        tempFiles.push(outputPath);
        for (const file of tempFiles) {
          try {
            await Deno.remove(file);
          } catch (cleanupError) {
            console.warn(`Failed to remove temporary file ${file}:`, cleanupError);
          }
        }

        return new Response(
          JSON.stringify({
            error: 'FFmpeg not available or stitching failed',
            details: ffmpegError.message || 'FFmpeg is required for video stitching. Please configure FFmpeg in the environment or use an external FFmpeg service.',
            fallback: 'Consider using Cloudinary Transform API or similar service for video stitching'
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500
          }
        );
      }

    } catch (downloadError: any) {
      console.error('Error downloading videos:', downloadError);
      
      // Clean up any downloaded files
      for (const file of tempFiles) {
        try {
          await Deno.remove(file);
        } catch (cleanupError) {
          console.warn(`Failed to remove temporary file ${file}:`, cleanupError);
        }
      }

      throw downloadError;
    }

  } catch (error: any) {
    console.error('Error in stitch-videos function:', error);
    return new Response(
      JSON.stringify({
        error: 'Video stitching failed',
        details: error.message
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});

