import React, { useState } from 'react';
import '../styles.css';

export default function GameLobby({ roomCode = '7XYRGF', players = ['Alice','Bob','Charlie','David'], isHost = true, onStart = () => {}, onClose = () => {} }) {
  const [activeTab, setActiveTab] = useState('players');

  return (
    <div className="lobby-root lobby-centered">
      <header className="lobby-main-header">
        <h1 className="lobby-hero-title">Mafia Game Lobby</h1>
        <p className="lobby-hero-sub">A thrilling game of deception and strategy</p>
        <div className="lobby-roomcode">ROOM CODE: <span className="code-text">{roomCode}</span></div>
      </header>

      <main className="lobby-card">
        <div className="lobby-card-top">
          <nav className="lobby-tabs" role="tablist">
            <button className={`lobby-tab ${activeTab === 'players' ? 'active' : ''}`} onClick={() => setActiveTab('players')}>PLAYERS</button>
            <button className={`lobby-tab ${activeTab === 'chat' ? 'active' : ''}`} onClick={() => setActiveTab('chat')}>CHAT LOBBY</button>
          </nav>
        </div>

        <section className="lobby-card-body">
          {activeTab === 'players' ? (
            <ul className="lobby-players-list">
              {players.map((p, i) => (<li key={i} className="lobby-player-item">{p}</li>))}
            </ul>
          ) : (
            <div className="lobby-chat-placeholder">Chat will appear here</div>
          )}
        </section>

        
      </main>

      <div className="lobby-actions external-actions">
        {isHost && <button className="lobby-action start" onClick={onStart}>START GAME</button>}
        <button className="lobby-action close" onClick={onClose}>CLOSE ROOM</button>
      </div>

    </div>
  );
}
