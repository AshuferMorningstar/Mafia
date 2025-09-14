import React from 'react';
import '../styles.css';

export default function CreateRoom({ onEnterLobby, onBack }) {
  return (
    <div className="welcome-root" style={{ paddingTop: 48 }}>
      <button onClick={onBack} style={{ position: 'absolute', left: 18, top: 18, background: 'transparent', color: 'var(--text)', border: 'none', cursor: 'pointer' }}>← Back</button>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
        {/* Centered heading using the same font/style as the main title (no 'Mafia Game' text here) */}
        <h1 className="welcome-title metallic-gradient shine-animated" style={{ textAlign: 'center', marginBottom: 6 }}>Create a Room</h1>

        <div style={{ width: '100%', maxWidth: 480, marginTop: 12 }}>
          <label style={{ display: 'block', marginBottom: 8, color: 'var(--muted)' }}>Enter your name</label>
          <input type="text" placeholder="Your name" style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(0,0,0,0.12)', marginBottom: 16 }} />

          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <button className="welcome-start" onClick={onEnterLobby} style={{ width: '100%', maxWidth: 360 }}>Enter Game Lobby</button>
          </div>
        </div>
      </div>
    </div>
  );
}
