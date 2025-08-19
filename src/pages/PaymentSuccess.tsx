import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { CheckCircle, Sparkles, ArrowRight, Loader2 } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const PaymentSuccess = () => {
  const [searchParams] = useSearchParams();
  const [credits, setCredits] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    const creditsParam = searchParams.get('credits');
    const sessionId = searchParams.get('session_id');
    
    if (creditsParam) {
      setCredits(parseInt(creditsParam));
    }

    // Verify payment if session_id is present
    if (sessionId) {
      const verifyPayment = async () => {
        try {
          const { data, error } = await supabase.functions.invoke('verify-payment', {
            body: { session_id: sessionId }
          });

          if (error) throw error;
          
          if (data.credits_added) {
            setCredits(data.credits_added);
            toast({
              title: "Payment Successful!",
              description: `${data.credits_added} credits have been added to your account.`,
            });
          }
        } catch (error) {
          console.error('Payment verification error:', error);
          toast({
            title: "Payment Verification Failed",
            description: "Please contact support if credits weren't added to your account.",
            variant: "destructive",
          });
        } finally {
          setLoading(false);
        }
      };

      verifyPayment();
    } else {
      setLoading(false);
    }
  }, [searchParams, toast]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="glass-card p-12 rounded-2xl text-center">
          <Loader2 className="w-12 h-12 mx-auto mb-4 animate-spin text-accent" />
          <h2 className="text-2xl font-bold mb-2">Verifying Payment...</h2>
          <p className="text-muted-foreground">Please wait while we confirm your purchase.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center relative overflow-hidden">
      {/* Background Elements */}
      <div className="absolute inset-0 animated-bg"></div>
      <div className="absolute inset-0 grid-pattern opacity-20"></div>
      
      {/* Floating Elements */}
      <div className="absolute top-20 left-10 w-32 h-32 bg-primary/20 rounded-full blur-xl float"></div>
      <div className="absolute bottom-20 right-10 w-24 h-24 bg-secondary/20 rounded-full blur-xl float animation-delay-2000"></div>
      <div className="absolute top-1/2 right-1/4 w-20 h-20 bg-accent/20 rounded-full blur-xl float animation-delay-1000"></div>

      <div className="relative z-10 w-full max-w-2xl mx-4">
        {/* Success Card */}
        <div className="glass-card p-12 rounded-2xl text-center">
          {/* Success Icon */}
          <div className="w-24 h-24 bg-gradient-to-r from-green-400 to-green-600 rounded-full flex items-center justify-center mx-auto mb-8 shadow-glow-soft">
            <CheckCircle className="w-12 h-12 text-white" />
          </div>
          
          {/* Content */}
          <h1 className="text-4xl font-bold mb-4">
            Payment <span className="gradient-text">Successful!</span>
          </h1>
          
          <p className="text-xl text-muted-foreground mb-8 max-w-lg mx-auto">
            Your credits have been added to your account. Time to unleash your creativity!
          </p>
          
          {/* Credits Info */}
          <div className="glass-card p-6 rounded-xl mb-8 max-w-md mx-auto">
            <div className="flex items-center justify-center gap-3 mb-4">
              <Sparkles className="w-6 h-6 text-accent" />
              <h3 className="text-xl font-bold">Credits Added</h3>
            </div>
            <div className="text-3xl font-bold gradient-text mb-2">+{credits || 100} Credits</div>
            <p className="text-sm text-muted-foreground">Ready to use for image generation and editing</p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/dashboard">
              <Button variant="premium" size="lg" className="px-8">
                Go to Dashboard
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </Link>
            <Link to="/generate">
              <Button variant="glass-primary" size="lg" className="px-8">
                Start Creating
              </Button>
            </Link>
          </div>

          {/* Additional Info */}
          <div className="mt-8 text-sm text-muted-foreground">
            <p>Receipt and transaction details have been sent to your email.</p>
            <p className="mt-2">Need help? <a href="#" className="text-primary hover:text-primary-glow">Contact our support team</a></p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PaymentSuccess;