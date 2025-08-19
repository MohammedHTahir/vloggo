import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const leonardoApiKey = Deno.env.get('LEONARDO_API_KEY');
    if (!leonardoApiKey) {
      return new Response(JSON.stringify({ error: 'LEONARDO_API_KEY not set' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { extension } = await req.json();
    if (!extension) {
      return new Response(JSON.stringify({ error: 'Missing required field: extension' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const initRes = await fetch('https://cloud.leonardo.ai/api/rest/v1/init-image', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${leonardoApiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ extension })
    });

    const text = await initRes.text();
    let json: any;
    try { json = JSON.parse(text); } catch { json = { raw: text }; }

    if (!initRes.ok) {
      console.error('Leonardo init-image error:', text);
      return new Response(JSON.stringify({ error: 'Leonardo init-image failed', details: json }), { status: initRes.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify(json), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    console.error('init-leonardo-upload error:', e);
    return new Response(JSON.stringify({ error: 'Unexpected error', details: e.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});