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
  Zap
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import { supabase } from "@/integrations/supabase/client";

const Generate = () => {
  const { user, profile } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>("");
  const [prompt, setPrompt] = useState("Transform this image into a cinematic video with smooth camera movement");
  const [duration, setDuration] = useState(5);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [generatedVideo, setGeneratedVideo] = useState<{
    url: string;
    prompt: string;
    duration: number;
  } | null>(null);

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

  const uploadImageToLeonardo = async (file: File): Promise<string> => {
    try {
      // Get file extension
      const fileExt = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      
      console.log('Calling init-leonardo-upload with extension:', fileExt);
      
      // Get presigned upload URL from Leonardo AI
      const { data: initData, error: initError } = await supabase.functions.invoke('init-leonardo-upload', {
        body: { extension: fileExt }
      });
      
      console.log('Init Leonardo response:', { initData, initError });
      
      if (initError) {
        console.error('Init Leonardo error:', initError);
        throw new Error('Failed to initialize Leonardo upload: ' + initError.message);
      }
      
      if (!initData?.uploadInitImage) {
        console.error('No upload data in response:', initData);
        throw new Error('No upload data received from Leonardo AI');
      }
      
      if (!initData?.uploadInitImage) {
        console.error('No upload data in response:', initData);
        throw new Error('No upload data received from Leonardo AI');
      }
      
      const { url: uploadUrl, fields, id: imageId } = initData.uploadInitImage;
      console.log('Got upload URL and image ID:', { uploadUrl, imageId, fieldsCount: typeof fields === 'string' ? fields.length : Object.keys(fields || {}).length });

      // Prepare base64
      const arrayBuffer = await file.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      let binary = '';
      const chunkSize = 0x8000;
      for (let i = 0; i < uint8Array.length; i += chunkSize) {
        const chunk = uint8Array.subarray(i, i + chunkSize);
        binary += String.fromCharCode.apply(null, Array.from(chunk) as any);
      }
      const fileBase64 = btoa(binary);

      // Upload via edge function to avoid CORS
      const { data: uploadData, error: uploadError } = await supabase.functions.invoke('upload-leonardo-file', {
        body: {
          uploadUrl,
          fields,
          fileBase64,
          filename: file.name,
          contentType: file.type
        }
      });

      console.log('upload-leonardo-file response:', { uploadData, uploadError });
      if (uploadError) {
        throw new Error(uploadError.message || 'Upload to Leonardo failed');
      }
      if (!uploadData?.success) {
        throw new Error('Upload to Leonardo failed');
      }
      
      console.log('Upload successful, returning image ID:', imageId);
      return imageId;
    } catch (error) {
      console.error('Error in uploadImageToLeonardo:', error);
      throw error;
    }
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

    if ((profile?.credits || 0) < 1) {
      toast.error('Insufficient credits. Please purchase more credits.');
      return;
    }

    setIsGenerating(true);
    setProgress(0);
    setGeneratedVideo(null);

    try {
      // Simulate progress
      const progressInterval = setInterval(() => {
        setProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + 10;
        });
      }, 1000);

      // Upload image directly to Leonardo AI
      toast.info('Uploading image to Leonardo AI...');
      const leonardoImageId = await uploadImageToLeonardo(selectedImage);

      toast.info('Generating video... This may take a few minutes.');
      
      const { data, error } = await supabase.functions.invoke('generate-video', {
        body: {
          leonardoImageId,
          prompt: prompt.trim(),
          duration
        }
      });

      console.log('Edge function response:', { data, error });

      clearInterval(progressInterval);
      setProgress(100);

      if (error) {
        console.error('Edge function error:', error);
        throw new Error(error.message || 'Edge function failed');
      }

      if (!data || !data.success) {
        console.error('Video generation failed:', data);
        throw new Error(data?.error || data?.details || 'Video generation failed');
      }

      setGeneratedVideo({
        url: data.videoUrl,
        prompt: data.prompt,
        duration: data.duration
      });

      toast.success('Video generated successfully!');
      
      // Update the profile context to reflect new credit balance
      // This will be reflected in the dashboard
      
    } catch (error: any) {
      console.error('Video generation error:', error);
      toast.error(error.message || 'Failed to generate video. Please try again.');
    } finally {
      setIsGenerating(false);
      setProgress(0);
    }
  };

  const downloadVideo = async () => {
    if (!generatedVideo) return;
    
    try {
      const response = await fetch(generatedVideo.url);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `generated-video-${Date.now()}.mp4`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success('Video download started');
    } catch (error) {
      toast.error('Failed to download video');
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
                Upload an image and watch it come to life with AI-powered video generation
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
                      <label className="block text-sm font-medium mb-2">
                        Motion Prompt
                      </label>
                      <Textarea
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder="Describe how you want the image to move..."
                        className="resize-none"
                        rows={3}
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium mb-2">
                        Duration (seconds)
                      </label>
                      <Input
                        type="number"
                        min="3"
                        max="10"
                        value={duration}
                        onChange={(e) => setDuration(Number(e.target.value))}
                      />
                    </div>

                    <Button
                      onClick={generateVideo}
                      disabled={!selectedImage || isGenerating || (profile?.credits || 0) < 1}
                      className="w-full"
                      variant="glass-primary"
                      size="lg"
                    >
                      {isGenerating ? (
                        <>
                          <Wand2 className="w-4 h-4 mr-2 animate-spin" />
                          Generating Video...
                        </>
                      ) : (
                        <>
                          <Play className="w-4 h-4 mr-2" />
                          Generate Video (1 credit)
                        </>
                      )}
                    </Button>

                    {isGenerating && (
                      <div className="space-y-2">
                        <Progress value={progress} className="w-full" />
                        <p className="text-sm text-center text-muted-foreground">
                          Generating your video... Please wait.
                        </p>
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