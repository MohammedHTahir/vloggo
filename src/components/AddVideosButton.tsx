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
      'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
      'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
      'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
      'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
      'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4',
      'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4'
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