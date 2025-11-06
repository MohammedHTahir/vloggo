-- Add video stitching support fields to video_generations table
ALTER TABLE public.video_generations
ADD COLUMN IF NOT EXISTS parent_generation_id UUID REFERENCES public.video_generations(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS segment_index INTEGER,
ADD COLUMN IF NOT EXISTS total_segments INTEGER,
ADD COLUMN IF NOT EXISTS is_segment BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS stitched_video_url TEXT,
ADD COLUMN IF NOT EXISTS stitched_storage_url TEXT,
ADD COLUMN IF NOT EXISTS segments_completed INTEGER DEFAULT 0;

-- Update any invalid status values to 'failed' before applying constraint
UPDATE public.video_generations
SET status = 'failed'
WHERE status NOT IN ('processing', 'completed', 'failed', 'stitching', 'waiting_for_input');

-- Update status CHECK constraint to include 'stitching' and 'waiting_for_input'
ALTER TABLE public.video_generations
DROP CONSTRAINT IF EXISTS video_generations_status_check;

ALTER TABLE public.video_generations
ADD CONSTRAINT video_generations_status_check
CHECK (status IN ('processing', 'completed', 'failed', 'stitching', 'waiting_for_input'));

-- Create video_segments table
CREATE TABLE IF NOT EXISTS public.video_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_generation_id UUID NOT NULL REFERENCES public.video_generations(id) ON DELETE CASCADE,
  segment_index INTEGER NOT NULL,
  video_url TEXT,
  storage_url TEXT,
  prompt TEXT NOT NULL,
  duration INTEGER NOT NULL,
  completed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add last_frame_url column if it doesn't exist
ALTER TABLE public.video_segments
ADD COLUMN IF NOT EXISTS last_frame_url TEXT;

-- Enable Row Level Security for video_segments
ALTER TABLE public.video_segments ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS "Users can view their own video segments" ON public.video_segments;
DROP POLICY IF EXISTS "Users can insert their own video segments" ON public.video_segments;
DROP POLICY IF EXISTS "Users can update their own video segments" ON public.video_segments;

-- Create policies for video_segments
CREATE POLICY "Users can view their own video segments"
ON public.video_segments
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.video_generations
    WHERE video_generations.id = video_segments.parent_generation_id
    AND video_generations.user_id = auth.uid()
  )
);

CREATE POLICY "Users can insert their own video segments"
ON public.video_segments
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.video_generations
    WHERE video_generations.id = video_segments.parent_generation_id
    AND video_generations.user_id = auth.uid()
  )
);

CREATE POLICY "Users can update their own video segments"
ON public.video_segments
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.video_generations
    WHERE video_generations.id = video_segments.parent_generation_id
    AND video_generations.user_id = auth.uid()
  )
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_video_generations_parent_id ON public.video_generations(parent_generation_id);
CREATE INDEX IF NOT EXISTS idx_video_generations_is_segment ON public.video_generations(is_segment);
CREATE INDEX IF NOT EXISTS idx_video_segments_parent_id ON public.video_segments(parent_generation_id);
CREATE INDEX IF NOT EXISTS idx_video_segments_index ON public.video_segments(parent_generation_id, segment_index);
