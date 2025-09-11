import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  Wand2, 
  Check, 
  X, 
  RefreshCw, 
  Camera, 
  Palette, 
  Clock,
  Monitor,
  Zap
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface EnhancedPrompt {
  originalPrompt: string;
  enhancedPrompt: string;
  cameraMovements: string[];
  visualEffects: string[];
  mood: string;
  duration: number;
  technicalSpecs: {
    resolution: string;
    fps: number;
    style: string;
  };
  detailedDescription: string;
  sceneComposition: string;
  lighting: string;
  colorPalette: string;
  motionStyle: string;
  cinematicElements: string[];
}

interface PromptEnhancerProps {
  onPromptAccepted: (enhancedPrompt: EnhancedPrompt) => void;
  onPromptRejected: () => void;
  initialPrompt?: string;
}

export function PromptEnhancer({ 
  onPromptAccepted, 
  onPromptRejected, 
  initialPrompt = "" 
}: PromptEnhancerProps) {
  const [originalPrompt, setOriginalPrompt] = useState(initialPrompt);
  const [enhancedPrompt, setEnhancedPrompt] = useState<EnhancedPrompt | null>(null);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [isAccepted, setIsAccepted] = useState(false);

  const enhancePrompt = async () => {
    if (!originalPrompt.trim()) {
      toast.error('Please enter a prompt to enhance');
      return;
    }

    setIsEnhancing(true);
    try {
      const { data, error } = await supabase.functions.invoke('enhance-prompt', {
        body: {
          prompt: originalPrompt.trim(),
        }
      });

      if (error) {
        console.error('Prompt enhancement error:', error);
        throw new Error(error.message || 'Failed to enhance prompt');
      }

      if (!data?.success || !data?.enhancedPrompt) {
        throw new Error('No enhanced prompt received');
      }

      setEnhancedPrompt(data.enhancedPrompt);
      toast.success('Prompt enhanced successfully!');
    } catch (error: any) {
      console.error('Error enhancing prompt:', error);
      toast.error(error.message || 'Failed to enhance prompt');
    } finally {
      setIsEnhancing(false);
    }
  };

  const handleAccept = () => {
    if (enhancedPrompt) {
      onPromptAccepted(enhancedPrompt);
      setIsAccepted(true);
      toast.success('Enhanced prompt accepted!');
    }
  };

  const handleReject = () => {
    onPromptRejected();
    setEnhancedPrompt(null);
    setIsAccepted(false);
    toast.info('Using original prompt');
  };

  const handleRegenerate = () => {
    setEnhancedPrompt(null);
    setIsAccepted(false);
    enhancePrompt();
  };

  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wand2 className="w-5 h-5 text-accent" />
          AI Prompt Enhancer
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Transform your basic prompt into a detailed, professional video generation prompt
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Original Prompt Input */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Your Original Prompt</label>
          <Textarea
            value={originalPrompt}
            onChange={(e) => setOriginalPrompt(e.target.value)}
            placeholder="Describe how you want your image to move... (e.g., 'make it zoom in slowly')"
            className="resize-none"
            rows={3}
            disabled={isEnhancing || isAccepted}
          />
        </div>

        {/* Enhance Button */}
        {!enhancedPrompt && !isAccepted && (
          <Button
            onClick={enhancePrompt}
            disabled={isEnhancing || !originalPrompt.trim()}
            className="w-full"
            variant="glass-primary"
          >
            {isEnhancing ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                Enhancing Prompt...
              </>
            ) : (
              <>
                <Wand2 className="w-4 h-4 mr-2" />
                Enhance My Prompt
              </>
            )}
          </Button>
        )}

        {/* Enhanced Prompt Display */}
        {enhancedPrompt && !isAccepted && (
          <div className="space-y-4">
            <Separator />
            
            {/* Enhanced Prompt */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-green-400">Enhanced Prompt</label>
              <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
                <p className="text-sm leading-relaxed">{enhancedPrompt.enhancedPrompt}</p>
              </div>
            </div>

            {/* Detailed Description */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-blue-400">Detailed Description</label>
              <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                <p className="text-sm leading-relaxed">{enhancedPrompt.detailedDescription}</p>
              </div>
            </div>

            {/* Technical Details Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Camera Movements */}
              {enhancedPrompt.cameraMovements.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Camera className="w-4 h-4" />
                    Camera Movements
                  </div>
                  <div className="flex flex-wrap gap-1 max-w-full overflow-hidden">
                    {enhancedPrompt.cameraMovements.map((movement, index) => (
                      <Badge key={index} variant="secondary" className="text-xs whitespace-nowrap">
                        {movement}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Visual Effects */}
              {enhancedPrompt.visualEffects.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Palette className="w-4 h-4" />
                    Visual Effects
                  </div>
                  <div className="flex flex-wrap gap-1 max-w-full overflow-hidden">
                    {enhancedPrompt.visualEffects.map((effect, index) => (
                      <Badge key={index} variant="outline" className="text-xs whitespace-nowrap">
                        {effect}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Scene Composition */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Monitor className="w-4 h-4" />
                  Scene Composition
                </div>
                <p className="text-xs text-muted-foreground">{enhancedPrompt.sceneComposition}</p>
              </div>

              {/* Lighting */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Zap className="w-4 h-4" />
                  Lighting
                </div>
                <p className="text-xs text-muted-foreground">{enhancedPrompt.lighting}</p>
              </div>

              {/* Color Palette */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Palette className="w-4 h-4" />
                  Color Palette
                </div>
                <p className="text-xs text-muted-foreground">{enhancedPrompt.colorPalette}</p>
              </div>

              {/* Motion Style */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Camera className="w-4 h-4" />
                  Motion Style
                </div>
                <p className="text-xs text-muted-foreground">{enhancedPrompt.motionStyle}</p>
              </div>
            </div>

            {/* Cinematic Elements */}
            {enhancedPrompt.cinematicElements.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Wand2 className="w-4 h-4" />
                  Cinematic Elements
                </div>
                <div className="flex flex-wrap gap-1 max-w-full overflow-hidden">
                  {enhancedPrompt.cinematicElements.map((element, index) => (
                    <Badge key={index} variant="secondary" className="text-xs whitespace-nowrap">
                      {element}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Mood & Duration & Technical Specs */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Zap className="w-4 h-4" />
                  Mood
                </div>
                <Badge variant="outline" className="text-xs">
                  {enhancedPrompt.mood}
                </Badge>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Clock className="w-4 h-4" />
                  Duration
                </div>
                <div className="text-xs text-muted-foreground">
                  {enhancedPrompt.duration}s
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Monitor className="w-4 h-4" />
                  Technical Specs
                </div>
                <div className="text-xs text-muted-foreground">
                  {enhancedPrompt.technicalSpecs.resolution} • {enhancedPrompt.technicalSpecs.fps} FPS
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3">
              <Button
                onClick={handleAccept}
                className="flex-1"
                variant="glass-primary"
              >
                <Check className="w-4 h-4 mr-2" />
                Accept Enhanced Prompt
              </Button>
              <Button
                onClick={handleRegenerate}
                variant="outline"
                disabled={isEnhancing}
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Regenerate
              </Button>
              <Button
                onClick={handleReject}
                variant="outline"
              >
                <X className="w-4 h-4 mr-2" />
                Use Original
              </Button>
            </div>
          </div>
        )}

        {/* Accepted State */}
        {isAccepted && (
          <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
            <div className="flex items-center gap-2 text-green-400 mb-2">
              <Check className="w-4 h-4" />
              <span className="font-medium">Enhanced prompt accepted!</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Your video will be generated using the enhanced prompt for better results.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
