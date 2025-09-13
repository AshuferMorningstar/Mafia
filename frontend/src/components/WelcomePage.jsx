import React from 'react';
import '../styles.css';

export default function WelcomePage({ onStart }) {
  return (
    <div className="welcome-root">
      <img className="welcome-logo" src="/mafialogo.png" alt="Mafia logo" />
      <h1 className="welcome-title">Mafia Game</h1>
      <p className="welcome-sub">Welcome to the Mafia lobby — gather your friends and prepare to deceive.</p>
      <button className="welcome-start" onClick={onStart}>Start Game</button>
    </div>
  );
}
