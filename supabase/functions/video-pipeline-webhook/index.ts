import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type"
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    console.log('Video pipeline webhook called');
    
    // ✅ Verify shared secret instead of user JWT
    const url = new URL(req.url);
    const token = url.searchParams.get("token");
    const stage = url.searchParams.get("stage"); // 'wan' or 'foley'
    const expected = Deno.env.get("WEBHOOK_SECRET") || "your-secret-key-here";
    
    if (!token || token !== expected) {
      console.error('Webhook unauthorized - invalid token');
      return new Response("Unauthorized", { status: 401, headers: cors });
    }

    console.log('Webhook authorized, stage:', stage);

    // Use SERVICE ROLE for DB because there is no user
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") || "https://fsrabyevssdxaglriclw.supabase.co",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZzcmFieWV2c3NkeGFnbHJpY2x3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NTMzMjgzNiwiZXhwIjoyMDcwOTA4ODM2fQ.YVf_JcNzXKDOZUOqjWbf0Tr-7_0Oe8LXSYLpbAiJRRE"
    );

    const payload = await req.json();
    console.log('Webhook payload:', JSON.stringify(payload, null, 2));
    
    const status = payload?.status;
    const replicateId = payload?.id;
    const output = payload?.output;
    const error = payload?.error;

    if (!replicateId) {
      console.error('No prediction ID in webhook payload');
      return json({ error: 'No prediction ID provided' }, 400);
    }

    // Look up the generation record by prediction_id or audio_prediction_id
    let generation;
    let isAudioStage = false;

    if (stage === 'wan' || stage === 'video') {
      // This is video generation completion
      const { data, error: err } = await supabase
        .from('video_generations')
        .select('*')
        .eq('prediction_id', replicateId)
        .single();
      
      generation = data;
      if (err) console.error('Error finding video generation:', err);
    } else if (stage === 'foley' || stage === 'audio') {
      // This is audio generation completion
      const { data, error: err } = await supabase
        .from('video_generations')
        .select('*')
        .eq('audio_prediction_id', replicateId)
        .single();
      
      generation = data;
      isAudioStage = true;
      if (err) console.error('Error finding audio generation:', err);
    } else {
      // Try both if stage is not specified
      let { data, error: err1 } = await supabase
        .from('video_generations')
        .select('*')
        .eq('prediction_id', replicateId)
        .single();
      
      if (err1 || !data) {
        const { data: audioData, error: err2 } = await supabase
          .from('video_generations')
          .select('*')
          .eq('audio_prediction_id', replicateId)
          .single();
        
        if (!err2 && audioData) {
          generation = audioData;
          isAudioStage = true;
        }
      } else {
        generation = data;
      }
    }

    if (!generation) {
      console.error('Generation not found for prediction ID:', replicateId);
      return json({ error: 'Generation not found' }, 404);
    }

    console.log('Found generation:', generation.id, 'isAudioStage:', isAudioStage);

    if (status === 'succeeded' && output) {
      const videoUrl = typeof output === 'string' ? output : (output.video || output);
      
      if (!videoUrl || !videoUrl.startsWith('http')) {
        console.error('Invalid video URL:', videoUrl);
        return json({ error: 'Invalid video URL' }, 400);
      }

      console.log('Processing successful completion, videoUrl:', videoUrl);

      if (isAudioStage) {
        // Audio generation completed - finalize the generation
        console.log('Audio generation completed, finalizing...');
        
        await supabase
          .from('video_generations')
          .update({
            status: 'completed',
            storage_url: videoUrl,
            completed_at: new Date().toISOString()
          })
          .eq('id', generation.id);

        // Save to videos table
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

        console.log('Generation completed successfully');

      } else {
        // Video generation completed - start audio generation
        console.log('Video generation completed, starting audio generation...');
        
        await supabase
          .from('video_generations')
          .update({
            status: 'adding_audio',
            video_url: videoUrl,
            storage_url: videoUrl
          })
          .eq('id', generation.id);

        // Start audio generation
        try {
          const replicateApiKey = Deno.env.get('REPLICATE_API_TOKEN');
          if (!replicateApiKey) {
            throw new Error('REPLICATE_API_TOKEN not found');
          }

          const { default: Replicate } = await import('https://esm.sh/replicate@0.29.4');
          const replicate = new Replicate({ auth: replicateApiKey });

          const WEBHOOK_BASE_URL = Deno.env.get("SUPABASE_URL") || "https://fsrabyevssdxaglriclw.supabase.co";
          const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET") || "your-secret-key-here";
          const webhookFoley = `${WEBHOOK_BASE_URL}/functions/v1/video-pipeline-webhook?stage=foley&token=${WEBHOOK_SECRET}`;

          const audioInput = {
            video: videoUrl,
            prompt: `Generate audio effects and ambient sounds for: ${generation.prompt}`
          };

          const audioPrediction = await replicate.predictions.create({
            version: "88045928bb97971cffefabfc05a4e55e5bb1c96d475ad4ecc3d229d9169758ae",
            input: audioInput,
            webhook: webhookFoley,
            webhook_events_filter: ["completed"]
          });

          // Update with audio prediction ID
          await supabase
            .from('video_generations')
            .update({
              audio_prediction_id: audioPrediction.id
            })
            .eq('id', generation.id);

          console.log('Audio generation started:', audioPrediction.id);

        } catch (audioError) {
          console.error('Failed to start audio generation:', audioError);
          
          // Complete without audio if audio generation fails
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
              video_url: videoUrl,
              storage_url: videoUrl,
              thumbnail_url: generation.image_url,
              prompt: generation.prompt,
              duration: generation.duration,
              generation_id: generation.id
            });
        }
      }

    } else if (status === 'failed') {
      console.error('Generation failed:', error);
      
      // Update generation record with failure
      await supabase
        .from('video_generations')
        .update({
          status: 'failed',
          error_message: error?.message || 'Generation failed',
          completed_at: new Date().toISOString()
        })
        .eq('id', generation.id);

      // Refund the credit since generation failed
      await supabase
        .from('profiles')
        .update({
          credits: supabase.raw('credits + 1')
        })
        .eq('id', generation.user_id);

    } else {
      console.log('Generation status:', status, '- no action needed');
    }

    return json({ ok: true });

  } catch (e: any) {
    console.error("Webhook error:", e);
    return json({ error: "internal", details: e.message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" }
  });
}
