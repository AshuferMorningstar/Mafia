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
    <div className="splash-root">
      <div className="splash-logo-wrap">
        {/* Inline SVG glow masked to the logo shape - placed behind the image */}
        <svg className="splash-glow" width="160" height="160" viewBox="0 0 160 160" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <defs>
            {/* Create a red glowing ring by dilating the logo, blurring it, and coloring the result */}
            <filter id="ringFilter" x="-50%" y="-50%" width="200%" height="200%">
              {/* source is the logo image drawn via feImage */}
              <feImage xlinkHref="/mafialogo.png" result="logo" x="0" y="0" width="160" height="160" preserveAspectRatio="xMidYMid meet" />
              {/* dilate to make the outline wider */}
              <feMorphology in="logo" operator="dilate" radius="4" result="dilated" />
              {/* blur to create soft glow */}
              <feGaussianBlur in="dilated" stdDeviation="8" result="blurred" />
              {/* subtract the original logo so we only have the outer ring */}
              <feComposite in="blurred" in2="logo" operator="out" result="ringOnly" />
              {/* color the ring red */}
              <feFlood floodColor="#ff3c3c" floodOpacity="0.95" result="red" />
              <feComposite in="red" in2="ringOnly" operator="in" result="coloredRing" />
              <feMerge>
                <feMergeNode in="coloredRing" />
              </feMerge>
            </filter>
          </defs>

          {/* apply the filter to a rect the size of the viewbox so the ring is drawn */}
          <rect width="160" height="160" fill="#000" filter="url(#ringFilter)" />
        </svg>

        <img className="splash-logo" src="/mafialogo.png" alt="Mafia logo" />
      </div>
      <h1 className="splash-title">Mafia Game</h1>
      <p className="splash-sub">A thrilling game of deception and strategy</p>
    </div>
  );
}
