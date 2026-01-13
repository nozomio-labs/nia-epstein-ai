"use client";

import { useState, useRef } from "react";

export function SplashScreen({ onComplete }: { onComplete: () => void }) {
  const [isVisible, setIsVisible] = useState(true);
  const [isFading, setIsFading] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const handleDismiss = () => {
    setIsFading(true);
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
      setHasStarted(true);
    }
  };

  if (!isVisible) return null;

  return (
    <div
      className={`fixed inset-0 z-50 bg-black flex items-center justify-center transition-opacity duration-500 ${
        isFading ? "opacity-0" : "opacity-100"
      }`}
    >
      <video
        ref={videoRef}
        src="/welcome.mp4"
        loop
        playsInline
        className="w-full h-full object-cover pointer-events-none"
      />
      
      {/* Sound button - shows before video starts */}
      {!hasStarted && (
        <button
          onClick={handleStartWithSound}
          className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm"
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
      {hasStarted && (
        <button
          onClick={handleDismiss}
          className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 px-6 py-2 rounded-full bg-white/10 backdrop-blur-sm hover:bg-white/20 transition-colors text-white/60 text-sm"
        >
          Click to skip
        </button>
      )}
    </div>
  );
}
