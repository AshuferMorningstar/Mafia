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
            {/* reference-style glow: outer halo (dilate->blur->color) + subtle inner tint */}
            <filter id="refGlow" x="-60%" y="-60%" width="220%" height="220%">
              {/* load the logo raster */}
              <feImage xlinkHref="/mafialogo.png" result="logo" x="0" y="0" width="160" height="160" />
              {/* extract alpha */}
              <feColorMatrix in="logo" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="alpha" />

              {/* outer halo: dilate alpha to make a ring, blur it heavily, then color */}
              <feMorphology in="alpha" operator="dilate" radius="6" result="dilated" />
              <feComposite in="dilated" in2="alpha" operator="out" result="ring" />
              <feGaussianBlur in="ring" stdDeviation="22" result="haloBlur" />
              <feFlood floodColor="#ff0000" floodOpacity="0.8" result="haloColor" />
              <feComposite in="haloColor" in2="haloBlur" operator="in" result="halo" />

              {/* subtle inner tint (soft red inside the silhouette) */}
              <feGaussianBlur in="logo" stdDeviation="6" result="innerSoft" />
              <feComposite in="innerSoft" in2="alpha" operator="in" result="innerInside" />
              <feFlood floodColor="#ff2a2a" floodOpacity="0.45" result="innerColor" />
              <feComposite in="innerColor" in2="innerInside" operator="in" result="innerTint" />

              {/* combine halo + inner tint + original as the filtered result (we'll render an unfiltered copy above) */}
              <feMerge>
                <feMergeNode in="halo" />
                <feMergeNode in="innerTint" />
                <feMergeNode in="logo" />
              </feMerge>
            </filter>
          </defs>
          {/* filtered copy (glow source) underneath */}
          <image href="/mafialogo.png" x="0" y="0" width="160" height="160" filter="url(#refGlow)" />
          {/* unfiltered copy on top so the logo remains crisp */}
          <image href="/mafialogo.png" x="0" y="0" width="160" height="160" />
        </svg>
      </div>
    </div>
  );
}
