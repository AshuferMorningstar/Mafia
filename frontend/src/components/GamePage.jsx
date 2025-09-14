import React from 'react';
import '../styles.css';

export default function GamePage({ roomCode, players = [], onExit = () => {} }) {
  return (
    <div className="game-root" style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {/* empty placeholder: UI will be implemented from user's image */}
    </div>
  );
}
