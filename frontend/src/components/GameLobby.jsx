import React, { useState } from 'react';
import '../styles.css';

export default function GameLobby({ roomCode = 'ABCD', players = [], isHost = false, onLeave = () => {}, onStart = () => {}, onClose = () => {} }) {
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState('players');

  function copyCode() {
    try {
      navigator.clipboard.writeText(roomCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  function shareCode() {
    if (navigator.share) {
      navigator.share({ title: 'Join my Mafia game', text: `Join my game lobby with code ${roomCode}` }).catch(() => {});
    } else {
      // fallback: copy
      copyCode();
    }
  }

  return (
    <div className="lobby-root">
      <div className="lobby-header">
        <img src="/public/mafialogo.png" alt="mafia logo" className="lobby-logo" />
        <h2 className="lobby-title">Game Lobby</h2>
        <p className="lobby-instruction">Send this code to your friends and family to join</p>

        <div className="room-code-row">
          <div className="room-code-box big">{roomCode}</div>

          <div className="room-code-actions">
            <button aria-label="Copy code" className="circle-icon" onClick={copyCode}>{copied ? '✓' : '📋'}</button>
            <button aria-label="Share code" className="circle-icon" onClick={shareCode}>🔗</button>
          </div>
        </div>
      </div>

      <div className="lobby-body">
        <div className="panel-tabs">
          <button className={`tab ${activeTab === 'players' ? 'active' : ''}`} onClick={() => setActiveTab('players')}>👥 Players ({players.length})</button>
          <button className={`tab ${activeTab === 'chat' ? 'active' : ''}`} onClick={() => setActiveTab('chat')}>💬 Lobby Chat</button>
        </div>

        <div className="panel-content">
          <div className={`players-panel ${activeTab === 'players' ? 'show' : 'hide'}`}>
            <ul>
              {players.map((p, i) => (
                <li key={i} className={p === 'You' ? 'player-you' : ''}>{p}</li>
              ))}
            </ul>
          </div>

          <div className={`chat-panel ${activeTab === 'chat' ? 'show' : 'hide'}`}>
            <div className="chat-messages">
              <div className="chat-empty">No messages yet</div>
            </div>
            <div className="chat-input-row overlay">
              <input aria-label="Type a message" placeholder="Type a message..." />
              <button className="send-btn" aria-label="Send message">➤</button>
            </div>
          </div>
        </div>
      </div>

      <div className="lobby-footer stacked">
        {isHost ? (
          <>
            <button className="start-game" onClick={onStart}>🚀 Start Game</button>
            <button className="leave-lobby" onClick={onClose}>🚪 Close Room</button>
          </>
        ) : (
          <button className="leave-lobby" onClick={onLeave}>🚪 Leave Lobby</button>
        )}
      </div>
    </div>
  );
}
