import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sparkles, Crown, Zap, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface CreditsPurchaseModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const CreditsPurchaseModal = ({ open, onOpenChange }: CreditsPurchaseModalProps) => {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const creditPackages = [
    {
      name: "Starter Pack",
      credits: 25,
      price: 2.50,
      originalPrice: 5.00,
      popular: false,
      icon: Zap,
      iconColor: "text-secondary",
      description: "Perfect for trying out our platform",
      buttonVariant: "glass-primary" as const,
    },
    {
      name: "Creator Pack",
      credits: 100,
      price: 8.00,
      originalPrice: 20.00,
      popular: true,
      icon: Sparkles,
      iconColor: "text-accent",
      description: "Most popular choice for creators",
      buttonVariant: "premium" as const,
    },
    {
      name: "Professional Pack",
      credits: 350,
      price: 24.50,
      originalPrice: 70.00,
      popular: false,
      icon: Crown,
      iconColor: "text-primary",
      description: "For power users and professionals",
      buttonVariant: "hero" as const,
    }
  ];

  const handlePurchase = async (credits: number, price: number) => {
    try {
      setLoading(true);
      
      const { data, error } = await supabase.functions.invoke('create-payment', {
        body: {
          credits,
          amount: Math.round(price * 100), // Convert to cents
          origin: window.location.origin,
        }
      });

      if (error) throw error;

      if (data.url) {
        // Open Stripe checkout in a new tab
        window.open(data.url, '_blank');
        onOpenChange(false);
      }
    } catch (error) {
      console.error('Payment error:', error);
      toast({
        title: "Payment Error",
        description: "Failed to create payment session. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-center">
            <div className="flex items-center justify-center gap-2 mb-2">
              <Sparkles className="w-6 h-6 text-accent" />
              Purchase Credits
            </div>
            <p className="text-sm text-muted-foreground font-normal">
              Choose the perfect credit package for your creative needs
            </p>
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
          {creditPackages.map((pkg, index) => {
            const Icon = pkg.icon;
            const savings = Math.round(((pkg.originalPrice - pkg.price) / pkg.originalPrice) * 100);
            
            return (
              <div 
                key={index}
                className={`glass-card p-6 rounded-xl relative hover:scale-105 transition-all duration-300 ${
                  pkg.popular ? 'border-accent/30 shadow-glow-accent scale-105' : ''
                }`}
              >
                {/* Popular Badge */}
                {pkg.popular && (
                  <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                    <div className="bg-gradient-primary px-4 py-1 rounded-full text-xs font-bold text-white shadow-glow-primary">
                      Most Popular
                    </div>
                  </div>
                )}
                
                {/* Savings Badge */}
                <div className="absolute top-3 right-3">
                  <div className="bg-green-500/20 text-green-400 px-2 py-1 rounded-full text-xs font-bold">
                    Save {savings}%
                  </div>
                </div>

                {/* Package Header */}
                <div className="text-center mb-6">
                  <div className={`w-12 h-12 bg-gradient-primary rounded-xl flex items-center justify-center mx-auto mb-3 ${pkg.iconColor}`}>
                    <Icon className="w-6 h-6 text-white" />
                  </div>
                  
                  <h3 className="text-lg font-bold mb-1">{pkg.name}</h3>
                  <p className="text-xs text-muted-foreground mb-3">{pkg.description}</p>
                  
                  <div className="text-3xl font-bold gradient-text mb-1">
                    ${pkg.price}
                  </div>
                  <div className="text-xs text-muted-foreground line-through mb-2">
                    ${pkg.originalPrice}
                  </div>
                  <div className="text-sm text-accent font-semibold">
                    {pkg.credits} credits
                  </div>
                </div>

                {/* Value Proposition */}
                <div className="text-center mb-6">
                  <div className="text-xs text-muted-foreground">
                    ${(pkg.price / pkg.credits).toFixed(3)} per credit
                  </div>
                </div>

                {/* Purchase Button */}
                <Button 
                  variant={pkg.buttonVariant}
                  className="w-full"
                  onClick={() => handlePurchase(pkg.credits, pkg.price)}
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    `Purchase ${pkg.credits} Credits`
                  )}
                </Button>
              </div>
            );
          })}
        </div>

        <div className="mt-6 text-center">
          <div className="glass-card p-4 rounded-xl">
            <div className="flex items-center justify-center gap-2 mb-2">
              <Sparkles className="w-4 h-4 text-accent" />
              <span className="text-sm font-semibold">Secure Payment</span>
            </div>
            <p className="text-xs text-muted-foreground">
              All payments are processed securely through Stripe. 
              Credits are added to your account instantly after payment.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CreditsPurchaseModal;