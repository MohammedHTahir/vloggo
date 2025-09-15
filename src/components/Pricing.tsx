import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Check, Sparkles, Crown, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import CreditsPurchaseModal from "./CreditsPurchaseModal";

const Pricing = () => {
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const { toast } = useToast();

  const plans = [
    {
      name: "Starter",
      price: "$25",
      credits: 25,
      popular: false,
      icon: Zap,
      iconColor: "text-secondary",
      features: [
        "25 AI image generations",
        "Basic editing tools",
        "Standard resolution",
        "Personal use license",
        "Email support"
      ],
      buttonVariant: "glass-primary" as const,
      cardClass: "glass-card"
    },
    {
      name: "Creator",
      price: "$80",
      credits: 100,
      popular: true,
      icon: Sparkles,
      iconColor: "text-accent",
      features: [
        "100 AI image generations",
        "Advanced editing suite",
        "High resolution exports",
        "Commercial use license",
        "Priority support",
        "Style presets library",
        "Bulk generation"
      ],
      buttonVariant: "premium" as const,
      cardClass: "glass-card border-accent/30 shadow-glow-accent"
    },
    {
      name: "Professional",
      price: "$240",
      credits: 350,
      popular: false,
      icon: Crown,
      iconColor: "text-primary",
      features: [
        "350 AI image generations",
        "Full editing capabilities",
        "Ultra-high resolution",
        "Extended commercial license",
        "Dedicated support",
        "Custom style training",
        "API access",
        "Team collaboration"
      ],
      buttonVariant: "hero" as const,
      cardClass: "glass-card border-primary/30 shadow-glow-primary"
    }
  ];

  const handlePurchase = async (credits: number, price: string) => {
    const priceNum = parseFloat(price.replace('$', ''));
    
    try {
      const { data, error } = await supabase.functions.invoke('create-payment', {
        body: {
          credits,
          amount: Math.round(priceNum * 100), // Convert to cents
          origin: window.location.origin,
        }
      });

      if (error) throw error;

      if (data.url) {
        // Open Stripe checkout in a new tab
        window.open(data.url, '_blank');
      }
    } catch (error) {
      console.error('Payment error:', error);
      toast({
        title: "Payment Error",
        description: "Failed to create payment session. Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <section className="py-24 relative overflow-hidden">
      {/* Background Elements */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-1/4 left-0 w-96 h-96 bg-accent/20 rounded-full blur-3xl"></div>
        <div className="absolute bottom-1/4 right-0 w-72 h-72 bg-primary/30 rounded-full blur-3xl"></div>
      </div>
      
      <div className="container mx-auto px-4 relative z-10">
        {/* Section Header */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 glass-card px-4 py-2 rounded-full mb-6">
            <Crown className="w-4 h-4 text-accent" />
            <span className="text-sm font-medium">Simple Pricing</span>
          </div>
          
          <h2 className="text-5xl md:text-6xl font-bold mb-6">
            Choose Your
            <span className="block gradient-text">Creative Package</span>
          </h2>
          
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Start with our free credits, then choose the perfect plan to fuel your creativity. 
            All plans include commercial licensing and premium support.
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto mb-16">
          {plans.map((plan, index) => {
            const Icon = plan.icon;
            return (
              <div 
                key={index}
                className={`${plan.cardClass} p-8 rounded-2xl relative hover:scale-105 transition-all duration-300 ${
                  plan.popular ? 'scale-105' : ''
                }`}
              >
                {/* Popular Badge */}
                {plan.popular && (
                  <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                    <div className="bg-gradient-primary px-6 py-2 rounded-full text-sm font-bold text-white shadow-glow-primary">
                      Most Popular
                    </div>
                  </div>
                )}
                
                {/* Plan Header */}
                <div className="text-center mb-8">
                  <div className={`w-16 h-16 bg-gradient-primary rounded-2xl flex items-center justify-center mx-auto mb-4 ${plan.iconColor}`}>
                    <Icon className="w-8 h-8 text-white" />
                  </div>
                  
                  <h3 className="text-2xl font-bold mb-2">{plan.name}</h3>
                  <div className="text-4xl font-bold gradient-text mb-2">{plan.price}</div>
                  <div className="text-muted-foreground">
                    {plan.credits} credits included
                  </div>
                </div>

                {/* Features */}
                <div className="space-y-4 mb-8">
                  {plan.features.map((feature, featureIndex) => (
                    <div key={featureIndex} className="flex items-center gap-3">
                      <div className="w-5 h-5 bg-gradient-primary rounded-full flex items-center justify-center flex-shrink-0">
                        <Check className="w-3 h-3 text-white" />
                      </div>
                      <span className="text-sm">{feature}</span>
                    </div>
                  ))}
                </div>

                {/* CTA Button */}
                <Button 
                  variant={plan.buttonVariant}
                  className="w-full"
                  size="lg"
                  onClick={() => handlePurchase(plan.credits, plan.price)}
                >
                  Purchase Credits
                </Button>
              </div>
            );
          })}
        </div>

        {/* Free Credits Info */}
        <div className="text-center">
          <div className="glass-card p-6 rounded-2xl max-w-2xl mx-auto">
            <div className="flex items-center justify-center gap-2 mb-3">
              <Sparkles className="w-5 h-5 text-accent" />
              <h3 className="text-xl font-bold">Start with 4 Free Credits</h3>
            </div>
            <p className="text-muted-foreground text-sm">
              Every new account gets 4 free credits to try our platform. 
              No credit card required to get started!
            </p>
          </div>
        </div>
      </div>

      <CreditsPurchaseModal 
        open={showPurchaseModal} 
        onOpenChange={setShowPurchaseModal} 
      />
    </section>
  );
};

export default Pricing;