import React, { useState } from 'react';
import '../styles.css';

export default function GamePage({ roomCode, players = [], role = null, onExit = () => {} }) {
  const [copyStatus, setCopyStatus] = useState('');
  const [shareStatus, setShareStatus] = useState('');
  const [activeTab, setActiveTab] = useState('players');

  const shareUrl = (() => {
    try { return `${window.location.origin}${window.location.pathname}?room=${roomCode}`; } catch (e) { return roomCode; }
  })();

  const doCopy = async () => {
    try {
      // Copy only the room code (not the full URL)
      const textToCopy = roomCode;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(textToCopy);
      } else {
        const t = document.createElement('textarea');
        t.value = textToCopy;
        document.body.appendChild(t);
        t.select();
        document.execCommand('copy');
        document.body.removeChild(t);
      }
      setCopyStatus('Copied');
      setTimeout(() => setCopyStatus(''), 2000);
    } catch (err) {
      setCopyStatus('Copy failed');
      setTimeout(() => setCopyStatus(''), 2400);
    }
  };

  const doShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: `Join my Mafia room ${roomCode}`, text: `Join my Mafia room: ${roomCode}`, url: shareUrl });
        setShareStatus('Shared');
      } else {
        await doCopy();
        setShareStatus('Link copied');
      }
    } catch (err) {
      await doCopy();
      setShareStatus('Link copied');
    }
    setTimeout(() => setShareStatus(''), 2000);
  };

  return (
    <div className="game-root page-lobby">
      <header className="lobby-main-header">
        <h1 className="lobby-hero-title welcome-title metallic-gradient">Mafia Game Room</h1>
        <p className="lobby-hero-sub welcome-sub metallic-gradient">A thrilling game of deception and strategy</p>
        <div className="lobby-roomcode">ROOM CODE: <span className="code-text">{roomCode}</span></div>
        <div className="room-code-actions">
          <button className="room-action-btn" onClick={doCopy} title="Copy room link" aria-label="Copy room link">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="18" height="18" aria-hidden>
              <path d="M16 3H8a2 2 0 0 0-2 2v2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
              <rect x="8" y="7" width="10" height="12" rx="2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M16 3v2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <button className="room-action-btn" onClick={doShare} title="Share room link" aria-label="Share room link">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="18" height="18" aria-hidden>
              <circle cx="18" cy="5" r="2" stroke="currentColor" strokeWidth="1.6"/>
              <circle cx="6" cy="12" r="2" stroke="currentColor" strokeWidth="1.6"/>
              <circle cx="18" cy="19" r="2" stroke="currentColor" strokeWidth="1.6"/>
              <path d="M8 12l8-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M8 12l8 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <div className="room-action-status">{copyStatus || shareStatus || ''}</div>
        </div>
      </header>

      <main className="lobby-card">
        <div className="lobby-card-top">
          <nav className="lobby-tabs" role="tablist">
            <button className={`lobby-tab ${activeTab === 'players' ? 'active' : ''}`} onClick={() => setActiveTab('players')}>PLAYERS</button>
            <button className={`lobby-tab ${activeTab === 'chat' ? 'active' : ''}`} onClick={() => setActiveTab('chat')}>CHAT LOBBY</button>
          </nav>
        </div>

        <section className="lobby-card-body" style={activeTab === 'chat' ? {display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0} : {}}>
          {activeTab === 'players' ? (
            <ul className="lobby-players-list">
              {players.map((p, i) => (
                <li key={`${p}-${i}`} className="lobby-player-item">{p}</li>
              ))}
            </ul>
          ) : (
            <>
              <div style={{flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', minHeight: 0}}>
                <div className="lobby-chat-placeholder">Chat will appear here</div>
                <div className="chat-messages" id="game-chat-messages">
                  {/* messages will appear here in future */}
                </div>
              </div>
            </>
          )}
        </section>

        {activeTab === 'chat' && (
          <div className="chat-input-row chat-input-bottom">
            <input id="game-chat-input" name="chatMessage" aria-label="Type a message" className="chat-input" placeholder="Type a message..." style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid #ccc', marginRight: '8px' }} />
            <button className="chat-send-btn" style={{ padding: '10px 18px', borderRadius: '8px', background: '#f6d27a', color: '#2b1f12', fontWeight: 700, border: 'none', cursor: 'pointer' }}>Send</button>
          </div>
        )}
      </main>

      <div className="external-actions">
        <button className="lobby-action start">VOTE</button>
        <button className="lobby-action close" onClick={onExit}>LEAVE THE ROOM</button>
      </div>
    </div>
  );
}
