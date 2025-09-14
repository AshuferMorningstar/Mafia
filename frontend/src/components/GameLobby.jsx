import React, { useState, useEffect, useRef } from 'react';
import '../styles.css';
import socket, { socket as ioSocket } from '../lib/socket';

export default function GameLobby({ roomCode = '7XYRGF', players = ['Alice','Bob','Charlie','David'], isHost = true, onStart = () => {}, onClose = () => {} }) {
  const [activeTab, setActiveTab] = useState('players');
  const [playerList, setPlayerList] = useState(players);
  const [messages, setMessages] = useState([]);
  const inputRef = useRef(null);

  useEffect(() => {
    // Connect socket when lobby mounts
    ioSocket.connect();

    const me = { id: Math.random().toString(36).slice(2,9), name: 'You' };
    // fetch initial state (players + recent messages)
    fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/rooms/${roomCode}/players`)
      .then((r) => r.json())
      .then((d) => setPlayerList(d.players || []))
      .catch(() => {});
    fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/rooms/${roomCode}/messages`)
      .then((r) => r.json())
      .then((d) => setMessages(d.messages || []))
      .catch(() => {});

    // Join the room
    ioSocket.emit('join_room', { roomId: roomCode, player: me, token: undefined });

    ioSocket.on('player_joined', (data) => {
      setPlayerList((prev) => [...prev, data.player]);
    });
    ioSocket.on('player_left', (data) => {
      setPlayerList((prev) => prev.filter((p) => p.id !== data.player?.id));
    });
    ioSocket.on('new_message', (data) => {
      setMessages((prev) => [...prev, data.message]);
    });

    return () => {
      ioSocket.emit('leave_room', { roomId: roomCode, player: me });
      ioSocket.disconnect();
    };
  }, [roomCode]);

  // auto-scroll chat when messages update
  useEffect(() => {
    const el = document.getElementById('chat-messages');
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

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
              {playerList.map((p, i) => (<li key={p.id || i} className="lobby-player-item">{p.name || p}</li>))}
            </ul>
          ) : (
            <>
              <div style={{flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', minHeight: 0}}>
                <div className="lobby-chat-placeholder">Chat will appear here</div>
                <div className="chat-messages" id="chat-messages">
                  {messages.map((m) => (
                    <div key={m.id} style={{padding: '6px 0'}}>
                      <strong style={{color: '#f3d7b0'}}>{m.from?.name || 'Anon'}:</strong>
                      <span style={{marginLeft: 8}}>{m.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </section>

        {/* Render the chat input at the bottom of the card (sibling of lobby-card-body)
            so it naturally sits flush with the card bottom while retaining rounded corners */}
        {activeTab === 'chat' && (
          <div className="chat-input-row chat-input-bottom">
            <input
              ref={inputRef}
              className="chat-input"
              type="text"
              name="chatMessage"
              placeholder="Type a message..."
              style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid #ccc', marginRight: '8px' }}
            />
            <button
              onClick={() => {
                const text = inputRef.current?.value;
                if (!text) return;
                const message = { id: Date.now(), from: { id: 'you', name: 'You' }, text, ts: Date.now() };
                ioSocket.emit('send_message', { roomId: roomCode, message });
                setMessages((prev) => [...prev, message]);
                if (inputRef.current) inputRef.current.value = '';
              }}
              className="chat-send-btn"
              style={{ padding: '10px 18px', borderRadius: '8px', background: '#f6d27a', color: '#2b1f12', fontWeight: 700, border: 'none', cursor: 'pointer' }}
            >
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
