import React, { useState } from 'react';
import '../styles.css';

export default function GameLobby({ roomCode = '7XYRGF', players = ['Alice','Bob','Charlie','David'], isHost = true, onStart = () => {}, onClose = () => {} }) {
  const [activeTab, setActiveTab] = useState('players');

  return (
    <div className="lobby-root lobby-centered">
      <header className="lobby-main-header">
        <h1 className="lobby-hero-title welcome-title metallic-gradient">Mafia Game Lobby</h1>
        <p className="lobby-hero-sub welcome-sub metallic-gradient">A thrilling game of deception and strategy</p>
        <div className="lobby-roomcode">ROOM CODE: <span className="code-text">{roomCode}</span></div>
      </header>

      <main className="lobby-card">
        <div className="lobby-card-top">
          <nav className="lobby-tabs" role="tablist">
            <button className={`lobby-tab ${activeTab === 'players' ? 'active' : ''}`} onClick={() => setActiveTab('players')}>PLAYERS</button>
            <button className={`lobby-tab ${activeTab === 'chat' ? 'active' : ''}`} onClick={() => setActiveTab('chat')}>CHAT LOBBY</button>
          </nav>
        </div>

        <section
          className="lobby-card-body chat-body-flex"
          style={activeTab === 'chat' ? {display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0} : {}}
        >
          {activeTab === 'players' ? (
            <ul className="lobby-players-list">
              {players.map((p, i) => (<li key={i} className="lobby-player-item">{p}</li>))}
            </ul>
          ) : (
            <>
              <div style={{flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', minHeight: 0}}>
                <div className="lobby-chat-placeholder">Chat will appear here</div>
              </div>
            </>
          )}
        </section>

        {/* Render the chat input at the bottom of the card (sibling of lobby-card-body)
            so it naturally sits flush with the card bottom while retaining rounded corners */}
        {activeTab === 'chat' && (
          <div className="chat-input-row chat-input-bottom">
            <input
              className="chat-input"
              type="text"
              name="chatMessage"
              placeholder="Type a message..."
              style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid #ccc', marginRight: '8px' }}
            />
            <button className="chat-send-btn" style={{ padding: '10px 18px', borderRadius: '8px', background: '#f6d27a', color: '#2b1f12', fontWeight: 700, border: 'none', cursor: 'pointer' }}>
              Send
            </button>
          </div>
        )}
      </main>

      <div className="lobby-actions external-actions">
        {isHost && <button className="lobby-action start" onClick={onStart}>START GAME</button>}
        <button className="lobby-action close" onClick={onClose}>CLOSE ROOM</button>
      </div>

    </div>
  );
}
