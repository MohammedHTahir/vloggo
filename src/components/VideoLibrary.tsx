import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download, Play, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface Video {
  id: string;
  video_url: string;
  storage_url: string | null;
  thumbnail_url: string | null;
  prompt: string;
  duration: number;
  created_at: string;
}

export function VideoLibrary() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [playingVideoId, setPlayingVideoId] = useState<string | null>(null);

  useEffect(() => {
    fetchVideos();
  }, []);

  const fetchVideos = async () => {
    try {
      const { data, error } = await supabase
        .from('videos')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setVideos(data || []);
    } catch (error) {
      console.error('Error fetching videos:', error);
      toast.error('Failed to load videos');
    } finally {
      setLoading(false);
    }
  };

  const downloadVideo = async (video: Video) => {
    try {
      // Prioritize storage_url, fall back to video_url
      const videoUrl = video.storage_url || video.video_url;
      
      if (!videoUrl) {
        toast.error('Video URL not available');
        return;
      }

      toast.info('Downloading video...');

      // Fetch the video with proper CORS headers
      const response = await fetch(videoUrl, {
        method: 'GET',
        mode: 'cors',
        headers: {
          'Content-Type': 'video/mp4',
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch video: ${response.status}`);
      }

      const blob = await response.blob();
      
      // Create download link
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${video.prompt.slice(0, 30).replace(/[^a-z0-9]/gi, '_')}_${video.id.slice(0, 8)}.mp4`;
      document.body.appendChild(a);
      a.click();
      
      // Cleanup
      setTimeout(() => {
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }, 100);
      
      toast.success('Video downloaded successfully');
    } catch (error) {
      console.error('Error downloading video:', error);
      toast.error('Failed to download video. Please try again.');
    }
  };

  const deleteVideo = async (videoId: string) => {
    try {
      // Find the video to get storage info
      const video = videos.find(v => v.id === videoId);
      
      // Delete from database
      const { error } = await supabase
        .from('videos')
        .delete()
        .eq('id', videoId);

      if (error) throw error;
      
      // Try to delete from storage if storage_url exists
      if (video?.storage_url) {
        try {
          // Extract the path from the storage URL
          const url = new URL(video.storage_url);
          const pathMatch = url.pathname.match(/\/storage\/v1\/object\/public\/videos\/(.+)$/);
          
          if (pathMatch && pathMatch[1]) {
            const filePath = decodeURIComponent(pathMatch[1]);
            console.log('Deleting file from storage:', filePath);
            
            const { error: storageError } = await supabase.storage
              .from('videos')
              .remove([filePath]);
            
            if (storageError) {
              console.error('Error deleting from storage:', storageError);
              // Don't fail the whole operation if storage deletion fails
            }
          }
        } catch (storageError) {
          console.error('Error processing storage deletion:', storageError);
          // Continue even if storage deletion fails
        }
      }
      
      setVideos(videos.filter(video => video.id !== videoId));
      toast.success('Video deleted successfully');
    } catch (error) {
      console.error('Error deleting video:', error);
      toast.error('Failed to delete video');
    }
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="glass-card p-6 rounded-2xl overflow-hidden">
            <div className="animate-pulse">
              <div className="aspect-video bg-muted/30 rounded-xl mb-4"></div>
              <div className="h-4 bg-muted/30 rounded mb-2"></div>
              <div className="h-3 bg-muted/30 rounded w-2/3"></div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (videos.length === 0) {
    return (
      <div className="text-center py-12 glass-card rounded-2xl">
        <div className="mx-auto w-24 h-24 bg-muted/20 rounded-full flex items-center justify-center mb-4">
          <Play className="w-8 h-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold mb-2">No videos yet</h3>
        <p className="text-muted-foreground mb-4">
          Generate your first video to get started
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {videos.map((video) => (
        <div key={video.id} className="relative glass-card rounded-2xl overflow-hidden group hover:scale-105 transition-all duration-300 aspect-video">
          {/* Full Video Background */}
          {playingVideoId === video.id ? (
            <video
              controls
              autoPlay
              className="w-full h-full object-cover absolute inset-0"
              src={video.storage_url || video.video_url}
              onEnded={() => setPlayingVideoId(null)}
            >
              <source src={video.storage_url || video.video_url} type="video/mp4" />
              Your browser does not support the video tag.
            </video>
          ) : (
            <>
              {video.thumbnail_url ? (
                <img
                  src={video.thumbnail_url}
                  alt={video.prompt}
                  className="w-full h-full object-cover absolute inset-0"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-primary/20 to-secondary/20 absolute inset-0 flex items-center justify-center">
                  <Play className="w-12 h-12 text-white/70" />
                </div>
              )}
              
              {/* Play Button Overlay */}
              <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <Button
                  size="lg"
                  variant="glass-primary"
                  className="rounded-full shadow-glow-primary"
                  onClick={() => setPlayingVideoId(video.id)}
                >
                  <Play className="w-8 h-8" />
                </Button>
              </div>
            </>
          )}
          
          {/* Top Right Actions - Only visible on hover */}
          <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              size="sm"
              variant="glass-primary"
              className="rounded-full"
              onClick={() => downloadVideo(video)}
            >
              <Download className="w-4 h-4" />
            </Button>
            <Button
              size="sm"
              className="glass rounded-full hover:bg-red-500/20 hover:border-red-500/50"
              onClick={() => deleteVideo(video.id)}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      ))}
      </div>
    </div>
  );
}