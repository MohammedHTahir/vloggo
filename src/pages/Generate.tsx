import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { 
  Upload, 
  Play, 
  Download, 
  Wand2, 
  ArrowLeft,
  ImageIcon,
  VideoIcon,
  Zap,
  Sparkles,
  RefreshCw,
  CheckCircle
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import { supabase, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "@/integrations/supabase/client";

const Generate = () => {
  const { user, profile } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>("");
  const [prompt, setPrompt] = useState("A cinematic transformation with dramatic movement, atmosphere, and natural ambient audio");
  const [duration, setDuration] = useState<number>(6);
  const [segmentType, setSegmentType] = useState<6 | 10>(6); // Segment type: 6s or 10s
  const [isEnhancingPrompt, setIsEnhancingPrompt] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [generatedVideo, setGeneratedVideo] = useState<{
    url: string;
    prompt: string;
    duration: number;
  } | null>(null);
  const [generationId, setGenerationId] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [generationStatus, setGenerationStatus] = useState<string>('');
  const [retryCount, setRetryCount] = useState(0);
  const [segmentProgress, setSegmentProgress] = useState<{ completed: number; total: number; current?: number } | null>(null);
  const [isStitching, setIsStitching] = useState(false);
  const [nextSegmentPrompt, setNextSegmentPrompt] = useState("");
  const [lastFrameUrl, setLastFrameUrl] = useState<string | null>(null);
  const [waitingForNextSegment, setWaitingForNextSegment] = useState(false);
  const [parentGenerationId, setParentGenerationId] = useState<string | null>(null);
  const [currentSegmentIndex, setCurrentSegmentIndex] = useState(0);
  const [completedSegmentVideoUrl, setCompletedSegmentVideoUrl] = useState<string | null>(null);

  // Calculate segments and credit cost based on selected segment type
  const calculateSegments = (duration: number, segType: 6 | 10): { segments: number[], creditCost: number } => {
    const segments: number[] = [];
    const segmentCount = Math.ceil(duration / segType);
    
    // Add segments (all segments use the same duration)
    for (let i = 0; i < segmentCount; i++) {
      segments.push(segType);
    }
    
    const creditCost = segments.reduce((sum, seg) => sum + (seg === 6 ? 1 : 2), 0);
    return { segments, creditCost };
  };

  const { segments, creditCost } = calculateSegments(duration, segmentType);
  
  // Update duration when segment type changes to nearest valid value
  const handleSegmentTypeChange = (newType: 6 | 10) => {
    setSegmentType(newType);
    // Round duration to nearest multiple of new segment type
    const roundedDuration = Math.round(duration / newType) * newType;
    const clampedDuration = Math.max(newType, Math.min(240, roundedDuration));
    setDuration(clampedDuration);
  };

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        toast.error('Please select a valid image file');
        return;
      }
      
      if (file.size > 10 * 1024 * 1024) { // 10MB limit
        toast.error('Image file size must be less than 10MB');
        return;
      }

      setSelectedImage(file);
      const reader = new FileReader();
      reader.onload = (e) => {
        setImagePreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const uploadImageToSupabase = async (file: File): Promise<string> => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${crypto.randomUUID()}.${fileExt}`;
    const filePath = `uploads/${user?.id}/${fileName}`;

    const { data, error } = await supabase.storage
      .from('images')
      .upload(filePath, file);

    if (error) {
      throw new Error(`Upload failed: ${error.message}`);
    }

    const { data: { publicUrl } } = supabase.storage
      .from('images')
      .getPublicUrl(filePath);

    return publicUrl;
  };



  const extractLastFrameFromVideo = async (videoUrl: string, parentGenerationId: string, segmentIndex: number): Promise<string> => {
    return new Promise((resolve, reject) => {
      console.log('Starting frame extraction from:', videoUrl);
      const video = document.createElement('video');
      video.crossOrigin = 'anonymous';
      video.preload = 'auto';
      video.muted = true;
      video.playsInline = true;
      
      let resolved = false;
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          console.error('Frame extraction timeout');
          video.remove();
          reject(new Error('Frame extraction timed out. Video may not be accessible.'));
        }
      }, 20000); // 20 second timeout
      
      const cleanup = () => {
        clearTimeout(timeout);
        if (video.parentNode) {
          video.remove();
        }
      };
      
      // Method 1: Try using loadeddata event and seek to end
      video.onloadeddata = () => {
        console.log('Video loaded, duration:', video.duration);
        if (video.duration && video.duration > 0) {
          // Seek to very end
          video.currentTime = video.duration - 0.01;
        }
      };
      
      // Method 2: Use timeupdate to detect when we're near the end
      video.ontimeupdate = () => {
        if (video.duration && video.currentTime >= video.duration - 0.1) {
          console.log('Video reached end, extracting frame...');
          video.pause();
          extractFrame();
        }
      };
      
      // Method 3: Use seeked event as fallback
      video.onseeked = () => {
        console.log('Video seeked to:', video.currentTime);
        // Small delay to ensure frame is ready
        setTimeout(() => {
          if (!resolved) {
            extractFrame();
          }
        }, 200);
      };
      
      const extractFrame = () => {
        if (resolved) return;
        
        try {
          console.log('Extracting frame, video dimensions:', video.videoWidth, 'x', video.videoHeight);
          
          // Create canvas and draw the video frame
          const canvas = document.createElement('canvas');
          canvas.width = video.videoWidth || 1920;
          canvas.height = video.videoHeight || 1080;
          const ctx = canvas.getContext('2d');
          
          if (!ctx) {
            throw new Error('Could not get canvas context');
          }
          
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          console.log('Frame drawn to canvas');
          
          // Convert canvas to blob
          canvas.toBlob(async (blob) => {
            if (!blob) {
              cleanup();
              if (!resolved) {
                resolved = true;
                reject(new Error('Failed to create frame blob'));
              }
              return;
            }
            
            console.log('Frame blob created, size:', blob.size);
            
            try {
              // Upload frame to Supabase storage
              const frameFileName = `frame_${crypto.randomUUID()}.jpg`;
              const framePath = `frames/${user?.id || 'anonymous'}/${frameFileName}`;
              
              console.log('Uploading frame to:', framePath);
              const { data: uploadData, error: uploadError } = await supabase.storage
                .from('images')
                .upload(framePath, blob, {
                  contentType: 'image/jpeg',
                  upsert: false,
                  cacheControl: '3600'
                });
              
              if (uploadError) {
                console.error('Upload error:', uploadError);
                throw new Error(`Failed to upload frame: ${uploadError.message}`);
              }
              
              console.log('Frame uploaded successfully');
              
              // Get public URL
              const { data: { publicUrl } } = supabase.storage
                .from('images')
                .getPublicUrl(framePath);
              
              console.log('Frame URL:', publicUrl);
              
              // Update segment record with last_frame_url
              const { error: updateError } = await supabase
                .from('video_segments' as any)
                .update({ last_frame_url: publicUrl })
                .eq('parent_generation_id', parentGenerationId)
                .eq('segment_index', segmentIndex);
              
              if (updateError) {
                console.warn('Failed to update segment with frame URL:', updateError);
              }
              
              cleanup();
              if (!resolved) {
                resolved = true;
                resolve(publicUrl);
              }
            } catch (error) {
              cleanup();
              if (!resolved) {
                resolved = true;
                reject(error);
              }
            }
          }, 'image/jpeg', 0.95);
        } catch (error) {
          cleanup();
          if (!resolved) {
            resolved = true;
            reject(error);
          }
        }
      };
      
      video.onerror = (error) => {
        console.error('Video load error:', error, video.error);
        cleanup();
        if (!resolved) {
          resolved = true;
          reject(new Error(`Failed to load video for frame extraction. ${video.error?.message || 'Check CORS settings.'}`));
        }
      };
      
      video.oncanplay = () => {
        console.log('Video can play');
      };
      
      video.onloadedmetadata = () => {
        console.log('Video metadata loaded, duration:', video.duration);
        if (video.duration && video.duration > 0) {
          // Seek to end
          video.currentTime = Math.max(0, video.duration - 0.01);
        }
      };
      
      // Start loading
      video.src = videoUrl;
      video.load();
      
      // Also try to play to ensure video loads
      video.play().catch(err => {
        console.warn('Video play failed (expected for muted video):', err);
      });
    });
  };

  const checkVideoStatus = async (genId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('check-video-status', {
        body: {
          generationId: genId
        }
      });

      if (error) {
        console.error('Status check error:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Status check failed:', error);
      return null;
    }
  };

  const startPolling = (genId: string) => {
    setIsPolling(true);
    setProgress(10);
    setGenerationStatus('Starting video generation...');
    
    const pollInterval = setInterval(async () => {
      try {
        // Check if user is authenticated
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          console.error('No active session found');
          clearInterval(pollInterval);
          setIsPolling(false);
          toast.error('Session expired. Please log in again.');
          return;
        }

        console.log('Polling with session, user ID:', session.user.id);

        // Call the check-video-status function to check and advance the pipeline
        const { data, error } = await supabase.functions.invoke('check-video-status', {
          body: { generationId: genId }
        });

        if (error) {
          console.error('Pipeline processing error:', error);
          return;
        }

        if (!data || !data.success) {
          console.error('Pipeline processing failed:', data);
          return;
        }

        console.log('Pipeline status:', data.status);

        // Handle multi-segment progress
        if (data.isMultiSegment) {
          setSegmentProgress({
            completed: data.segmentsCompleted || 0,
            total: data.totalSegments || 1,
            current: data.currentSegment
          });

          // Check if waiting for user input
          if (data.status === 'waiting_for_input' || data.isWaitingForInput) {
            console.log('Detected waiting_for_input status');
            console.log('Data:', { videoUrl: data.videoUrl, lastFrameUrl: data.lastFrameUrl, segmentsCompleted: data.segmentsCompleted, totalSegments: data.totalSegments });
            
            // Check if all segments are completed - if so, we should be stitching, not waiting for input
            if (data.segmentsCompleted >= data.totalSegments) {
              console.log('All segments completed, should proceed to stitching');
              
              // Show the last completed segment video
              if (data.videoUrl) {
                console.log('Setting completed segment video URL:', data.videoUrl);
                setCompletedSegmentVideoUrl(data.videoUrl);
              }
              
              // Update UI to show stitching status
              setIsStitching(true);
              setProgress(90);
              setGenerationStatus('All segments completed. Stitching videos together...');
              setWaitingForNextSegment(false);
              
              // Continue polling - stitching should start automatically
              return;
            }
            
            clearInterval(pollInterval);
            setIsPolling(false);
            
            // ALWAYS set waiting state and video URL immediately
            // segmentsCompleted is the number of segments that have completed
            // Segment indices are 0-indexed: 0, 1, 2, etc.
            // If segmentsCompleted = 1, that means segment 0 is done, next is segment 1
            // So nextSegmentIndex = segmentsCompleted (which is correct)
            const nextSegmentIndex = data.segmentsCompleted || 0;
            console.log('Setting next segment index to:', nextSegmentIndex, '(segmentsCompleted:', data.segmentsCompleted, ', totalSegments:', data.totalSegments, ')');
            setWaitingForNextSegment(true);
            setCurrentSegmentIndex(nextSegmentIndex);
            setProgress(80);
            // Display: "Segment X completed" where X is the 1-indexed number (segmentsCompleted)
            // But we're asking for the NEXT segment, which is segmentsCompleted + 1 in 1-indexed terms
            setGenerationStatus(`Segment ${data.segmentsCompleted || 0} of ${data.totalSegments || 1} completed. Please provide prompt for segment ${(data.segmentsCompleted || 0) + 1}.`);
            
            // Set video URL immediately so video shows
            if (data.videoUrl) {
              console.log('Setting completed segment video URL:', data.videoUrl);
              setCompletedSegmentVideoUrl(data.videoUrl);
            }
            
            // If we already have a last frame URL, use it
            if (data.lastFrameUrl) {
              console.log('Using existing last frame URL:', data.lastFrameUrl);
              setLastFrameUrl(data.lastFrameUrl);
              toast.success(`Segment ${data.segmentsCompleted || 0} completed! Please provide the prompt for the next scene.`, { duration: 10000 });
            } else if (data.videoUrl) {
              // Only extract frame if not all segments are completed (we need it for the next segment)
              // If all segments are done, we don't need to extract frame - stitching will happen
              if (data.segmentsCompleted < data.totalSegments) {
                // Try to extract frame, but don't block UI
                console.log('Attempting to extract frame from:', data.videoUrl);
                const lastCompletedSegmentIndex = Math.max(0, (data.segmentsCompleted || 1) - 1);
                
                // Extract frame in background (non-blocking)
                extractLastFrameFromVideo(data.videoUrl, data.generationId, lastCompletedSegmentIndex)
                  .then((frameUrl) => {
                    console.log('Frame extraction successful:', frameUrl);
                    setLastFrameUrl(frameUrl);
                    toast.success('Last frame extracted!', { duration: 5000 });
                  })
                  .catch((error) => {
                    console.error('Frame extraction failed:', error);
                    console.error('Error details:', error.message);
                    // Don't show error toast - video is already showing, user can proceed
                  });
                
                toast.success(`Segment ${data.segmentsCompleted || 0} completed! Please provide the prompt for the next scene.`, { duration: 10000 });
              } else {
                // All segments done, no need to extract frame
                console.log('All segments completed, skipping frame extraction');
              }
            } else {
              toast.warning('Segment completed but video URL not available yet.');
            }
            
            return;
          } else if (data.isStitching) {
            setIsStitching(true);
            setProgress(90);
            setGenerationStatus('Stitching segments together...');
          } else if (data.segmentsCompleted < data.totalSegments) {
            const segmentProgressPercent = ((data.segmentsCompleted || 0) / (data.totalSegments || 1)) * 80;
            setProgress(10 + segmentProgressPercent);
            setGenerationStatus(`Segment ${data.segmentsCompleted + 1}/${data.totalSegments} in progress...`);
          }
        }

        if (data.status === 'completed') {
          clearInterval(pollInterval);
          setIsPolling(false);
          setProgress(100);
          setGenerationStatus(data.isMultiSegment ? 'Video stitched and ready!' : 'Video with audio ready!');
          
          // Use the videoUrl from the response
          if (data.videoUrl) {
            setGeneratedVideo({
              url: data.videoUrl,
              prompt: prompt,
              duration: duration
            });
            toast.success(data.isMultiSegment ? 'Multi-segment video generated successfully!' : 'Video with audio generated successfully!');
          }
          setSegmentProgress(null);
          setIsStitching(false);
        } else if (data.status === 'failed') {
          clearInterval(pollInterval);
          setIsPolling(false);
          setGenerationStatus('Generation failed');
          
          // Show more user-friendly error messages
          let errorMessage = data.errorMessage || data.error || 'Video generation failed';
          if (errorMessage.includes('high server load')) {
            errorMessage = 'Server is currently busy. Please try again later.';
          } else if (errorMessage.includes('CUDA out of memory')) {
            errorMessage = 'Server is currently overloaded. Please try again later.';
          } else if (errorMessage.includes('authentication')) {
            errorMessage = 'Authentication error. Please contact support.';
          }
          
          toast.error(errorMessage);
          
          // Reset retry count for next attempt
          setRetryCount(0);
          setSegmentProgress(null);
          setIsStitching(false);
        } else if (data.status === 'stitching') {
          setIsStitching(true);
          setProgress(90);
          setGenerationStatus('Stitching segments together...');
        } else if (data.status === 'processing' && !data.isMultiSegment) {
          setProgress(50);
          setGenerationStatus('Generating video...');
        }
      } catch (error) {
        console.error('Polling error:', error);
      }
    }, 5000); // Poll every 5 seconds

    // Stop polling after 15 minutes
    setTimeout(() => {
      clearInterval(pollInterval);
      setIsPolling(false);
      if (!generatedVideo) {
        setGenerationStatus('Generation taking longer than expected...');
        toast.info('Video generation is taking longer than expected. Please check back later in your dashboard.');
      }
    }, 900000); // 15 minutes
  };

  const generateVideo = async () => {
    if (!selectedImage) {
      toast.error('Please select an image first');
      return;
    }

    if (!prompt.trim()) {
      toast.error('Please enter a prompt');
      return;
    }

    if ((profile?.credits || 0) < creditCost) {
      toast.error(`Insufficient credits. You need ${creditCost} credit${creditCost > 1 ? 's' : ''} for a ${duration}-second video. Please purchase more credits.`);
      return;
    }

    // Check if user is authenticated
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      toast.error('Session expired. Please log in again.');
      return;
    }

    console.log('Generating video with session, user ID:', session.user.id);

    setIsGenerating(true);
    setProgress(0);
    setGeneratedVideo(null);
    setGenerationId(null);
    setRetryCount(0);

    try {
      // Upload image to Supabase storage first
      toast.info('Uploading image...');
      const imageUrl = await uploadImageToSupabase(selectedImage);

      toast.info('Starting video generation with audio... This will take a few minutes.');

      const { data, error } = await supabase.functions.invoke('generate-video', {
        body: {
          imageUrl,
          prompt: prompt.trim(),
          duration: duration,
          segmentType: segmentType
        }
      });

      console.log('Edge function response:', { data, error });

      if (error) {
        console.error('Edge function error:', error);
        throw new Error(error.message || 'Edge function failed');
      }

      if (!data || !data.success) {
        console.error('Video generation failed:', data);
        throw new Error(data?.error || data?.details || 'Video generation failed');
      }

      // Store generation ID and start polling
      const genId = data.generationId;
      setGenerationId(genId);
      if (data.isMultiSegment) {
        setParentGenerationId(genId);
        // For multi-segment, poll using parent generation ID
        startPolling(genId);
      } else {
        // For single segment, poll using generation ID
        startPolling(genId);
      }
      toast.info('Video generation started! We\'ll notify you when it\'s ready.');
      
    } catch (error: any) {
      console.error('Video generation error:', error);
      toast.error(error.message || 'Failed to generate video. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const continueNextSegment = async () => {
    if (!nextSegmentPrompt.trim()) {
      toast.error('Please enter a prompt for the next scene');
      return;
    }

    if (!lastFrameUrl || !parentGenerationId) {
      toast.error('Missing information to continue segment generation');
      return;
    }

    // Validate that we're not trying to generate beyond the total segments
    if (segmentProgress && currentSegmentIndex >= segmentProgress.total) {
      toast.error('All segments have been generated. Stitching should start automatically.');
      return;
    }

    setIsGenerating(true);
    setProgress(85);
    setGenerationStatus(`Generating segment ${currentSegmentIndex + 1}...`);

    try {
      // Use direct fetch instead of supabase.functions.invoke to avoid routing issues
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Authentication required');
      }

      console.log('Continuing segment generation:', {
        parentGenerationId,
        segmentIndex: currentSegmentIndex,
        prompt: nextSegmentPrompt.trim(),
        hasLastFrameUrl: !!lastFrameUrl
      });

      const response = await fetch(`${SUPABASE_URL}/functions/v1/continue-segment-generation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': SUPABASE_PUBLISHABLE_KEY
        },
        body: JSON.stringify({
          parentGenerationId: parentGenerationId,
          segmentIndex: currentSegmentIndex,
          prompt: nextSegmentPrompt.trim(),
          lastFrameUrl: lastFrameUrl
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: `HTTP ${response.status}: ${response.statusText}` }));
        console.error('Continue segment generation error:', errorData);
        const errorMessage = errorData.details || errorData.error || errorData.segmentError || `HTTP ${response.status}: ${response.statusText}`;
        throw new Error(errorMessage);
      }

      const data = await response.json();

      if (!data || !data.success) {
        throw new Error(data?.error || data?.details || 'Failed to continue segment generation');
      }

      // Clear waiting state and resume polling
      setWaitingForNextSegment(false);
      setNextSegmentPrompt("");
      setLastFrameUrl(null);
      setCompletedSegmentVideoUrl(null);
      setIsPolling(true);
      
      // Resume polling with parent generation ID
      startPolling(parentGenerationId);
      
      toast.success(`Segment ${currentSegmentIndex + 1} generation started!`);
      
    } catch (error: any) {
      console.error('Error continuing segment generation:', error);
      toast.error(error.message || 'Failed to continue segment generation');
    } finally {
      setIsGenerating(false);
    }
  };

  const downloadVideo = async () => {
    if (!generatedVideo) return;
    
    try {
      toast.info('Downloading video...');
      
      // Fetch the video with proper CORS headers
      const response = await fetch(generatedVideo.url, {
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
      a.download = `vloggo-video-${Date.now()}.mp4`;
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

  const enhancePrompt = async () => {
    if (!prompt.trim()) {
      toast.error('Please enter a prompt to enhance');
      return;
    }

    setIsEnhancingPrompt(true);
    try {
      const { data, error } = await supabase.functions.invoke('enhance-prompt', {
        body: {
          prompt: prompt.trim(),
        }
      });

      if (error) {
        console.error('Prompt enhancement error:', error);
        throw new Error(error.message || 'Failed to enhance prompt');
      }

      if (!data?.success || !data?.enhancedPrompt) {
        throw new Error('No enhanced prompt received');
      }

      // Update the prompt textbox with the enhanced prompt
      setPrompt(data.enhancedPrompt.enhancedPrompt);
      toast.success('Prompt enhanced successfully!');
    } catch (error: any) {
      console.error('Error enhancing prompt:', error);
      toast.error(error.message || 'Failed to enhance prompt');
    } finally {
      setIsEnhancingPrompt(false);
    }
  };

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-background">
        {/* Header */}
        <header className="glass-card border-b border-white/10">
          <div className="container mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => window.history.back()}
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Dashboard
                </Button>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-gradient-primary rounded-lg flex items-center justify-center">
                    <Wand2 className="w-5 h-5 text-white" />
                  </div>
                  <span className="text-xl font-bold gradient-text">Image to Video</span>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="glass-card px-4 py-2 rounded-full flex items-center gap-2">
                  <Zap className="w-4 h-4 text-accent" />
                  <span className="font-semibold">{profile?.credits || 0}</span>
                  <span className="text-sm text-muted-foreground">credits</span>
                </div>
              </div>
            </div>
          </div>
        </header>

        <div className="container mx-auto px-4 py-8">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-8">
              <h1 className="text-4xl font-bold mb-4">
                Transform <span className="gradient-text">Images</span> into <span className="gradient-text">Videos</span>
              </h1>
              <p className="text-xl text-muted-foreground">
                Upload an image and watch it come to life with AI-powered video generation <span className="gradient-text font-semibold">with audio</span>
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Input Section */}
              <div className="space-y-6">
                <Card className="glass-card">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <ImageIcon className="w-5 h-5" />
                      Upload Image
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div
                        className="border-2 border-dashed border-white/20 rounded-lg p-8 text-center cursor-pointer hover:border-white/40 transition-colors"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        {imagePreview ? (
                          <div className="space-y-4">
                            <img
                              src={imagePreview}
                              alt="Preview"
                              className="max-h-48 mx-auto rounded-lg"
                            />
                            <p className="text-sm text-muted-foreground">
                              Click to change image
                            </p>
                          </div>
                        ) : (
                          <div className="space-y-4">
                            <Upload className="w-12 h-12 mx-auto text-muted-foreground" />
                            <div>
                              <p className="font-medium">Click to upload an image</p>
                              <p className="text-sm text-muted-foreground">
                                PNG, JPG, JPEG up to 10MB
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleImageUpload}
                        className="hidden"
                      />
                    </div>
                  </CardContent>
                </Card>

                <Card className="glass-card">
                  <CardHeader>
                    <CardTitle>Generation Settings</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="block text-sm font-medium">
                          Motion Prompt
                        </label>
                        <Button
                          onClick={enhancePrompt}
                          disabled={isEnhancingPrompt || !prompt.trim()}
                          variant="outline"
                          size="sm"
                          className="text-xs"
                        >
                          {isEnhancingPrompt ? (
                            <>
                              <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
                              Enhancing...
                            </>
                          ) : (
                            <>
                              <Sparkles className="w-3 h-3 mr-1" />
                              Enhance with AI
                            </>
                          )}
                        </Button>
                      </div>
                      <Textarea
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder="Describe the scene and atmosphere... (e.g., 'A serene forest with gentle wind and rustling leaves'). Audio will be generated automatically!"
                        className="resize-none"
                        rows={8}
                      />
                    </div>

                    {/* Duration Selection */}
                    <div className="space-y-3">
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Video Duration
                      </label>
                      
                      {/* Segment Type Toggle */}
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant={segmentType === 6 ? "default" : "outline"}
                          onClick={() => handleSegmentTypeChange(6)}
                          className="flex-1"
                          size="sm"
                        >
                          6s Segments
                        </Button>
                        <Button
                          type="button"
                          variant={segmentType === 10 ? "default" : "outline"}
                          onClick={() => handleSegmentTypeChange(10)}
                          className="flex-1"
                          size="sm"
                        >
                          10s Segments
                        </Button>
                      </div>
                      
                      <div className="space-y-2">
                        <input
                          type="range"
                          min={segmentType}
                          max="240"
                          step={segmentType}
                          value={duration}
                          onChange={(e) => setDuration(parseInt(e.target.value))}
                          className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
                        />
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>{segmentType}s</span>
                          <span className="font-semibold">{duration}s</span>
                          <span>240s (4min)</span>
                        </div>
                        <div className="p-3 bg-muted rounded-lg">
                          <div className="text-sm font-medium mb-1">
                            {segments.length} segment{segments.length > 1 ? 's' : ''} ({segments.map(s => `${s}s`).join(' + ')})
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Total cost: {creditCost} credit{creditCost > 1 ? 's' : ''} ({segments.map((seg) => `${seg === 6 ? '1' : '2'} credit${seg === 10 ? 's' : ''}`).join(' + ')})
                          </div>
                        </div>
                      </div>
                    </div>

                    <Button
                      onClick={generateVideo}
                      disabled={!selectedImage || isGenerating || isPolling || (profile?.credits || 0) < creditCost}
                      className="w-full"
                      variant="glass-primary"
                      size="lg"
                    >
                      {isGenerating ? (
                        <>
                          <Wand2 className="w-4 h-4 mr-2 animate-spin" />
                          Starting Generation...
                        </>
                      ) : isPolling ? (
                        <>
                          <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                          Generating Video...
                        </>
                      ) : (
                        <>
                          <Play className="w-4 h-4 mr-2" />
                          Generate {duration}s Video ({creditCost} credit{creditCost > 1 ? 's' : ''})
                        </>
                      )}
                    </Button>

                    {(isGenerating || isPolling) && (
                      <div className="space-y-2">
                        <Progress value={progress} className="w-full" />
                        <p className="text-sm text-center text-muted-foreground">
                          {generationStatus || (isGenerating 
                            ? "Starting video generation..." 
                            : progress <= 40 
                              ? "Step 1: Generating video..." 
                              : progress <= 70 
                                ? "Step 2: Adding audio..." 
                                : "Finalizing your video...")}
                        </p>
                        {segmentProgress && (
                          <div className="p-2 bg-muted rounded-lg">
                            <div className="text-xs text-center font-medium mb-1">
                              Segment Progress: {segmentProgress.completed}/{segmentProgress.total} completed
                            </div>
                            {segmentProgress.current && !isStitching && (
                              <div className="text-xs text-center text-muted-foreground">
                                Currently generating segment {segmentProgress.current}...
                              </div>
                            )}
                            {isStitching && (
                              <div className="text-xs text-center text-muted-foreground">
                                Stitching all segments together...
                              </div>
                            )}
                          </div>
                        )}
                        {generationId && (
                          <p className="text-xs text-center text-muted-foreground">
                            Generation ID: {generationId.substring(0, 8)}...
                          </p>
                        )}
                        {!segmentProgress && (
                          <div className="flex justify-center space-x-2 text-xs text-muted-foreground">
                            <span className={progress >= 20 ? "text-accent" : ""}>1. Video</span>
                            <span>→</span>
                            <span className={progress >= 70 ? "text-accent" : ""}>2. Audio</span>
                            <span>→</span>
                            <span className={progress >= 100 ? "text-accent" : ""}>3. Complete</span>
                          </div>
                        )}
                        {isPolling && generationId && (
                          <Button
                            onClick={async () => {
                              const statusData = await checkVideoStatus(generationId);
                              if (statusData?.status === 'completed') {
                                setIsPolling(false);
                                setProgress(100);
                                setGenerationStatus('Video with audio ready!');
                                
                                const { data: generation } = await supabase
                                  .from('video_generations' as any)
                                  .select('*')
                                  .eq('id', generationId)
                                  .single();

                                if ((generation as any)?.storage_url) {
                                  setGeneratedVideo({
                                    url: (generation as any).storage_url,
                                    prompt: (generation as any).prompt,
                                    duration: (generation as any).duration || duration
                                  });
                                  toast.success('Video with audio generated successfully!');
                                }
                              }
                            }}
                            variant="outline"
                            size="sm"
                            className="mx-auto"
                          >
                            <RefreshCw className="w-3 h-3 mr-1" />
                            Check Status
                          </Button>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>

              </div>

              {/* Output Section */}
              <div>
                {waitingForNextSegment && segmentProgress && currentSegmentIndex < segmentProgress.total && (
                  <div className="mb-4 p-4 bg-gradient-to-r from-primary/20 to-secondary/20 border-2 border-primary/50 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <Zap className="w-5 h-5 text-primary" />
                      <h3 className="text-lg font-bold">Segment {segmentProgress?.completed || 0} of {segmentProgress?.total || 0} Completed!</h3>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Provide the prompt for <strong>Segment {segmentProgress?.completed ? segmentProgress.completed + 1 : currentSegmentIndex + 1}</strong> of {segmentProgress?.total || 0} below.
                    </p>
                  </div>
                )}
                {waitingForNextSegment && segmentProgress && currentSegmentIndex >= segmentProgress.total && (
                  <div className="mb-4 p-4 bg-gradient-to-r from-green-500/20 to-blue-500/20 border-2 border-green-500/50 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <CheckCircle className="w-5 h-5 text-green-500" />
                      <h3 className="text-lg font-bold text-green-700 dark:text-green-400">All Segments Completed!</h3>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      All {segmentProgress.total} segments have been generated. The video is being stitched together automatically...
                    </p>
                  </div>
                )}
                
                <Card className="glass-card">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <VideoIcon className="w-5 h-5" />
                      {isStitching ? 'Stitching Segments...' : waitingForNextSegment ? `Segment ${segmentProgress?.completed ? segmentProgress.completed + 1 : currentSegmentIndex + 1} of ${segmentProgress?.total || 0}` : 'Generated Video'}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {(waitingForNextSegment || (isStitching && completedSegmentVideoUrl)) ? (
                      <div className="space-y-6">
                        {/* Show completed segment video if available */}
                        {completedSegmentVideoUrl && (
                          <div className="space-y-2">
                            <label className="text-sm font-semibold text-primary">
                              {isStitching 
                                ? `Last Completed Segment (${segmentProgress?.completed || segmentProgress?.total || 0} of ${segmentProgress?.total || 0})`
                                : `Completed Segment ${segmentProgress?.completed || 1} (of ${segmentProgress?.total || 0}):`
                              }
                            </label>
                            <video
                              src={completedSegmentVideoUrl}
                              controls
                              className="w-full rounded-lg border-2 border-primary/30"
                              autoPlay
                              muted
                            >
                              Your browser does not support the video tag.
                            </video>
                          </div>
                        )}
                        
                        {/* Last Frame Section - Only show if not stitching and not all segments completed */}
                        {!isStitching && segmentProgress && segmentProgress.completed < segmentProgress.total && lastFrameUrl ? (
                          <div className="space-y-2">
                            <label className="text-sm font-semibold flex items-center gap-2">
                              <ImageIcon className="w-4 h-4" />
                              Last Frame from Segment {segmentProgress?.completed || 0}:
                            </label>
                            <div className="relative">
                              <img 
                                src={lastFrameUrl} 
                                alt="Last frame from previous segment" 
                                className="w-full rounded-lg border-4 border-primary/50 shadow-lg"
                              />
                              <div className="absolute top-2 right-2 bg-primary/90 text-white text-xs px-2 py-1 rounded">
                                Last Frame
                              </div>
                            </div>
                            <p className="text-xs text-muted-foreground text-center">
                              This is where Segment {segmentProgress?.completed || 1} ended. Describe what should happen next.
                            </p>
                          </div>
                        ) : !isStitching && segmentProgress && segmentProgress.completed < segmentProgress.total && completedSegmentVideoUrl ? (
                          <div className="space-y-2">
                            <label className="text-sm font-semibold flex items-center gap-2">
                              <VideoIcon className="w-4 h-4" />
                              Watch Segment {segmentProgress?.completed || 1} to see where it ended:
                            </label>
                            <video
                              key={completedSegmentVideoUrl} // Force re-render when URL changes
                              src={completedSegmentVideoUrl}
                              controls
                              className="w-full rounded-lg border-4 border-primary/50 shadow-lg"
                              onLoadedMetadata={(e) => {
                                console.log('Video metadata loaded in UI, duration:', e.currentTarget.duration);
                                // Try to seek to end when video loads
                                const video = e.currentTarget;
                                if (video.duration) {
                                  video.currentTime = video.duration - 0.1;
                                }
                              }}
                              onEnded={(e) => {
                                // When video ends, try to extract frame only if more segments remain
                                const video = e.currentTarget;
                                if (!lastFrameUrl && completedSegmentVideoUrl && parentGenerationId && segmentProgress && segmentProgress.completed < segmentProgress.total) {
                                  console.log('Video ended, attempting frame extraction');
                                  const lastCompletedSegmentIndex = Math.max(0, (segmentProgress?.completed || 1) - 1);
                                  extractLastFrameFromVideo(completedSegmentVideoUrl, parentGenerationId, lastCompletedSegmentIndex)
                                    .then((frameUrl) => {
                                      console.log('Frame extracted from video end event:', frameUrl);
                                      setLastFrameUrl(frameUrl);
                                      toast.success('Last frame extracted!');
                                    })
                                    .catch((error) => {
                                      console.error('Frame extraction failed:', error);
                                    });
                                }
                              }}
                              onError={(e) => {
                                console.error('Video load error in UI:', e);
                                toast.error('Failed to load video. Please check the URL.');
                              }}
                            >
                              Your browser does not support the video tag.
                            </video>
                            <p className="text-xs text-muted-foreground text-center">
                              <strong>Tip:</strong> Drag the video to the end to see the last frame, then describe what should happen next.
                            </p>
                            {!lastFrameUrl && segmentProgress && segmentProgress.completed < segmentProgress.total && (
                              <Button
                                onClick={() => {
                                  if (completedSegmentVideoUrl && parentGenerationId && segmentProgress && segmentProgress.completed < segmentProgress.total) {
                                    const lastCompletedSegmentIndex = Math.max(0, (segmentProgress?.completed || 1) - 1);
                                    toast.info('Extracting last frame...');
                                    console.log('Manual frame extraction triggered');
                                    extractLastFrameFromVideo(completedSegmentVideoUrl, parentGenerationId, lastCompletedSegmentIndex)
                                      .then((frameUrl) => {
                                        console.log('Manual frame extraction successful:', frameUrl);
                                        setLastFrameUrl(frameUrl);
                                        toast.success('Last frame extracted!');
                                      })
                                      .catch((error) => {
                                        console.error('Manual frame extraction failed:', error);
                                        toast.error(`Frame extraction failed: ${error.message}`);
                                      });
                                  }
                                }}
                                variant="outline"
                                size="sm"
                                className="w-full"
                              >
                                <ImageIcon className="w-4 h-4 mr-2" />
                                Extract Last Frame
                              </Button>
                            )}
                          </div>
                        ) : isStitching ? (
                          <div className="p-8 border-2 border-dashed border-primary/50 rounded-lg text-center">
                            <RefreshCw className="w-8 h-8 mx-auto mb-2 animate-spin text-primary" />
                            <p className="text-sm text-muted-foreground mb-2">Stitching all segments together...</p>
                            <p className="text-xs text-muted-foreground">This may take a few moments. The final video will appear here when ready.</p>
                          </div>
                        ) : (
                          <div className="p-8 border-2 border-dashed border-muted rounded-lg text-center">
                            <RefreshCw className="w-8 h-8 mx-auto mb-2 animate-spin text-primary" />
                            <p className="text-sm text-muted-foreground mb-2">Waiting for video URL...</p>
                            <p className="text-xs text-muted-foreground">The completed segment video is being processed.</p>
                          </div>
                        )}

                        {/* Next Scene Prompt Section - Only show if not all segments completed and not stitching */}
                        {!isStitching && segmentProgress && currentSegmentIndex < segmentProgress.total && (
                          <div className="space-y-3 p-4 bg-muted/50 rounded-lg border-2 border-primary/30">
                            <label className="text-base font-bold flex items-center gap-2">
                              <Sparkles className="w-5 h-5 text-primary" />
                              Next Scene Prompt for Segment {segmentProgress?.completed ? segmentProgress.completed + 1 : currentSegmentIndex + 1}
                            </label>
                            <p className="text-xs text-muted-foreground">
                              Describe what should happen in the next {segmentType}-second segment. Be specific about movement, atmosphere, and visual elements.
                            </p>
                            <Textarea
                              value={nextSegmentPrompt}
                              onChange={(e) => setNextSegmentPrompt(e.target.value)}
                              placeholder="Example: 'The character walks forward, camera follows as they approach a glowing portal. Dramatic lighting and atmospheric effects.'"
                              className="resize-none text-base"
                            rows={5}
                          />
                            <Button
                              onClick={continueNextSegment}
                              disabled={!nextSegmentPrompt.trim() || isGenerating}
                              className="w-full h-12 text-lg font-bold"
                              variant="glass-primary"
                              size="lg"
                            >
                              {isGenerating ? (
                                <>
                                  <RefreshCw className="w-5 h-5 mr-2 animate-spin" />
                                  Generating Segment {currentSegmentIndex + 1}...
                                </>
                              ) : (
                                <>
                                  <Play className="w-5 h-5 mr-2" />
                                  Generate Segment {currentSegmentIndex + 1} ({segmentType}s)
                                </>
                              )}
                            </Button>
                          </div>
                        )}
                      </div>
                    ) : generatedVideo ? (
                      <div className="space-y-4">
                        <video
                          src={generatedVideo.url}
                          controls
                          className="w-full rounded-lg"
                          poster={imagePreview}
                        >
                          Your browser does not support the video tag.
                        </video>
                        
                        <div className="space-y-2">
                          <p className="text-sm text-muted-foreground">
                            <strong>Prompt:</strong> {generatedVideo.prompt}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            <strong>Duration:</strong> {generatedVideo.duration} seconds
                          </p>
                        </div>

                        <Button
                          onClick={downloadVideo}
                          variant="outline"
                          className="w-full"
                        >
                          <Download className="w-4 h-4 mr-2" />
                          Download Video
                        </Button>
                      </div>
                    ) : (
                      <div className="text-center py-12">
                        <VideoIcon className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
                        <p className="text-lg font-medium mb-2">No video generated yet</p>
                        <p className="text-muted-foreground">
                          Upload an image and click generate to create your video
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
};

export default Generate;
