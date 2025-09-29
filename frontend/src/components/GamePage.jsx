import React, { useState } from 'react';
import '../styles.css';

export default function GamePage({ roomCode, players = [], role = null, onExit = () => {} }) {
  const [copyStatus, setCopyStatus] = useState('');
  const [shareStatus, setShareStatus] = useState('');

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
        <h1 className="lobby-hero-title welcome-title metallic-gradient">Mafia</h1>
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
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12}}>
            <div style={{display:'flex',flexDirection:'column'}}>
              <div style={{fontWeight:800,color:'#f3d7b0'}}>Your role:</div>
              <div style={{fontSize:18,fontWeight:800}}>{role || 'Unassigned'}</div>
              <div style={{color:'var(--muted)'}}>{role ? 'This role is private — only you can see it.' : 'Waiting for host to start the game...'}</div>
            </div>
            <div style={{textAlign:'right'}}>
              <div style={{fontWeight:700}}>Speaker: <span style={{fontWeight:900}}>{players[0] || 'TBD'}</span></div>
              <div style={{marginTop:8}} className="room-meta">☀️ 5:00&nbsp;&nbsp;🌙 {players.length} Alive | 0 Dead</div>
            </div>
          </div>
        </div>

        <section className="lobby-card-body">
          <div style={{display:'flex',gap:12,flexDirection:'column'}}>
            <div style={{display:'flex',gap:12,flexDirection:'row',flexWrap:'wrap'}}>
              <div style={{flex:1,minWidth:180}} className="panel">
                <div className="panel-header">PLAYERS</div>
                <ul className="lobby-players-list">
                  {players.map((p,i) => <li className="lobby-player-item" key={`${p}-${i}`}>{p}</li>)}
                </ul>
              </div>

              <div style={{flex:2,minWidth:220}} className="panel">
                <div className="panel-header">CHAT LOBBY</div>
                <div className="chat-messages" style={{minHeight:120}}>Chat and game feed will appear here.</div>
                <div className="chat-input-row" style={{marginTop:8}}>
                  <input id="game-chat-input" name="chatMessage" aria-label="Type a message" className="chat-input" placeholder="Type a message..." />
                  <button className="chat-send">Send</button>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <div className="external-actions" style={{maxWidth: 'min(820px,98vw)'}}>
        <button className="lobby-action start">VOTE</button>
        <button className="lobby-action close" onClick={onExit}>LEAVE THE ROOM</button>
      </div>
    </div>
  );
}
