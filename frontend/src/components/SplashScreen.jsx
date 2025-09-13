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
              <feColorMatrix in="logo" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="alpha" />
              <feMorphology in="alpha" operator="erode" radius="3" result="eroded" />
              <feGaussianBlur in="eroded" stdDeviation="7" result="blurred" />
              <feFlood floodColor="#ff3c3c" floodOpacity="0.7" result="red" />
              <feComposite in="red" in2="blurred" operator="in" result="glow" />
              <feComposite in="glow" in2="alpha" operator="in" result="maskedGlow" />
              <feMerge>
                <feMergeNode in="maskedGlow" />
                <feMergeNode in="logo" />
              </feMerge>
            </filter>
          </defs>
          <image href="/mafialogo.png" x="0" y="0" width="160" height="160" filter="url(#innerGlow)" />
        </svg>
      </div>
    </div>
  );
}
