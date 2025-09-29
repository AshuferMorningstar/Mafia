import React, { useState, useEffect, useRef } from 'react';
import '../styles.css';
import socket from '../lib/socket';

export default function GamePage({ roomCode, players = [], role = null, onExit = () => {} }) {
  const [copyStatus, setCopyStatus] = useState('');
  const [shareStatus, setShareStatus] = useState('');
  const [activeTab, setActiveTab] = useState('players');
  const [playerList, setPlayerList] = useState(players || []);
  const meRef = useRef(null);
  if (!meRef.current) {
    const generated = { id: Math.random().toString(36).slice(2,9), name: `Player-${Math.random().toString(36).slice(2,5)}` };
    meRef.current = players && players[0] ? { id: generated.id, name: players[0] } : generated;
  }
  const [messages, setMessages] = useState([]);
  const inputRef = useRef(null);

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

  useEffect(() => {
    // Connect socket and fetch initial state
    socket.connect();
    const me = meRef.current;

    fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/rooms/${roomCode}/players`)
      .then((r) => r.json())
      .then((d) => setPlayerList(d.players || playerList))
      .catch(() => {});

    fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/rooms/${roomCode}/messages`)
      .then((r) => r.json())
      .then((d) => setMessages(d.messages || []))
      .catch(() => {});

    socket.emit('join_room', { roomId: roomCode, player: me, token: undefined });

    socket.off('new_message');
    socket.off('player_joined');
    socket.off('player_left');

    const handleNewMessage = (data) => {
      const message = data?.message || data;
      if (!message) return;
      setMessages((prev) => {
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

    const handlePlayerJoined = (data) => {
      const incoming = data?.player;
      if (!incoming) return;
      setPlayerList((prev) => {
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

    socket.on('new_message', handleNewMessage);
    socket.on('player_joined', handlePlayerJoined);
    socket.on('player_left', handlePlayerLeft);

    return () => {
      socket.off('new_message', handleNewMessage);
      socket.off('player_joined', handlePlayerJoined);
      socket.off('player_left', handlePlayerLeft);
      socket.emit('leave_room', { roomId: roomCode, player: me });
      socket.disconnect();
    };
  }, [roomCode]);

  // auto-scroll chat when messages update
  useEffect(() => {
    const el = document.getElementById('chat-messages');
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  return (
    <div className="game-root page-lobby">
      <header className="lobby-main-header">
        <h1 className="lobby-hero-title welcome-title metallic-gradient">Mafia Game Room</h1>
        {/* Role panel: show assigned role and description */}
        <div className="role-panel" style={{marginTop:12, textAlign:'center'}}>
          <div style={{fontWeight:800, color:'#f3d7b0'}}>Your role:</div>
          <div style={{fontSize:20, fontWeight:900, marginTop:6}}>{role || 'Unassigned'}</div>
          <div style={{marginTop:8, color:'var(--muted)', maxWidth:680, marginLeft:'auto', marginRight:'auto'}}>
            {(() => {
              const descriptions = {
                'Killer': 'As a Killer, you choose a player each night to eliminate. Keep your identity secret.',
                'Doctor': 'As a Doctor, you may protect one player each night from being eliminated.',
                'Detective': 'As a Detective, you can investigate one player to learn whether they are a Killer.',
                'Civilian': 'As a Civilian, you have no special powers — collaborate and vote wisely.'
              };
              // If a known role exists, return its description.
              // If role is present but not in the map, show a generic private-role message.
              // If role is not assigned yet, don't show a "waiting" message here.
              return descriptions[role] || (role ? 'This role is private — only you can see it.' : '');
            })()}
          </div>
        </div>
      </header>

      <main className="lobby-card">
        <div className="lobby-card-top">
          <nav className="lobby-tabs" role="tablist">
            <button className={`lobby-tab ${activeTab === 'players' ? 'active' : ''}`} onClick={() => setActiveTab('players')}>PLAYERS</button>
            <button className={`lobby-tab ${activeTab === 'chat' ? 'active' : ''}`} onClick={() => setActiveTab('chat')}>CHAT</button>
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
                  <div className="chat-messages" id="chat-messages">
                    {messages.map((m, idx) => (
                      <div key={`${m.id || idx}-${idx}`} style={{padding: '6px 0'}}>
                        <strong style={{color: '#f3d7b0'}}>{m.from?.name || m.sender_name || 'Anon'}:</strong>
                        <span style={{marginLeft: 8}}>{m.text}</span>
                      </div>
                    ))}
                  </div>
              </div>
            </>
          )}
        </section>

        {activeTab === 'chat' && (
          <div className="chat-input-row chat-input-bottom">
            <input id="game-chat-input" ref={inputRef} name="chatMessage" aria-label="Type a message" className="chat-input" placeholder="Type a message..." style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid #ccc', marginRight: '8px' }} />
            <button
              onClick={() => {
                const text = inputRef.current?.value;
                if (!text) return;
                const me = meRef.current;
                const uniqueId = `${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
                const message = { id: uniqueId, from: { id: me.id, name: me.name }, text, ts: Date.now() };
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

      <div className="external-actions">
        <button className="lobby-action start">VOTE</button>
        <button className="lobby-action close" onClick={onExit}>LEAVE THE ROOM</button>
      </div>
    </div>
  );
}
