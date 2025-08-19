const VideoSlider = () => {
  // Mock video data with actual video URLs
  const videos = [
    { id: 1, videoUrl: "https://assets.mixkit.co/videos/preview/mixkit-forest-stream-in-the-sunlight-529-large.mp4" },
    { id: 2, videoUrl: "https://assets.mixkit.co/videos/preview/mixkit-waves-in-the-water-1164-large.mp4" },
    { id: 3, videoUrl: "https://assets.mixkit.co/videos/preview/mixkit-tree-with-yellow-flowers-1173-large.mp4" },
    { id: 4, videoUrl: "https://assets.mixkit.co/videos/preview/mixkit-countryside-meadow-4075-large.mp4" },
    { id: 5, videoUrl: "https://assets.mixkit.co/videos/preview/mixkit-spinning-around-the-earth-29351-large.mp4" },
    { id: 6, videoUrl: "https://assets.mixkit.co/videos/preview/mixkit-clouds-moving-on-blue-sky-2408-large.mp4" },
    { id: 7, videoUrl: "https://assets.mixkit.co/videos/preview/mixkit-raindrops-on-glass-4142-large.mp4" },
    { id: 8, videoUrl: "https://assets.mixkit.co/videos/preview/mixkit-sunset-over-green-hills-2167-large.mp4" },
  ];

  return (
    <section className="py-20 overflow-hidden relative">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-background/50 to-background"></div>
      
      {/* Section Header */}
      <div className="container mx-auto px-4 text-center mb-16 relative z-10">
        <h2 className="text-4xl md:text-6xl font-bold mb-6">
          <span className="gradient-text">AI-Generated</span> Video Gallery
        </h2>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
          Discover the endless possibilities of AI video generation. From static images to dynamic storytelling.
        </p>
      </div>

      {/* First Row - Moving Right */}
      <div className="relative mb-8">
        <div className="flex gap-6 animate-slide-right">
          {[...videos, ...videos].map((video, index) => (
            <div
              key={`row1-${index}`}
              className="relative min-w-80 h-48 glass-card rounded-2xl overflow-hidden hover:scale-105 transition-transform duration-300 cursor-pointer"
            >
              <video
                src={video.videoUrl}
                className="w-full h-full object-cover"
                autoPlay
                loop
                muted
                playsInline
              />
            </div>
          ))}
        </div>
      </div>

      {/* Second Row - Moving Left */}
      <div className="relative">
        <div className="flex gap-6 animate-slide-left">
          {[...videos.slice().reverse(), ...videos.slice().reverse()].map((video, index) => (
            <div
              key={`row2-${index}`}
              className="relative min-w-80 h-48 glass-card rounded-2xl overflow-hidden hover:scale-105 transition-transform duration-300 cursor-pointer"
            >
              <video
                src={video.videoUrl}
                className="w-full h-full object-cover"
                autoPlay
                loop
                muted
                playsInline
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default VideoSlider;