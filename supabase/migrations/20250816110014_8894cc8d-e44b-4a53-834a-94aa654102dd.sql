-- Drop the incorrect policies
DROP POLICY IF EXISTS "Users can upload their own images" ON storage.objects;
DROP POLICY IF EXISTS "Users can view their own images" ON storage.objects;

-- Create corrected storage policies for image uploads
CREATE POLICY "Users can upload their own images" 
ON storage.objects 
FOR INSERT 
WITH CHECK (bucket_id = 'images' AND auth.uid()::text = (storage.foldername(name))[2]);

CREATE POLICY "Users can view their own images" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'images' AND auth.uid()::text = (storage.foldername(name))[2]);