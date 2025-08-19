-- Update profiles table for video generation platform
ALTER TABLE public.profiles 
RENAME COLUMN images_generated TO videos_generated;

ALTER TABLE public.profiles 
RENAME COLUMN images_edited TO videos_edited;

ALTER TABLE public.profiles 
ADD COLUMN total_render_time INTEGER DEFAULT 0;