import React, { useState } from 'react';
import '../styles.css';

export default function JoinRoom({ onJoinLobby, onBack }) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');

  const canJoin = name.trim() && code.trim();

  return (
    <div className="welcome-root" style={{ paddingTop: 48 }}>
      <button onClick={onBack} aria-label="Back" className="back-button">←</button>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
        <h1 className="welcome-title metallic-gradient shine-animated" style={{ textAlign: 'center', marginBottom: 6 }}>Join a Room</h1>

        <div className="form-width" style={{ width: '100%', marginTop: 12, display: 'flex', justifyContent: 'center' }}>
          <div style={{ width: '100%' }}>
            <label htmlFor="join-player-name" className="welcome-sub metallic-gradient shine-animated" style={{ display: 'block', marginBottom: 8 }}>Enter your name</label>
            <input id="join-player-name" value={name} onChange={e => setName(e.target.value)} type="text" placeholder="Your name" style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(0,0,0,0.12)', marginBottom: 12 }} />

            <label htmlFor="room-code" className="welcome-sub metallic-gradient shine-animated" style={{ display: 'block', marginBottom: 8 }}>Room code</label>
            <input id="room-code" value={code} onChange={e => setCode(e.target.value)} type="text" placeholder="ABCD" style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(0,0,0,0.12)', marginBottom: 16 }} />

            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <button className="welcome-start" disabled={!canJoin} onClick={() => onJoinLobby && onJoinLobby({ name: name.trim(), code: code.trim() })} style={{ width: '100%' }}>Join Game</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
