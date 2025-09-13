import React, { useEffect } from 'react';
import '../styles.css';

export default function SplashScreen({ onFinish }) {
  useEffect(() => {
    // Animation length is 2000ms; trigger the app transition a bit earlier
    // (while the logo is zooming out) so WelcomePage appears during the motion.
  const SPLASH_TOTAL = 3200; // ms (matches CSS animation duration)
  const TRIGGER_AT = Math.round(SPLASH_TOTAL * 0.45); // 45% through animation (a bit later)
    const timer = setTimeout(onFinish, TRIGGER_AT);
    return () => clearTimeout(timer);
  }, [onFinish]);

  return (
    <div className="splash-root splash-center">
      <div className="splash-logo-center">
        <svg width="160" height="160" viewBox="0 0 160 160" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <defs>
            <filter id="innerGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feImage xlinkHref="/mafialogo.png" result="logo" x="0" y="0" width="160" height="160" />
              {/* get alpha for clipping */}
              <feColorMatrix in="logo" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="alpha" />
              {/* blur the RGB to create a soft source */}
              <feGaussianBlur in="logo" stdDeviation="8" result="soft" />
              {/* keep only the blurred pixels inside the shape */}
              <feComposite in="soft" in2="alpha" operator="in" result="softInside" />
              {/* color that soft interior */}
              <feFlood floodColor="#ff3c3c" floodOpacity="0.7" result="red" />
              <feComposite in="red" in2="softInside" operator="in" result="coloredSoft" />
              {/* blend the colored soft layer with the original logo so the glow shows through dark areas */}
              <feBlend in="coloredSoft" in2="logo" mode="screen" result="blended" />
              <feMerge>
                <feMergeNode in="blended" />
              </feMerge>
            </filter>
            {/* low, blurred base glow under the logo */}
            <filter id="baseBlur" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="14" result="g" />
            </filter>
          </defs>
          {/* soft red ground beneath the logo */}
          <ellipse cx="80" cy="118" rx="48" ry="14" fill="#ff3c3c" opacity="0.55" filter="url(#baseBlur)" />
          {/* filtered copy (provides glow behind) */}
          <image href="/mafialogo.png" x="0" y="0" width="160" height="160" filter="url(#innerGlow)" opacity="0.95" />
          {/* unfiltered copy on top so the logo is fully visible */}
          <image href="/mafialogo.png" x="0" y="0" width="160" height="160" />
        </svg>
      </div>
    </div>
  );
}
