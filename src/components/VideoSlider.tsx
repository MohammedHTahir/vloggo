import videoSlider1 from "../assets/video-slider-1.jpg";
import videoSlider2 from "../assets/video-slider-2.jpg";
import videoSlider3 from "../assets/video-slider-3.jpg";
import videoSlider4 from "../assets/video-slider-4.jpg";
import videoSlider5 from "../assets/video-slider-5.jpg";
import videoSlider6 from "../assets/video-slider-6.jpg";
import videoSlider7 from "../assets/video-slider-7.jpg";
import videoSlider8 from "../assets/video-slider-8.jpg";

const VideoSlider = () => {
  // Generated AI images for the slider
  const images = [
    { id: 1, imageUrl: videoSlider1, alt: "Serene mountain landscape at sunset" },
    { id: 2, imageUrl: videoSlider2, alt: "Abstract flowing liquid colors" },
    { id: 3, imageUrl: videoSlider3, alt: "Futuristic city skyline at night" },
    { id: 4, imageUrl: videoSlider4, alt: "Peaceful forest with sunlight" },
    { id: 5, imageUrl: videoSlider5, alt: "Ocean waves on rocky coastline" },
    { id: 6, imageUrl: videoSlider6, alt: "Aurora borealis over mountains" },
    { id: 7, imageUrl: videoSlider7, alt: "Golden wheat field at sunset" },
    { id: 8, imageUrl: videoSlider8, alt: "Space nebula with swirling colors" },
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
          {[...images, ...images].map((image, index) => (
            <div
              key={`row1-${index}`}
              className="relative min-w-80 h-48 glass-card rounded-2xl overflow-hidden hover:scale-105 transition-transform duration-300 cursor-pointer"
            >
              <img
                src={image.imageUrl}
                alt={image.alt}
                className="w-full h-full object-cover"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Second Row - Moving Left */}
      <div className="relative">
        <div className="flex gap-6 animate-slide-left">
          {[...images.slice().reverse(), ...images.slice().reverse()].map((image, index) => (
            <div
              key={`row2-${index}`}
              className="relative min-w-80 h-48 glass-card rounded-2xl overflow-hidden hover:scale-105 transition-transform duration-300 cursor-pointer"
            >
              <img
                src={image.imageUrl}
                alt={image.alt}
                className="w-full h-full object-cover"
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default VideoSlider;