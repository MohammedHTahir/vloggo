import { Button } from "@/components/ui/button";
import { ArrowRight, Sparkles, Zap, Image as ImageIcon } from "lucide-react";
import { Link } from "react-router-dom";
import heroImage from "@/assets/hero-ai-bg.jpg";

const Hero = () => {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-20">
      {/* Animated Background */}
      <div className="absolute inset-0 animated-bg"></div>
      
      {/* Grid Pattern Overlay */}
      <div className="absolute inset-0 grid-pattern opacity-20"></div>
      
      {/* Hero Background Image */}
      <div 
        className="absolute inset-0 opacity-30 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url(${heroImage})` }}
      ></div>
      
      {/* Gradient Overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-background/50 via-background/70 to-background"></div>
      
      {/* Floating Elements */}
      <div className="absolute top-20 left-10 w-20 h-20 bg-primary/20 rounded-full blur-xl float animation-delay-1000"></div>
      <div className="absolute top-40 right-20 w-32 h-32 bg-secondary/20 rounded-full blur-xl float animation-delay-2000"></div>
      <div className="absolute bottom-40 left-20 w-24 h-24 bg-accent/20 rounded-full blur-xl float animation-delay-3000"></div>
      
      {/* Main Content */}
      <div className="relative z-10 container mx-auto px-4 text-center">
        <div className="max-w-5xl mx-auto">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 glass-card px-4 py-2 rounded-full mb-8 pulse-glow">
            <Sparkles className="w-4 h-4 text-accent" />
            <span className="text-sm font-medium">Powered by Advanced AI Technology</span>
          </div>
          
          {/* Main Heading */}
          <h1 className="text-6xl md:text-8xl font-bold mb-6 leading-tight">
            Transform Images to
            <span className="block gradient-text">AI Videos</span>
            in Seconds
          </h1>
          
          {/* Subtitle */}
          <p className="text-xl md:text-2xl text-muted-foreground mb-8 max-w-3xl mx-auto leading-relaxed">
            Unleash your creativity with Vloggo' advanced AI image-to-video generation platform. 
            Transform static images into stunning dynamic videos with just a few clicks.
          </p>
          
          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-12">
            <Link to="/auth">
              <Button 
                variant="hero" 
                size="lg" 
                className="text-lg px-8 py-4 h-auto group"
              >
                Start Creating Now
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>
            <button
              onClick={() => {
                const element = document.querySelector('#pricing');
                element?.scrollIntoView({ behavior: 'smooth' });
              }}
            >
              <Button 
                variant="glass-primary" 
                size="lg" 
                className="text-lg px-8 py-4 h-auto"
              >
                View Pricing
              </Button>
            </button>
          </div>
          
          {/* Feature Pills */}
          <div className="flex flex-wrap justify-center gap-4 mb-16">
            <div className="glass-card px-4 py-2 rounded-full flex items-center gap-2">
              <Zap className="w-4 h-4 text-accent" />
              <span className="text-sm">Instant Video Creation</span>
            </div>
            <div className="glass-card px-4 py-2 rounded-full flex items-center gap-2">
              <ImageIcon className="w-4 h-4 text-secondary" />
              <span className="text-sm">Image to Video AI</span>
            </div>
            <div className="glass-card px-4 py-2 rounded-full flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              <span className="text-sm">Professional Quality</span>
            </div>
          </div>
          
          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-3xl mx-auto">
            <div className="text-center">
              <div className="text-4xl font-bold gradient-text mb-2">50K+</div>
              <div className="text-muted-foreground">Videos Generated</div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold gradient-text mb-2">10K+</div>
              <div className="text-muted-foreground">Happy Users</div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold gradient-text mb-2">99.9%</div>
              <div className="text-muted-foreground">Satisfaction Rate</div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Scroll Indicator */}
      <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 animate-bounce">
        <div className="w-6 h-10 border-2 border-white/30 rounded-full flex justify-center">
          <div className="w-1 h-3 bg-white/50 rounded-full mt-2 animate-pulse"></div>
        </div>
      </div>
    </section>
  );
};

export default Hero;