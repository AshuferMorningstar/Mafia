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
      <h1 className="welcome-title">Mafia Game</h1>
      <p className="welcome-sub">Welcome to the Mafia lobby — gather your friends and prepare to deceive.</p>
      <button className="welcome-start" onClick={onStart}>Start Game</button>
    </div>
  );
}
