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
    const { uploadUrl, fields, fileBase64, filename, contentType } = await req.json();

    if (!uploadUrl || !fields || !fileBase64 || !filename) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Parse fields (Leonardo may return as stringified JSON)
    let parsedFields: Record<string, string>;
    if (typeof fields === 'string') {
      try { parsedFields = JSON.parse(fields); } catch {
        return new Response(JSON.stringify({ error: 'Invalid fields format' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    } else {
      parsedFields = fields;
    }

    // Decode base64 file
    const binary = atob(fileBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: contentType || 'application/octet-stream' });

    // Build multipart form data
    const formData = new FormData();
    for (const key of Object.keys(parsedFields)) {
      formData.append(key, parsedFields[key]);
    }
    formData.append('file', blob, filename);

    const res = await fetch(uploadUrl, { method: 'POST', body: formData });
    const text = await res.text();

    if (!res.ok) {
      console.error('S3 upload failed:', text);
      return new Response(JSON.stringify({ error: 'S3 upload failed', status: res.status, body: text }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    console.error('upload-leonardo-file error:', e);
    return new Response(JSON.stringify({ error: 'Unexpected error', details: e.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});