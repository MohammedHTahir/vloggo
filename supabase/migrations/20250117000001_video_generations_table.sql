-- Create video_generations table for tracking async video generation
CREATE TABLE public.video_generations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  prediction_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed')),
  image_url TEXT NOT NULL,
  prompt TEXT NOT NULL,
  duration INTEGER NOT NULL DEFAULT 5,
  video_url TEXT,
  storage_url TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Enable Row Level Security
ALTER TABLE public.video_generations ENABLE ROW LEVEL SECURITY;

-- Create policies for user access
CREATE POLICY "Users can view their own video generations" 
ON public.video_generations 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own video generations" 
ON public.video_generations 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own video generations" 
ON public.video_generations 
FOR UPDATE 
USING (auth.uid() = user_id);

-- Create index for faster queries
CREATE INDEX idx_video_generations_user_id ON public.video_generations(user_id);
CREATE INDEX idx_video_generations_status ON public.video_generations(status);
CREATE INDEX idx_video_generations_prediction_id ON public.video_generations(prediction_id);
