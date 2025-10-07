import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface SupportRequest {
  message: string;
  conversationHistory: ChatMessage[];
}

interface EscalationRequest {
  userEmail: string;
  message: string;
  conversationHistory: ChatMessage[];
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const path = url.pathname.split('/').pop();

    if (path === 'support-chat') {
      return await handleSupportChat(req);
    } else if (path === 'escalate-support') {
      return await handleEscalation(req);
    } else {
      return new Response(JSON.stringify({ error: 'Invalid endpoint' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  } catch (error) {
    console.error('Support function error:', error);
    return new Response(JSON.stringify({
      error: 'Internal server error',
      details: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

async function handleSupportChat(req: Request) {
  try {
    const body: SupportRequest = await req.json();
    const { message, conversationHistory } = body;

    if (!message?.trim()) {
      return new Response(JSON.stringify({
        error: 'Message is required'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get DeepSeek API key
    const deepseekApiKey = Deno.env.get('DEEPSEEK_API_KEY');
    if (!deepseekApiKey) {
      console.error('DEEPSEEK_API_KEY not found in environment variables');
      throw new Error('AI service not configured');
    }

    // Prepare conversation context
    const systemPrompt = `You are a helpful AI assistant for VlogGo, an AI-powered video generation platform. 

Key information about VlogGo:
- Users can upload images and generate AI videos with audio
- Videos can be 5 seconds (1 credit) or 10 seconds (2 credits)
- Users have a credit system for video generation
- Videos are stored in Supabase storage
- Users can download their generated videos
- There's a dashboard to view all generated videos

Common questions you might get:
- How to generate videos
- Credit system and pricing
- Video download issues
- Account management
- Technical problems

Be helpful, friendly, and concise. If you can't solve a problem, suggest escalating to human support by saying "Would you like to speak with a human support agent?"`;

    const messages = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory.slice(-10), // Keep last 10 messages for context
      { role: 'user', content: message }
    ];

    // Call DeepSeek API
    const deepseekResponse = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${deepseekApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: messages,
        max_tokens: 500,
        temperature: 0.7,
        stream: false
      })
    });

    if (!deepseekResponse.ok) {
      const errorText = await deepseekResponse.text();
      console.error('DeepSeek API error:', errorText);
      throw new Error('AI service temporarily unavailable');
    }

    const deepseekData = await deepseekResponse.json();
    const aiResponse = deepseekData.choices?.[0]?.message?.content;

    if (!aiResponse) {
      throw new Error('No response from AI service');
    }

    // Log the conversation for analytics
    await supabase.from('support_conversations').insert({
      user_message: message,
      ai_response: aiResponse,
      conversation_length: conversationHistory.length + 1,
      created_at: new Date().toISOString()
    });

    return new Response(JSON.stringify({
      success: true,
      response: aiResponse
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Support chat error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message || 'Failed to process chat request'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

async function handleEscalation(req: Request) {
  try {
    const body: EscalationRequest = await req.json();
    const { userEmail, message, conversationHistory } = body;

    if (!userEmail || !message?.trim()) {
      return new Response(JSON.stringify({
        error: 'User email and message are required'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get Resend API key
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) {
      console.error('RESEND_API_KEY not found in environment variables');
      throw new Error('Email service not configured');
    }

    // Create conversation summary
    const conversationSummary = conversationHistory
      .map(msg => `${msg.role === 'user' ? 'User' : 'AI'}: ${msg.content}`)
      .join('\n');

    // Send email to support team
    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'noreply@vloggo.ai',
        to: ['support@vloggo.ai'],
        subject: `Support Request from ${userEmail}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2563eb;">New Support Request</h2>
            
            <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="margin-top: 0; color: #1e293b;">User Information</h3>
              <p><strong>Email:</strong> ${userEmail}</p>
              <p><strong>Request Time:</strong> ${new Date().toLocaleString()}</p>
            </div>

            <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="margin-top: 0; color: #1e293b;">Latest Message</h3>
              <p style="background: white; padding: 15px; border-radius: 4px; border-left: 4px solid #2563eb;">
                ${message}
              </p>
            </div>

            ${conversationHistory.length > 0 ? `
            <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="margin-top: 0; color: #1e293b;">Conversation History</h3>
              <pre style="background: white; padding: 15px; border-radius: 4px; white-space: pre-wrap; font-size: 14px;">${conversationSummary}</pre>
            </div>
            ` : ''}

            <div style="background: #fef3c7; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <p style="margin: 0; color: #92400e;">
                <strong>Note:</strong> This request was escalated from the AI chat system. Please respond directly to the user at ${userEmail}.
              </p>
            </div>
          </div>
        `
      })
    });

    if (!emailResponse.ok) {
      const errorText = await emailResponse.text();
      console.error('Resend API error:', errorText);
      throw new Error('Failed to send support email');
    }

    const emailData = await emailResponse.json();

    // Log the escalation
    await supabase.from('support_escalations').insert({
      user_email: userEmail,
      original_message: message,
      conversation_length: conversationHistory.length,
      email_id: emailData.id,
      created_at: new Date().toISOString()
    });

    return new Response(JSON.stringify({
      success: true,
      message: 'Support request escalated successfully',
      emailId: emailData.id
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Escalation error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message || 'Failed to escalate support request'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}
