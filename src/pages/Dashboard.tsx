import { useState } from "react";
import { Button } from "@/components/ui/button";
import { 
  Play, 
  Video, 
  Wand2, 
  CreditCard, 
  User,
  Plus,
  Zap,
  LogOut,
  Clock
} from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import { VideoLibrary } from "@/components/VideoLibrary";
import CreditsPurchaseModal from "@/components/CreditsPurchaseModal";


const Dashboard = () => {
  const { user, profile, signOut } = useAuth();
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);

  // Use real user data from profile
  const userData = {
    name: profile?.full_name || user?.email?.split('@')[0] || "User",
    email: user?.email || "",
    credits: profile?.credits || 0,
    videosGenerated: profile?.videos_generated || 0,
    totalRenderTime: profile?.total_render_time || 0
  };



  return (
    <ProtectedRoute>
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="glass-card border-b border-white/10 sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-gradient-primary rounded-lg flex items-center justify-center">
                <Wand2 className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-bold gradient-text">Vloggo</span>
            </div>

            <div className="flex items-center gap-4">
              {/* Credits Display */}
              <div className="glass-card px-4 py-2 rounded-full flex items-center gap-2">
                <Zap className="w-4 h-4 text-accent" />
                <span className="font-semibold">{userData.credits}</span>
                <span className="text-sm text-muted-foreground">credits</span>
              </div>

              {/* Buy Credits Button */}
              <Button 
                variant="glass-primary" 
                size="sm"
                onClick={() => setShowPurchaseModal(true)}
              >
                <CreditCard className="w-4 h-4 mr-2" />
                Buy Credits
              </Button>

              {/* Profile Dropdown */}
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-gradient-primary rounded-full flex items-center justify-center">
                  <User className="w-4 h-4 text-white" />
                </div>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={signOut}
                  className="hover:bg-red-500/20 hover:text-red-400"
                >
                  <LogOut className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        {/* Hero Stats Section - Silicon Valley Style */}
        <div className="mb-12">
          <div className="text-center mb-8">
            <h1 className="text-5xl font-bold mb-4">
              Transform <span className="gradient-text">images</span> into <span className="gradient-text">videos</span>
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Powered by advanced AI technology. Welcome back, <span className="gradient-text font-semibold">{userData.name}</span>
            </p>
          </div>

          {/* Key Metrics Row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
            <div className="glass-card p-8 rounded-3xl text-center">
              <div className="w-16 h-16 bg-gradient-to-r from-primary to-secondary rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Zap className="w-8 h-8 text-white" />
              </div>
              <div className="text-3xl font-bold mb-2">{userData.credits}</div>
              <h3 className="font-semibold text-lg mb-1">Generation Credits</h3>
              <p className="text-sm text-muted-foreground">Ready for AI processing</p>
            </div>

            <div className="glass-card p-8 rounded-3xl text-center">
              <div className="w-16 h-16 bg-gradient-to-r from-accent to-primary rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Video className="w-8 h-8 text-white" />
              </div>
              <div className="text-3xl font-bold mb-2">{userData.videosGenerated}</div>
              <h3 className="font-semibold text-lg mb-1">Videos Created</h3>
              <p className="text-sm text-muted-foreground">AI-powered transformations</p>
            </div>

            <div className="glass-card p-8 rounded-3xl text-center">
              <div className="w-16 h-16 bg-gradient-to-r from-secondary to-accent rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Clock className="w-8 h-8 text-white" />
              </div>
              <div className="text-3xl font-bold mb-2">{userData.totalRenderTime}s</div>
              <h3 className="font-semibold text-lg mb-1">Total Duration</h3>
              <p className="text-sm text-muted-foreground">Content generated</p>
            </div>
          </div>
        </div>



        {/* Video Library Section */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-3xl font-bold">Your Video Library</h2>
            <div className="flex gap-4">
              <Link to="/credit-history">
                <Button variant="outline">
                  <Clock className="w-4 h-4 mr-2" />
                  Credit History
                </Button>
              </Link>
              <Button 
                variant="glass-primary"
                onClick={() => window.location.href = '/generate'}
              >
                <Plus className="w-4 h-4 mr-2" />
                Generate New Video
              </Button>
            </div>
          </div>
          
          <div className="glass-card p-6 rounded-3xl">
            <VideoLibrary />
          </div>
        </div>
      </div>

      <CreditsPurchaseModal 
        open={showPurchaseModal} 
        onOpenChange={setShowPurchaseModal} 
      />
    </div>
    </ProtectedRoute>
  );
};

export default Dashboard;