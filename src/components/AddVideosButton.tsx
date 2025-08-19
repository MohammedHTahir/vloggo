import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';

interface AddVideosButtonProps {
  onVideosAdded: () => void;
}

export function AddVideosButton({ onVideosAdded }: AddVideosButtonProps) {
  const [loading, setLoading] = useState(false);

  const addExistingVideos = async () => {
    setLoading(true);
    
    const videoUrls = [
      'https://cdn.leonardo.ai/users/ffa80a45-bcea-4c61-a648-593cc517b849/generations/b5ec32c7-3de4-4019-af94-dd3fcc70abb9/segments/1:1:1/veo30generatepreview_Transform_this_image_into_a_cinematic_vid_0.mp4',
      'https://cdn.leonardo.ai/users/ffa80a45-bcea-4c61-a648-593cc517b849/generations/a54ca826-856a-455a-87b3-fcf966b69ea7/segments/1:1:1/veo30generatepreview_Transform_this_image_into_a_cinematic_vid_0.mp4',
      'https://cdn.leonardo.ai/users/ffa80a45-bcea-4c61-a648-593cc517b849/generations/338631c9-5c70-4c16-be87-cbedcc05a6b9/338631c9-5c70-4c16-be87-cbedcc05a6b9.mp4',
      'https://cdn.leonardo.ai/users/ffa80a45-bcea-4c61-a648-593cc517b849/generations/142e0ce4-eff5-4b95-bac1-c8c403375d09/142e0ce4-eff5-4b95-bac1-c8c403375d09.mp4',
      'https://cdn.leonardo.ai/users/ffa80a45-bcea-4c61-a648-593cc517b849/generations/f102423c-e489-4ca5-8707-5e97e1f65165/f102423c-e489-4ca5-8707-5e97e1f65165.mp4',
      'https://cdn.leonardo.ai/users/ffa80a45-bcea-4c61-a648-593cc517b849/generations/487fa5fd-b3d3-407b-a8a8-4ab86415a572/487fa5fd-b3d3-407b-a8a8-4ab86415a572.mp4'
    ];

    try {
      const { data, error } = await supabase.functions.invoke('add-existing-videos', {
        body: {
          videos: videoUrls.map(url => ({
            url,
            prompt: 'Transform this image into a cinematic video with smooth camera movement',
            duration: 5
          }))
        }
      });

      if (error) throw error;

      toast.success(`Added ${videoUrls.length} videos to your library`);
      onVideosAdded();
    } catch (error) {
      console.error('Error adding videos:', error);
      toast.error('Failed to add videos');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button 
      onClick={addExistingVideos} 
      disabled={loading}
      className="mb-6"
    >
      <Plus className="w-4 h-4 mr-2" />
      {loading ? 'Adding Videos...' : 'Add My Existing Videos'}
    </Button>
  );
}