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
  RefreshCw
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import { supabase } from "@/integrations/supabase/client";

const Generate = () => {
  const { user, profile } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>("");
  const [prompt, setPrompt] = useState("A cinematic transformation with dramatic movement, atmosphere, and natural ambient audio");
  const [duration, setDuration] = useState<number>(6);
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

  // Calculate segments and credit cost
  const calculateSegments = (duration: number): { segments: number[], creditCost: number } => {
    const fullSegments = Math.floor(duration / 10);
    const remainder = duration % 10;
    const segments: number[] = [];
    
    // Add full 10s segments
    for (let i = 0; i < fullSegments; i++) {
      segments.push(10);
    }
    
    // Add remainder as 6s or 10s segment
    if (remainder > 0) {
      // If remainder is exactly 6, use 6s segment; if 7-9, use 10s segment
      segments.push(remainder > 6 ? 10 : 6);
    }
    
    // If no segments (shouldn't happen), default to 6s
    if (segments.length === 0) {
      segments.push(6);
    }
    
    const creditCost = segments.reduce((sum, seg) => sum + (seg === 6 ? 1 : 2), 0);
    return { segments, creditCost };
  };

  const { segments, creditCost } = calculateSegments(duration);

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

          if (data.isStitching) {
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
          duration: duration
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
      setGenerationId(data.generationId);
      toast.info('Video generation started! We\'ll notify you when it\'s ready.');
      
      // Start polling for status updates
      startPolling(data.generationId);
      
    } catch (error: any) {
      console.error('Video generation error:', error);
      toast.error(error.message || 'Failed to generate video. Please try again.');
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
                      <div className="space-y-2">
                        <input
                          type="range"
                          min="6"
                          max="240"
                          step="6"
                          value={duration}
                          onChange={(e) => setDuration(parseInt(e.target.value))}
                          className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
                        />
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>6s</span>
                          <span className="font-semibold">{duration}s</span>
                          <span>240s (4min)</span>
                        </div>
                        <div className="p-3 bg-muted rounded-lg">
                          <div className="text-sm font-medium mb-1">
                            {segments.length} segment{segments.length > 1 ? 's' : ''} ({segments.map(s => `${s}s`).join(' + ')})
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Total cost: {creditCost} credit{creditCost > 1 ? 's' : ''} ({segments.map((seg, i) => `${seg === 6 ? '1' : '2'} credit${seg === 10 ? 's' : ''}`).join(' + ')})
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
                <Card className="glass-card">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <VideoIcon className="w-5 h-5" />
                      Generated Video
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {generatedVideo ? (
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