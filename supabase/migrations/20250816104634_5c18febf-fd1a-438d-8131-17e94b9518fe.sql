-- Create storage bucket for image uploads
INSERT INTO storage.buckets (id, name, public) VALUES ('images', 'images', true);

-- Create storage policies for image uploads
CREATE POLICY "Users can upload their own images" 
ON storage.objects 
FOR INSERT 
WITH CHECK (bucket_id = 'images' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can view their own images" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'images' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Images are publicly accessible" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'images');