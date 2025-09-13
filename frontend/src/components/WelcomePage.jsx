import React from 'react';
import '../styles.css';

export default function WelcomePage({ onStart }) {
  return (
    <div className="welcome-root">
      <svg width="160" height="160" viewBox="0 0 160 160" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <defs>
          <filter id="refGlow" x="-60%" y="-60%" width="220%" height="220%">
            <feImage xlinkHref="/mafialogo.png" result="logo" x="0" y="0" width="160" height="160" />
            <feColorMatrix in="logo" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="alpha" />

            <feMorphology in="alpha" operator="dilate" radius="6" result="dilated" />
            <feComposite in="dilated" in2="alpha" operator="out" result="ring" />
            <feGaussianBlur in="ring" stdDeviation="22" result="haloBlur" />
            <feFlood floodColor="#ff0000" floodOpacity="0.8" result="haloColor" />
            <feComposite in="haloColor" in2="haloBlur" operator="in" result="halo" />

            <feGaussianBlur in="logo" stdDeviation="6" result="innerSoft" />
            <feComposite in="innerSoft" in2="alpha" operator="in" result="innerInside" />
            <feFlood floodColor="#ff2a2a" floodOpacity="0.45" result="innerColor" />
            <feComposite in="innerColor" in2="innerInside" operator="in" result="innerTint" />

            <feMerge>
              <feMergeNode in="halo" />
              <feMergeNode in="innerTint" />
              <feMergeNode in="logo" />
            </feMerge>
          </filter>
        </defs>
        <image href="/mafialogo.png" x="0" y="0" width="160" height="160" filter="url(#refGlow)" />
        <image href="/mafialogo.png" x="0" y="0" width="160" height="160" />
      </svg>
      <h1 className="welcome-title">Mafia Game</h1>
      <p className="welcome-sub">Welcome to the Mafia lobby — gather your friends and prepare to deceive.</p>
      <button className="welcome-start" onClick={onStart}>Start Game</button>
    </div>
  );
}
