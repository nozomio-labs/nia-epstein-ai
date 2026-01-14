"use client";

import { useState, useEffect, useRef } from "react";

type SplashPhase = "nozomio-enter" | "nozomio-hold" | "nozomio-exit" | "epstein";

const SPLASH_CACHE_KEY = "nozomio_splash_seen";
const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes

function shouldShowSplash(): boolean {
  if (typeof window === "undefined") return true;
  
  try {
    const cached = localStorage.getItem(SPLASH_CACHE_KEY);
    if (!cached) return true;
    
    const timestamp = parseInt(cached, 10);
    const now = Date.now();
    
    // Show splash if cache expired (more than 5 minutes ago)
    return now - timestamp > CACHE_DURATION_MS;
  } catch {
    // localStorage not available (private browsing, etc.)
    return true;
  }
}

function cacheSplashSeen(): void {
  try {
    localStorage.setItem(SPLASH_CACHE_KEY, Date.now().toString());
  } catch {
    // Ignore storage errors
  }
}

export function SplashScreen({ onComplete }: { onComplete: () => void }) {
  const [phase, setPhase] = useState<SplashPhase>("nozomio-enter");
  const [isVisible, setIsVisible] = useState(true);
  const [hasStartedVideo, setHasStartedVideo] = useState(false);
  const [isFading, setIsFading] = useState(false);
  const [shouldRender, setShouldRender] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Check cache on mount
  useEffect(() => {
    if (!shouldShowSplash()) {
      setShouldRender(false);
      onComplete();
    }
  }, [onComplete]);

  useEffect(() => {
    if (!shouldRender) return;

    // Nozomio enter: 800ms
    const holdTimer = setTimeout(() => setPhase("nozomio-hold"), 800);
    
    // Nozomio hold: 2000ms, then exit
    const exitTimer = setTimeout(() => setPhase("nozomio-exit"), 2800);
    
    // Transition to Epstein screen
    const epsteinTimer = setTimeout(() => setPhase("epstein"), 3500);

    return () => {
      clearTimeout(holdTimer);
      clearTimeout(exitTimer);
      clearTimeout(epsteinTimer);
    };
  }, [shouldRender]);

  const handleDismiss = () => {
    setIsFading(true);
    cacheSplashSeen(); // Cache that user has seen the splash
    setTimeout(() => {
      setIsVisible(false);
      onComplete();
    }, 500);
  };

  const handleStartWithSound = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (videoRef.current) {
      videoRef.current.muted = false;
      videoRef.current.play();
      setHasStartedVideo(true);
    }
  };

  const skipNozomio = () => {
    setPhase("nozomio-exit");
    setTimeout(() => setPhase("epstein"), 700);
  };

  // Don't render if cached
  if (!shouldRender || !isVisible) return null;

  const isNozomioPhase = phase.startsWith("nozomio");

  return (
    <>
      {/* Solid black background - always present until final dismiss */}
      <div
        className={`fixed inset-0 z-[49] bg-black transition-opacity duration-500 ${
          isFading ? "opacity-0" : "opacity-100"
        }`}
      />

      {/* Main splash container */}
      <div
        className={`fixed inset-0 z-50 transition-opacity duration-500 ${
          isFading ? "opacity-0" : "opacity-100"
        }`}
      >
        {/* Epstein video screen - underneath */}
        <div className="absolute inset-0 bg-black flex items-center justify-center">
          <video
            ref={videoRef}
            src="/welcome.mp4"
            loop
            playsInline
            preload="auto"
            className="w-full h-full object-cover pointer-events-none"
          />
          
          {/* Sound button - shows before video starts */}
          {!isNozomioPhase && !hasStartedVideo && (
            <button
              onClick={handleStartWithSound}
              className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
            >
              <div className="p-6 rounded-full bg-white/10 backdrop-blur-sm hover:bg-white/20 transition-colors mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                </svg>
              </div>
              <span className="text-white/80 text-lg tracking-wider">CLICK TO PLAY WITH SOUND</span>
            </button>
          )}
          
          {/* Skip button - shows after video starts */}
          {!isNozomioPhase && hasStartedVideo && (
            <button
              onClick={handleDismiss}
              className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 px-6 py-2 rounded-full bg-white/10 backdrop-blur-sm hover:bg-white/20 transition-colors text-white/60 text-sm"
            >
              Click to skip
            </button>
          )}
        </div>

        {/* Nozomio Labs intro screen - on top, fades out to reveal video */}
        <div
          className={`absolute inset-0 flex items-center justify-center overflow-hidden transition-opacity duration-700 ${
            phase === "nozomio-exit" ? "opacity-0" : isNozomioPhase ? "opacity-100" : "opacity-0"
          }`}
          style={{
            background: "linear-gradient(135deg, #0a0c10 0%, #0d1117 50%, #0a0c10 100%)",
            pointerEvents: isNozomioPhase ? "auto" : "none",
          }}
        >
          {/* Subtle frost/ice gradient overlay */}
          <div 
            className="absolute inset-0 opacity-30"
            style={{
              background: "radial-gradient(ellipse at 30% 20%, rgba(120, 180, 220, 0.08) 0%, transparent 50%), radial-gradient(ellipse at 70% 80%, rgba(100, 160, 200, 0.06) 0%, transparent 50%)",
            }}
          />
          
          {/* Minimal grid lines - very subtle */}
          <div 
            className="absolute inset-0 opacity-[0.02]"
            style={{
              backgroundImage: `
                linear-gradient(rgba(200, 220, 240, 0.3) 1px, transparent 1px),
                linear-gradient(90deg, rgba(200, 220, 240, 0.3) 1px, transparent 1px)
              `,
              backgroundSize: "100px 100px",
            }}
          />

          {/* Main content */}
          <div className="relative z-10 flex flex-col items-center gap-8">
            {/* Company name */}
            <div 
              className={`text-center transition-all duration-700 ease-out ${
                phase === "nozomio-enter" 
                  ? "opacity-0 translate-y-4" 
                  : "opacity-100 translate-y-0"
              }`}
              style={{ transitionDelay: "100ms" }}
            >
              <h1 
                className="text-[2.5rem] sm:text-[3.5rem] md:text-[4.5rem] font-light tracking-[0.35em] text-white/90 uppercase"
                style={{ 
                  fontFamily: "system-ui, -apple-system, sans-serif",
                  letterSpacing: "0.35em",
                  fontWeight: 200,
                }}
              >
                Nozomio Labs
              </h1>
            </div>

            {/* Divider line */}
            <div 
              className={`h-px bg-gradient-to-r from-transparent via-white/20 to-transparent transition-all duration-700 ease-out ${
                phase === "nozomio-enter" 
                  ? "opacity-0 w-0" 
                  : "opacity-100 w-32 sm:w-48"
              }`}
              style={{ transitionDelay: "300ms" }}
            />

            {/* Presents */}
            <div 
              className={`transition-all duration-700 ease-out ${
                phase === "nozomio-enter" 
                  ? "opacity-0 translate-y-4" 
                  : "opacity-100 translate-y-0"
              }`}
              style={{ transitionDelay: "500ms" }}
            >
              <span 
                className="text-xs sm:text-sm tracking-[0.5em] text-white/40 uppercase"
                style={{ fontWeight: 300 }}
              >
                presents
              </span>
            </div>
          </div>

          {/* Subtle corner accents */}
          <div className="absolute top-0 left-0 w-24 h-24 sm:w-32 sm:h-32">
            <div 
              className={`absolute top-6 left-6 sm:top-8 sm:left-8 w-12 sm:w-16 h-px bg-gradient-to-r from-white/10 to-transparent transition-all duration-700 ${
                phase === "nozomio-enter" ? "opacity-0 -translate-x-4" : "opacity-100 translate-x-0"
              }`}
              style={{ transitionDelay: "600ms" }}
            />
            <div 
              className={`absolute top-6 left-6 sm:top-8 sm:left-8 h-12 sm:h-16 w-px bg-gradient-to-b from-white/10 to-transparent transition-all duration-700 ${
                phase === "nozomio-enter" ? "opacity-0 -translate-y-4" : "opacity-100 translate-y-0"
              }`}
              style={{ transitionDelay: "600ms" }}
            />
          </div>

          <div className="absolute bottom-0 right-0 w-24 h-24 sm:w-32 sm:h-32">
            <div 
              className={`absolute bottom-6 right-6 sm:bottom-8 sm:right-8 w-12 sm:w-16 h-px bg-gradient-to-l from-white/10 to-transparent transition-all duration-700 ${
                phase === "nozomio-enter" ? "opacity-0 translate-x-4" : "opacity-100 translate-x-0"
              }`}
              style={{ transitionDelay: "600ms" }}
            />
            <div 
              className={`absolute bottom-6 right-6 sm:bottom-8 sm:right-8 h-12 sm:h-16 w-px bg-gradient-to-t from-white/10 to-transparent transition-all duration-700 ${
                phase === "nozomio-enter" ? "opacity-0 translate-y-4" : "opacity-100 translate-y-0"
              }`}
              style={{ transitionDelay: "600ms" }}
            />
          </div>

          {/* Skip hint */}
          <button
            onClick={skipNozomio}
            className={`absolute bottom-6 sm:bottom-8 left-1/2 -translate-x-1/2 text-[10px] tracking-[0.3em] text-white/20 uppercase hover:text-white/40 transition-all duration-500 ${
              phase === "nozomio-hold" ? "opacity-100" : "opacity-0 pointer-events-none"
            }`}
          >
            skip
          </button>
        </div>
      </div>
    </>
  );
}
