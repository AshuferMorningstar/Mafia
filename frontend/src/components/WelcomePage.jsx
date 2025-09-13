import React from 'react';
import '../styles.css';

export default function WelcomePage({ onStart }) {
  return (
    <div className="welcome-root">
      <svg width="160" height="160" viewBox="0 0 160 160" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <defs>
          <filter id="innerGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feImage xlinkHref="/mafialogo.png" result="logo" x="0" y="0" width="160" height="160" />
            <feColorMatrix in="logo" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="alpha" />
            <feGaussianBlur in="logo" stdDeviation="8" result="soft" />
            <feComposite in="soft" in2="alpha" operator="in" result="softInside" />
            <feFlood floodColor="#ff3c3c" floodOpacity="0.7" result="red" />
            <feComposite in="red" in2="softInside" operator="in" result="coloredSoft" />
            <feBlend in="coloredSoft" in2="logo" mode="screen" result="blended" />
            <feMerge>
              <feMergeNode in="blended" />
            </feMerge>
          </filter>
        </defs>
        {/* soft red ground beneath the logo */}
        <filter id="baseBlur" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="14" result="g" />
        </filter>
        <ellipse cx="80" cy="118" rx="48" ry="14" fill="#ff3c3c" opacity="0.55" filter="url(#baseBlur)" />
        {/* filtered copy (provides glow behind) */}
        <image href="/mafialogo.png" x="0" y="0" width="160" height="160" filter="url(#innerGlow)" opacity="0.95" />
        {/* unfiltered copy on top so the logo is fully visible */}
        <image href="/mafialogo.png" x="0" y="0" width="160" height="160" />
      </svg>
      <h1 className="welcome-title">Mafia Game</h1>
      <p className="welcome-sub">Welcome to the Mafia lobby — gather your friends and prepare to deceive.</p>
      <button className="welcome-start" onClick={onStart}>Start Game</button>
    </div>
  );
}
