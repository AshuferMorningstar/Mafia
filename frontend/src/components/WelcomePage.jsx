import React, { useState, startTransition } from 'react';
import '../styles.css';

export default function WelcomePage({ onStart, onCreate, onJoin }) {
  const [pressed, setPressed] = useState(false);

  // Trigger handler with immediate visual feedback, then run the action
  // on the next frame and inside startTransition so the browser can paint
  const triggerAction = (handler) => (event) => {
    // immediate visual feedback
    setPressed(true);

    // let the browser paint the pressed state, then run the action
    requestAnimationFrame(() => {
      try {
        if (handler) {
          // mark as non-urgent to avoid blocking responsiveness
          if (typeof startTransition === 'function') {
            startTransition(() => handler(event));
          } else {
            handler(event);
          }
        }
      } finally {
        // clear pressed class shortly after
        setTimeout(() => setPressed(false), 160);
      }
    });
  };

  const triggerKey = (handler) => (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      triggerAction(handler)(e);
    }
  };

  return (
    <div className="welcome-root">
      <svg width="160" height="160" viewBox="0 0 160 160" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <defs>
          <filter id="refGlow" x="-80%" y="-80%" width="260%" height="260%">
            <feImage xlinkHref="/mafialogo.png" result="logo" x="0" y="0" width="160" height="160" />
            <feColorMatrix in="logo" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="alpha" />

            <feMorphology in="alpha" operator="dilate" radius="8" result="dilated" />
            <feComposite in="dilated" in2="alpha" operator="out" result="ring" />
            <feGaussianBlur in="ring" stdDeviation="36" result="haloBlur" />
            <feFlood floodColor="#ff0000" floodOpacity="0.55" result="haloColor" />
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
            <feGaussianBlur stdDeviation="6" result="smoothed" />
          </filter>
        </defs>
        <image href="/mafialogo.png" x="0" y="0" width="160" height="160" filter="url(#refGlow)" />
        <image href="/mafialogo.png" x="0" y="0" width="160" height="160" />
      </svg>
    <h1 className="welcome-title metallic-gradient shine-animated">Mafia Game</h1>
  <p className="welcome-sub metallic-gradient shine-animated">A thrilling game of deception and strategy</p>
      <div className="welcome-actions">
        <button
          className={`welcome-start ${pressed ? 'pressed' : ''}`}
          onPointerDown={triggerAction(onCreate || onStart)}
          onKeyDown={triggerKey(onCreate || onStart)}
          onClick={(e) => { /* fallback in case pointer events aren't available */ (onCreate || onStart)?.(e); }}
        >
          Create a Room
        </button>

        <button
          className="welcome-join"
          onPointerDown={triggerAction(onJoin || onStart)}
          onKeyDown={triggerKey(onJoin || onStart)}
          onClick={(e) => { /* fallback */ (onJoin || onStart)?.(e); }}
        >
          Join Game
        </button>
      </div>
    </div>
  );
}
