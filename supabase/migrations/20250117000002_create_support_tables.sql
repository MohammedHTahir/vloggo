-- Create support conversations table
CREATE TABLE IF NOT EXISTS support_conversations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_message TEXT NOT NULL,
  ai_response TEXT NOT NULL,
  conversation_length INTEGER DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create support escalations table
CREATE TABLE IF NOT EXISTS support_escalations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_email TEXT NOT NULL,
  original_message TEXT NOT NULL,
  conversation_length INTEGER DEFAULT 0,
  email_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add RLS policies
ALTER TABLE support_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_escalations ENABLE ROW LEVEL SECURITY;

-- Allow service role to insert (for edge functions)
CREATE POLICY "Service role can insert support conversations" ON support_conversations
  FOR INSERT WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role can insert support escalations" ON support_escalations
  FOR INSERT WITH CHECK (auth.role() = 'service_role');

-- Allow authenticated users to read their own escalations (if needed)
CREATE POLICY "Users can read their own escalations" ON support_escalations
  FOR SELECT USING (auth.uid()::text = user_email);
