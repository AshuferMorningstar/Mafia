import React, { useState, useEffect, useRef } from 'react';
import '../styles.css';
import socket from '../lib/socket';

export default function GameLobby({ roomCode = '7XYRGF', players = ['Alice','Bob','Charlie','David'], isHost = true, hostId: initialHostId = null, playerName = null, onStart = () => {}, onClose = () => {}, onLeave = () => {} }) {
  const [activeTab, setActiveTab] = useState('players');
  const [playerList, setPlayerList] = useState(players);
  const [hostId, setHostId] = useState(initialHostId || null);
  // stable local player identity (used for join/leave and local labeling)
  const meRef = useRef(null);
  if (!meRef.current) {
    const generated = { id: Math.random().toString(36).slice(2,9), name: `Player-${Math.random().toString(36).slice(2,5)}` };
  meRef.current = playerName ? { id: generated.id, name: playerName } : generated;
  }
  const [messages, setMessages] = useState([]);
  const inputRef = useRef(null);
  const [copyStatus, setCopyStatus] = useState('');
  const [shareStatus, setShareStatus] = useState('');

  const shareUrl = (() => {
    try { return `${window.location.origin}${window.location.pathname}?room=${roomCode}`; } catch (e) { return roomCode; }
  })();
  // hostId state is set from server or initial prop; used to label the Host to all clients
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
      // if user cancels or share fails, fall back to copy
      await doCopy();
      setShareStatus('Link copied');
    }
    setTimeout(() => setShareStatus(''), 2000);
  };

  useEffect(() => {
  // Connect socket when lobby mounts
  socket.connect();

  const me = meRef.current;
    // fetch initial state (players + recent messages)
    fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/rooms/${roomCode}/players`)
      .then((r) => r.json())
      .then((d) => {
        setPlayerList(d.players || []);
        if (d.host_id) setHostId(d.host_id);
      })
      .catch(() => {});
    fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/rooms/${roomCode}/messages`)
      .then((r) => r.json())
      .then((d) => setMessages(d.messages || []))
      .catch(() => {});

    // Join the room
  socket.emit('join_room', { roomId: roomCode, player: me, token: undefined });

    // Clear any existing listeners first (helps with React StrictMode double-mount in dev)
    socket.off('player_joined');
    socket.off('player_left');
    socket.off('new_message');

    const handlePlayerJoined = (data) => {
      const incoming = data?.player;
      if (!incoming) return;
      setPlayerList((prev) => {
        // dedupe by id or name
        const exists = prev.some((p) => {
          const pid = p && typeof p === 'object' ? p.id : p;
          const iid = incoming && typeof incoming === 'object' ? incoming.id : incoming;
          const pname = p && typeof p === 'object' ? p.name : p;
          const iname = incoming && typeof incoming === 'object' ? incoming.name : incoming;
          return (pid && iid && pid === iid) || (pname && iname && pname === iname);
        });
        if (exists) return prev;
        return [...prev, incoming];
      });
    };

    const handleRoomState = (data) => {
      if (!data) return;
      if (Array.isArray(data.players)) setPlayerList(data.players);
      if (data.host_id) setHostId(data.host_id);
    };

    const handlePlayerLeft = (data) => {
      const leaving = data?.player;
      if (!leaving) return;
      setPlayerList((prev) => prev.filter((p) => {
        const pid = p && typeof p === 'object' ? p.id : p;
        const pname = p && typeof p === 'object' ? p.name : p;
        const lid = leaving && typeof leaving === 'object' ? leaving.id : leaving;
        const lname = leaving && typeof leaving === 'object' ? leaving.name : leaving;
        return !(pid === lid || (pname && lname && pname === lname));
      }));
    };

    const handleNewMessage = (data) => {
      const message = data?.message || data;
      if (!message) return;
      setMessages((prev) => {
        // dedupe by message id (or fallback to timestamp+text match)
        const exists = prev.some((m) => {
          if (!m) return false;
          if (m.id && message.id) return m.id === message.id;
          if (m.ts && message.ts && m.text && message.text) return m.ts === message.ts && m.text === message.text;
          return false;
        });
        if (exists) return prev;
        return [...prev, message];
      });
    };

    socket.on('player_joined', handlePlayerJoined);
  socket.on('room_state', handleRoomState);
    socket.on('player_left', handlePlayerLeft);
    socket.on('new_message', handleNewMessage);

    return () => {
      // remove the handlers we registered and leave the room
      socket.off('player_joined', handlePlayerJoined);
      socket.off('room_state', handleRoomState);
      socket.off('player_left', handlePlayerLeft);
      socket.off('new_message', handleNewMessage);
      socket.emit('leave_room', { roomId: roomCode, player: me });
      socket.disconnect();
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

        <section
          className="lobby-card-body chat-body-flex"
          style={activeTab === 'chat' ? {display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0} : {}}
        >
          {activeTab === 'players' ? (
            <ul className="lobby-players-list">
              {playerList.map((p, i) => {
                const pid = p && typeof p === 'object' ? p.id : p;
                const pname = p && typeof p === 'object' ? p.name : p;
                const display = pname || p;
                const isHostPlayer = pid && hostId && pid === hostId;
                return (
                  <li key={`${pid || display}-${i}`} className="lobby-player-item">
                    {display}{isHostPlayer ? ' — Host' : ''}
                  </li>
                );
              })}
            </ul>
          ) : (
            <>
              <div style={{flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', minHeight: 0}}>
                <div className="lobby-chat-placeholder">Chat will appear here</div>
                <div className="chat-messages" id="chat-messages">
                  {messages.map((m, idx) => (
                    <div key={`${m.id}-${idx}`} style={{padding: '6px 0'}}>
                      <strong style={{color: '#f3d7b0'}}>{m.from?.name || m.sender_name || 'Anon'}:</strong>
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
                const me = meRef.current;
                const uniqueId = `${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
                const message = { id: uniqueId, from: { id: me.id, name: me.name }, text, ts: Date.now() };
                // Emit to server; do not locally append — server will broadcast back and our
                // `new_message` handler will add it (with dedupe by id to avoid duplicates).
                socket.emit('send_message', { roomId: roomCode, message });
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
        {((hostId && meRef.current && meRef.current.id === hostId) || isHost) ? (
          <>
            <button className="lobby-action start" onClick={onStart}>START GAME</button>
            <button className="lobby-action close" onClick={onClose}>CLOSE ROOM</button>
          </>
        ) : (
          <button className="lobby-action close" onClick={onLeave}>LEAVE LOBBY</button>
        )}
      </div>

    </div>
  );
}
