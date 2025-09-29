import React, { useState } from 'react';
import '../styles.css';

export default function CreateRoom({ onEnterLobby, onBack, settings = {} }) {
  const [name, setName] = useState('');

  return (
    <div className="welcome-root" style={{ paddingTop: 48 }}>
  <button onClick={onBack} aria-label="Back" className="back-button">←</button>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
        <h1 className="welcome-title metallic-gradient shine-animated" style={{ textAlign: 'center', marginBottom: 6 }}>Create a Room</h1>

        <div className="form-width" style={{ width: '100%', marginTop: 12, display: 'flex', justifyContent: 'center' }}>
          <div style={{ width: '100%' }}>
            <label htmlFor="player-name" className="welcome-sub metallic-gradient shine-animated" style={{ display: 'block', marginBottom: 8 }}>Enter your name</label>
            <input id="player-name" value={name} onChange={e => setName(e.target.value)} type="text" placeholder="Your name" style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(0,0,0,0.12)', marginBottom: 16 }} />

            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <button className="welcome-start" disabled={!name.trim()} onClick={() => onEnterLobby(name.trim(), settings)} style={{ width: '100%' }}>Enter Game</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
