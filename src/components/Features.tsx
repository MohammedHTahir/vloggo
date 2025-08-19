import { Button } from "@/components/ui/button";
import { 
  Wand2, 
  Palette, 
  Download, 
  Zap, 
  Shield, 
  Layers,
  Sparkles,
  Camera,
  Edit3
} from "lucide-react";
import { Link } from "react-router-dom";

const Features = () => {
  const features = [
    {
      icon: Wand2,
      title: "AI Video Generation",
      description: "Transform static images into dynamic videos using advanced AI technology with incredible detail and smooth motion.",
      highlight: "AI Technology"
    },
    {
      icon: Edit3,
      title: "Smart Motion Effects",
      description: "Professional motion generation with AI assistance. Create natural movements, camera transitions, and dynamic effects.",
      highlight: "Motion AI"
    },
    {
      icon: Zap,
      title: "Lightning Fast",
      description: "Generate high-quality videos in seconds. Our optimized infrastructure ensures rapid processing without compromising quality.",
      highlight: "Ultra Fast"
    },
    {
      icon: Palette,
      title: "Style Variations",
      description: "Choose from dozens of motion styles, from subtle animations to dramatic transformations and cinematic effects.",
      highlight: "50+ Styles"
    },
    {
      icon: Shield,
      title: "Commercial License",
      description: "All generated videos come with commercial usage rights. Use them for your business, marketing, or personal projects.",
      highlight: "Commercial Use"
    },
    {
      icon: Layers,
      title: "Batch Processing",
      description: "Convert multiple images to videos at once. Perfect for creating video content efficiently at scale.",
      highlight: "Bulk Convert"
    }
  ];

  return (
    <section className="py-24 relative overflow-hidden">
      {/* Background Elements */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-0 left-1/4 w-72 h-72 bg-primary/30 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-secondary/20 rounded-full blur-3xl"></div>
      </div>
      
      <div className="container mx-auto px-4 relative z-10">
        {/* Section Header */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 glass-card px-4 py-2 rounded-full mb-6">
            <Sparkles className="w-4 h-4 text-accent" />
            <span className="text-sm font-medium">Powerful Features</span>
          </div>
          
          <h2 className="text-5xl md:text-6xl font-bold mb-6">
            Everything You Need to
            <span className="block gradient-text">Create Amazing Videos</span>
          </h2>
          
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            From image-to-video AI generation to professional motion effects, Vloggo provides all the tools 
            you need to bring your static images to life.
          </p>
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-16">
          {features.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <div 
                key={index} 
                className="glass-card p-8 rounded-2xl hover:scale-105 transition-all duration-300 group relative overflow-hidden"
              >
                {/* Feature Highlight Badge */}
                <div className="absolute top-4 right-4 glass px-3 py-1 rounded-full text-xs font-medium text-accent border border-accent/30">
                  {feature.highlight}
                </div>
                
                {/* Icon */}
                <div className="w-16 h-16 bg-gradient-primary rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300 shadow-glow-primary">
                  <Icon className="w-8 h-8 text-white" />
                </div>
                
                {/* Content */}
                <h3 className="text-2xl font-bold mb-4 group-hover:gradient-text transition-all duration-300">
                  {feature.title}
                </h3>
                <p className="text-muted-foreground leading-relaxed">
                  {feature.description}
                </p>
                
                {/* Hover Effect */}
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-secondary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"></div>
              </div>
            );
          })}
        </div>

        {/* Bottom CTA */}
        <div className="text-center">
          <div className="glass-card p-8 rounded-2xl max-w-2xl mx-auto">
            <div className="flex items-center justify-center gap-2 mb-4">
              <Camera className="w-6 h-6 text-accent" />
              <h3 className="text-2xl font-bold">Ready to Start Creating?</h3>
            </div>
            <p className="text-muted-foreground mb-6">
              Join thousands of creators who are already using Vloggo to bring their ideas to life.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link to="/auth">
                <Button variant="premium" size="lg" className="px-8">
                  Try Free Now
                </Button>
              </Link>
              <button
                onClick={() => {
                  const el = document.querySelector('#pricing');
                  el?.scrollIntoView({ behavior: 'smooth' });
                }}
              >
                <Button variant="glass-primary" size="lg" className="px-8">
                  View Pricing
                </Button>
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Features;