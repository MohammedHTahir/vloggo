import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

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
    console.log('Generate prompt continuation function called');

    const body = await req.json();
    const { originalPrompt, segmentIndex, previousPrompts = [] } = body;

    if (!originalPrompt) {
      return new Response(
        JSON.stringify({ error: 'Original prompt is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get DeepSeek API key
    const deepseekApiKey = Deno.env.get('DEEPSEEK_API_KEY');
    if (!deepseekApiKey) {
      console.error('DEEPSEEK_API_KEY not found in environment variables');
      throw new Error('AI service not configured');
    }

    // Build context from previous prompts
    const previousContext = previousPrompts.length > 0
      ? `Previous segments:\n${previousPrompts.map((p: string, i: number) => `Segment ${i + 1}: ${p}`).join('\n')}`
      : 'This is the first segment.';

    // Create system prompt for continuation generation
    const systemPrompt = `You are an AI assistant that generates cinematic video prompts for image-to-video generation.

Your task is to create a natural continuation prompt that:
1. Maintains visual consistency with the previous segments
2. Creates a smooth narrative flow
3. Preserves the overall style and atmosphere
4. Adds progression or continuation to the scene

The prompts should be cinematic, descriptive, and suitable for video generation that includes movement, atmosphere, and natural ambient audio.

Return ONLY the continuation prompt text, no explanations or additional text.`;

    const userPrompt = `${previousContext}

Original prompt: "${originalPrompt}"

Current segment: ${segmentIndex + 1}

Generate a continuation prompt for the next segment that naturally continues the video sequence while maintaining visual consistency.`;

    console.log('Calling DeepSeek API for prompt continuation...');

    // Call DeepSeek API
    const deepseekResponse = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${deepseekApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 200,
        temperature: 0.8,
        stream: false
      })
    });

    if (!deepseekResponse.ok) {
      const errorText = await deepseekResponse.text();
      console.error('DeepSeek API error:', errorText);
      throw new Error('AI service temporarily unavailable');
    }

    const deepseekData = await deepseekResponse.json();
    const continuationPrompt = deepseekData.choices?.[0]?.message?.content?.trim();

    if (!continuationPrompt) {
      throw new Error('No response from AI service');
    }

    console.log('Continuation prompt generated:', continuationPrompt);

    return new Response(
      JSON.stringify({
        success: true,
        continuationPrompt: continuationPrompt
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error: any) {
    console.error('Error in generate-prompt-continuation function:', error);
    return new Response(
      JSON.stringify({
        error: 'Prompt continuation generation failed',
        details: error.message
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});

