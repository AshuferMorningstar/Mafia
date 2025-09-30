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
  const [readyState, setReadyState] = useState([]);
  const [amReady, setAmReady] = useState(false);
  const [prestartCountdown, setPrestartCountdown] = useState(null);
  const [myRole, setMyRole] = useState(role || null);
  const [roleDescription, setRoleDescription] = useState('');
  const [notificationText, setNotificationText] = useState(null);
  const persistentPhases = ['night_start', 'killer', 'doctor', 'day', 'day_start', 'voting'];
  const [phase, setPhase] = useState(null);
  const [phaseDuration, setPhaseDuration] = useState(null);
  const [phaseRemaining, setPhaseRemaining] = useState(null);
  const [inGame, setInGame] = useState(false);
  const [targetId, setTargetId] = useState(null);
  const [voteTarget, setVoteTarget] = useState(null);
  const [eliminatedIds, setEliminatedIds] = useState([]);
  const [killerActed, setKillerActed] = useState(false);
  const [doctorActed, setDoctorActed] = useState(false);
  const [detectiveUsed, setDetectiveUsed] = useState(false);
  const [currentVotes, setCurrentVotes] = useState({}); // voterId -> targetId
  const [notifKey, setNotifKey] = useState(0);
  const [noVotesCountdown, setNoVotesCountdown] = useState(null);
  const [hostId, setHostId] = useState(null);
  const [localSettings, setLocalSettings] = useState({ killCount: 1, doctorCount: 0, detectiveCount: 0 });
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

  const [showSettingsPopup, setShowSettingsPopup] = useState(false);
  const [showSettingsToast, setShowSettingsToast] = useState(false);
  const [winBanner, setWinBanner] = useState(null); // { winner: 'Killers'|'Civilians', message }

  useEffect(() => {
    // Connect socket and fetch initial state
    socket.connect();
    const me = meRef.current;

    // perform a simple time sync: send request and measure RTT to estimate clock offset
    const doTimeSync = () => {
      try {
        let timeSyncStart = Date.now();
        socket.emit('time_sync', { client_ts: timeSyncStart });
        socket.off('time_sync_response');
        socket.on('time_sync_response', (d) => {
          try {
            const now = Date.now();
            const server_ts = d?.server_ts || null;
            if (!server_ts) return;
            const rtt = now - timeSyncStart;
            // estimated server time now = server_ts + rtt/2, so offset = server_time_now - local_now
            const estimated_server_now = server_ts + Math.floor(rtt / 2);
            const offset = estimated_server_now - now;
            // store offset on window so other handlers can access it (simple approach)
            window.__server_time_offset = offset;
          } catch (e) {}
        });
      } catch (e) {}
    };
    doTimeSync();

    fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/rooms/${roomCode}/players`)
      .then((r) => r.json())
      .then((d) => setPlayerList(d.players || playerList))
      .catch(() => {});

    fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/rooms/${roomCode}/messages`)
      .then((r) => r.json())
      .then((d) => setMessages(d.messages || []))
      .catch(() => {});

    const doJoin = () => {
      try {
        socket.emit('join_room', { roomId: roomCode, player: me, token: undefined });
        // refresh authoritative state after join
        fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/rooms/${roomCode}/players`)
          .then((r) => r.json())
          .then((d) => setPlayerList(d.players || []))
          .catch(() => {});
        fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/rooms/${roomCode}/messages`)
          .then((r) => r.json())
          .then((d) => setMessages(d.messages || []))
          .catch(() => {});
      } catch (e) {}
    };
    doJoin();

    // ensure we re-join automatically when the socket reconnects (network reconnects or hot reload)
    socket.off('connect');
    socket.on('connect', () => {
      console.debug('[socket] connected, rejoining room', roomCode);
      doTimeSync();
      doJoin();
    });

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
        // if this is a System message, surface it in the notification area and do NOT append it to the chat messages
        if (message?.from?.name === 'System' && message?.text) {
          if (!persistentPhases.includes(phase) && prestartCountdown == null) {
            setNotificationText(message.text);
          }
          return prev; // skip adding to chat history
        }
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

    const handleReadyState = (data) => {
      const list = data?.ready || [];
      setReadyState(list);
    };

    socket.off('room_state');
    socket.on('room_state', (d) => {
      // prefer authoritative player list from server; avoid falling back to the closed-over playerList variable
      const playersFromServer = Array.isArray(d?.players) ? d.players : [];
      console.debug('[socket] room_state received', { room: roomCode, playersFromServer, host_id: d?.host_id });
      setPlayerList(playersFromServer);
      setHostId(d?.host_id || null);
      try {
        const elim = d?.eliminated || {};
        const ids = Object.keys(elim).filter((k) => elim[k]);
        setEliminatedIds(ids);
      } catch (e) {}
    });

    socket.off('settings_updated');
    socket.on('settings_updated', (d) => {
      const s = d?.settings || {};
      if (s) setLocalSettings({ killCount: s.killCount || 1, doctorCount: s.doctorCount || 0, detectiveCount: s.detectiveCount || 0 });
      // briefly show a toast confirming settings were applied
      setShowSettingsToast(true);
      setTimeout(() => setShowSettingsToast(false), 2500);
    });

    socket.off('game_over');
    socket.on('game_over', (d) => {
      if (!d) return;
      let text = `Game over! Winner: ${d.winner}`;
      // If killers won and server provided killer names, append them
      if (d.winner === 'Killers' && Array.isArray(d.killers) && d.killers.length > 0) {
        const names = d.killers.map((k) => k.name).filter(Boolean).join(', ');
        if (names) text = `Killers win! Survivors eliminated by: ${names}`;
      }
      setNotificationText(text);
      setPhase('ended');
      // show persistent win banner until dismissed
      setWinBanner({ winner: d.winner, message: text });
    });

    const handlePlayerLeft = (data) => {
      const leaving = data?.player;
      if (!leaving) return;
      console.debug('[socket] player_left', { room: roomCode, leaving });
      setPlayerList((prev) => prev.filter((p) => {
        const pid = p && typeof p === 'object' ? p.id : p;
        const pname = p && typeof p === 'object' ? p.name : p;
        const lid = leaving && typeof leaving === 'object' ? leaving.id : leaving;
        const lname = leaving && typeof leaving === 'object' ? leaving.name : leaving;
        // prefer id matching when available
        if (lid) return pid !== lid;
        if (lname) return pname !== lname;
        return true;
      }));
    };

    socket.on('new_message', handleNewMessage);
    socket.on('player_joined', handlePlayerJoined);
    socket.on('player_left', handlePlayerLeft);
    socket.on('ready_state', handleReadyState);
    socket.on('game_started', (data) => {
      const publicPlayers = data?.players || [];
      setPlayerList(publicPlayers);
    });

    // prestart is emitted once with start_ts and duration so clients compute synchronized countdown
    socket.off('prestart');
    socket.on('prestart', (d) => {
      const duration = d?.duration ?? null;
      const start_ts = d?.start_ts ?? null;
      if (duration == null || start_ts == null) return;
      const offset = window.__server_time_offset || 0;
      const server_now_est = Date.now() + offset;
      const end = Number(start_ts) + Number(duration) * 1000;
      const remainingMs = Math.max(0, end - server_now_est);
      const remainingSec = Math.ceil(remainingMs / 1000);
      setPrestartCountdown(remainingSec);
      if (remainingSec != null) setNotificationText(`Game starting in ${remainingSec}...`);
    });

    socket.off('your_role');
    socket.on('your_role', (d) => {
      if (!d) return;
      // directly assign role to the inline role panel (no popup modal)
      setMyRole(d.role);
      setRoleDescription(d.description || '');
      // clear transient notifications now that the role is assigned
      setNotificationText(null);
      setPrestartCountdown(null);
      // once role is assigned, we no longer need to show the Ready waiting text
      setAmReady(false);
    });

    socket.off('roles_assigned');
    socket.on('roles_assigned', (d) => {
      const publicPlayers = d?.players || [];
      setPlayerList(publicPlayers);
      // roles have been assigned publicly — clear old notifications
      setNotificationText(null);
      setPrestartCountdown(null);
      setAmReady(false);
      // mark the client as in-game so lobby controls are hidden
      setInGame(true);
    });

    socket.off('phase');
    socket.on('phase', (d) => {
      if (!d) return;
      const p = d.phase;
      // reset per-round action flags at the start of night so Killers/Doctors can act each round
      if (p === 'night_start' || p === 'pre_night' || p === 'killer') {
        try {
          setKillerActed(false);
          setDoctorActed(false);
        } catch (e) {}
      }
      setPhase(p);
      const duration = d.duration || null;
      setPhaseDuration(duration);
      // compute remaining time based on server start_ts to keep clients in sync
      const offset = window.__server_time_offset || 0;
      if (d.start_ts && duration) {
        const now = Date.now() + offset;
        const end = Number(d.start_ts) + Number(duration) * 1000;
        const remainingMs = Math.max(0, end - now);
        setPhaseRemaining(Math.ceil(remainingMs / 1000));
      } else {
        setPhaseRemaining(duration || null);
      }
      const text = d.message || `Phase: ${p}`;
      // For certain phases we want explicit public wording and to ensure all clients see it
      if (p === 'killer') {
        setNotificationText('Night has fallen — Killers, choose your target.');
        setInGame(true);
      } else if (p === 'doctor') {
        setNotificationText('Doctor: choose someone to save.');
        setInGame(true);
      } else if (persistentPhases.includes(p)) {
        // keep this text as the persistent notification for other persistent phases
        setNotificationText(text);
        setInGame(true);
      } else {
        // otherwise set transient notification
        setNotificationText(text);
      }
      // system phase announcements are shown in the notification card only (do not append to chat history)
      if (p === 'day') {
        setMessages((prev) => prev.filter((m) => !m.scope || m.scope === 'public'));
      }
    });

    socket.off('night_result');
    socket.on('night_result', (d) => {
      if (!d) return;
      let text = '';
      if (d.result === 'killed') {
        text = `${d.player.name} was killed last night.`;
      } else if (d.result === 'saved') {
        // if the server included who saved, announce by name
        if (d.saved_by && d.saved_by.name) {
          text = `Doctor ${d.saved_by.name} saved ${d.player.name} last night.`;
        } else {
          text = `${d.player.name} was saved by the Doctor last night.`;
        }
      } else {
        text = `No one was killed last night.`;
      }
  setNotificationText(text);
      // update eliminated list if provided in the payload (server emits room_state too)
      try {
        if (d.result === 'killed' && d.player && d.player.id) setEliminatedIds((s) => Array.from(new Set([...s, d.player.id])));
        if (d.result === 'saved') {
          // ensure saved players are not marked eliminated
          if (d.player && d.player.id) setEliminatedIds((s) => s.filter((x) => x !== d.player.id));
        }
      } catch (e) {}
      // update eliminated list if provided
      try {
        if (d?.player) {
          const pid = d.player.id;
          if (d.result === 'killed') setEliminatedIds((s) => Array.from(new Set([...s, pid])));
        }
      } catch (e) {}
    });

    // New: night_summary is emitted after day_start to give a concise summary of the previous night
    socket.off('night_summary');
    socket.on('night_summary', (d) => {
      if (!d) return;
      try {
        // Server provides a friendly message plus structured fields (killed/saved/saved_by)
        const msg = d.message || (d.killed ? `${d.killed.name} was killed last night` : (d.saved ? `Doctor saved ${d.saved.name} last night` : 'No one died last night'));
        setNotificationText(msg);
        // update eliminated list based on payload
        if (d.killed && d.killed.id) {
          setEliminatedIds((s) => Array.from(new Set([...s, d.killed.id])));
        }
        if (d.saved && d.saved.id) {
          setEliminatedIds((s) => s.filter((x) => x !== d.saved.id));
        }
      } catch (e) {
        // fallback to raw display
        setNotificationText(JSON.stringify(d));
      }
    });

    socket.off('detective_result');
    socket.on('detective_result', (d) => {
      if (!d) return;
      const text = d.is_killer ? `Investigation: target is a KILLER` : `Investigation: target is NOT a killer (role: ${d.role})`;
      setNotificationText(text);
      setMessages((prev) => [...prev, { id: `detective-${Date.now()}`, from: { name: 'Detective' }, text }]);
    });

    socket.off('vote_result');
    socket.on('vote_result', (d) => {
      if (!d) return;
      let text = '';
      if (d.result === 'eliminated') {
        text = `${d.player.name} was eliminated by vote. Role: ${d.player.role}`;
      } else if (d.result === 'no_elimination') {
        text = `No elimination (tie or no votes).`;
      } else if (d.result === 'no_votes') {
        // start a local 3..1 countdown and show it in the notification area
        let n = 3;
        setNoVotesCountdown(n);
        setNotificationText(`No votes cast — moving to night in ${n}s.`);
        const iv = setInterval(() => {
          n -= 1;
          if (n > 0) {
            setNoVotesCountdown(n);
            setNotificationText(`No votes cast — moving to night in ${n}s.`);
          } else {
            clearInterval(iv);
            setNoVotesCountdown(null);
            setNotificationText(null);
          }
        }, 1000);
        // attach interval id to window so cleanup on unmount can clear it
        window.__no_votes_iv = iv;
        return;
      }
      setNotificationText(text);
      fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/rooms/${roomCode}/players`)
        .then((r) => r.json())
        .then((d) => setPlayerList(d.players || playerList))
        .catch(() => {});
      try {
        if (d?.player && d.result === 'eliminated') setEliminatedIds((s) => Array.from(new Set([...s, d.player.id])));
      } catch (e) {}
    });

    return () => {
      socket.off('new_message', handleNewMessage);
      socket.off('player_joined', handlePlayerJoined);
      socket.off('player_left', handlePlayerLeft);
      socket.off('ready_state', handleReadyState);
      socket.emit('leave_room', { roomId: roomCode, player: me });
      socket.disconnect();
      try {
        if (window.__no_votes_iv) {
          clearInterval(window.__no_votes_iv);
          window.__no_votes_iv = null;
        }
      } catch (e) {}
    };
  }, [roomCode]);

  // auto-scroll chat when messages update
  useEffect(() => {
    const el = document.getElementById('chat-messages');
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  useEffect(() => {
    if (!phase || !phaseDuration) {
      setPhaseRemaining(null);
      return;
    }
    setPhaseRemaining(phaseDuration);
    const iv = setInterval(() => {
      setPhaseRemaining((r) => {
        if (r == null) return null;
        if (r <= 1) {
          clearInterval(iv);
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(iv);
  }, [phase, phaseDuration]);

  // auto-clear notification after a while, but keep countdown visible if active
  useEffect(() => {
    if (!notificationText) return;
    // keep countdown notifications visible
    if (prestartCountdown != null) return;
    // do not auto-clear if we are in a persistent phase
    if (phase && persistentPhases.includes(phase)) return;
    const t = setTimeout(() => setNotificationText(null), 8000);
    return () => clearTimeout(t);
  }, [notificationText, prestartCountdown, phase]);

  // bump notifKey when visible notification content changes so animation re-triggers
  useEffect(() => {
    setNotifKey((k) => k + 1);
  }, [notificationText, prestartCountdown, phase]);

  return (
    <div className="game-root page-lobby">
      <header className="lobby-main-header">
        <h1 className="lobby-hero-title welcome-title metallic-gradient">Mafia Game Room</h1>
        <div className="lobby-roomcode" style={{marginTop:6}}>ROOM CODE: <span className="code-text">{roomCode}</span></div>
  {/* (removed per user request) */}
        <div className="room-code-actions" style={{marginTop:8}}>
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
          {/* Gear settings: host-only control opens a small popup */}
          {hostId && meRef.current && hostId === meRef.current.id && (
            <button className="room-action-btn" onClick={() => setShowSettingsPopup((s) => !s)} title="Room settings" aria-label="Room settings" style={{marginLeft:6}}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06A2 2 0 1 1 2.3 17.88l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09c.7 0 1.27-.4 1.51-1A1.65 1.65 0 0 0 4.3 7.1L4.24 7a2 2 0 1 1 2.83-2.83l.06.06c.5.5 1.16.81 1.82.33.7-.5 1-.9 1-1.51V3a2 2 0 1 1 4 0v.09c0 .6.3 1 1 1.51.66.48 1.32.17 1.82-.33l.06-.06A2 2 0 1 1 19.7 6.12l-.06.06c-.5.5-.81 1.16-.33 1.82.5.7.9 1 1.51 1H21a2 2 0 1 1 0 4h-.09c-.6 0-1.27.4-1.51 1z"/>
              </svg>
            </button>
          )}
          <div className="room-action-status">{copyStatus || shareStatus || ''}</div>
        </div>

        {/* Settings popup card (host only) */}
        {showSettingsPopup && hostId && meRef.current && hostId === meRef.current.id && (
          <div className="settings-popover">
            <div className="card">
              <div style={{fontWeight:800, marginBottom:8}}>Room Settings</div>
              <div className="row">
                <label htmlFor="killCount">Killers <input id="killCount" name="killCount" type="number" min={1} value={localSettings.killCount} onChange={(e) => setLocalSettings((s) => ({...s, killCount: Number(e.target.value)}))} /></label>
                <label htmlFor="doctorCount">Doctors <input id="doctorCount" name="doctorCount" type="number" min={0} value={localSettings.doctorCount} onChange={(e) => setLocalSettings((s) => ({...s, doctorCount: Number(e.target.value)}))} /></label>
              </div>
              <div className="row">
                <label htmlFor="detectiveCount">Detectives <input id="detectiveCount" name="detectiveCount" type="number" min={0} value={localSettings.detectiveCount} onChange={(e) => setLocalSettings((s) => ({...s, detectiveCount: Number(e.target.value)}))} /></label>
              </div>
              <div className="actions">
                <button className="btn cancel" onClick={() => setShowSettingsPopup(false)}>Cancel</button>
                <button className="btn apply" onClick={() => { socket.emit('set_settings', { roomId: roomCode, settings: localSettings }); setShowSettingsPopup(false); }}>Apply</button>
              </div>
            </div>
          </div>
        )}

        {/* settings applied toast */}
        {showSettingsToast && (
          <div className={`settings-toast enter`} role="status" aria-live="polite">Settings applied</div>
        )}
        {/* Role panel: show assigned role and description */}
        <div className="role-panel" style={{marginTop:12, textAlign:'center'}}>
          <div style={{fontWeight:800, color:'#f3d7b0'}}>Your role:</div>
          <div style={{fontSize:20, fontWeight:900, marginTop:6}}>{myRole || 'Unassigned'}</div>
          <div style={{marginTop:8, color:'var(--muted)', maxWidth:680, marginLeft:'auto', marginRight:'auto'}}>
            {(() => {
              const descriptions = {
                'Killer': 'As a Killer, you choose a player each night to eliminate. Keep your identity secret.',
                'Doctor': 'As a Doctor, you may protect one player each night from being eliminated.',
                'Detective': 'As a Detective, you can investigate one player to learn whether they are a Killer.',
                'Civilian': 'As a Civilian, you have no special powers — collaborate and vote wisely.'
              };
              // Prefer the private-assigned role if available
              const r = myRole || role;
              return descriptions[r] || (r ? 'This role is private — only you can see it.' : '');
            })()}
          </div>
        </div>
        {/* Host settings removed from game room; managed in dashboard/panel instead */}
        {/* Small role-specific notification area (compact) */}
          <div className="role-notification-card" role="status" aria-live="polite" style={{marginTop:10}}>
          <div className="role-notification-content">
          <div style={{marginTop:8}}>
                {/* hide Ready controls after the game has started */}
                {!inGame && (
                  !amReady ? (
                    <button
                      onClick={() => {
                        try {
                          socket.emit('player_ready', { roomId: roomCode, player: meRef.current });
                          setAmReady(true);
                        } catch (e) {}
                      }}
                      style={{padding:'8px 12px', borderRadius:8, background:'#f6d27a', border:'none', fontWeight:800, cursor:'pointer'}}
                    >Ready</button>
                  ) : (
                    <div style={{color:'var(--muted)'}}>Waiting for others...</div>
                  )
                )}
                {!inGame && readyState.length > 0 && (
                  <div style={{marginTop:8, color:'var(--muted)'}}>{readyState.length} ready</div>
                )}

                {/* show prestart countdown prominently in the notification card (highest priority) */}
                {prestartCountdown != null ? (
                  <div key={`notif-${notifKey}-count`} className="notif-animate" style={{marginTop:8, fontSize:18, fontWeight:900}}>
                    Game starting in {prestartCountdown}...
                  </div>
                ) : notificationText ? (
                  /* otherwise show the single latest notificationText (if any) */
                  <div key={`notif-${notifKey}-text`} className="notif-animate" style={{marginTop:8, color:'var(--muted)', display:'flex', alignItems:'center', gap:10}}>
                    <div>{notificationText}</div>
                    {/* if we are in a persistent phase, show the phase timer beside the message */}
                    {phase && persistentPhases.includes(phase) && phaseRemaining != null && (
                      <div style={{fontWeight:800}}>{phaseRemaining}s</div>
                    )}
                  </div>
                ) : null}

                {/* Global abstain button removed: per-row skip/abstain buttons remain beside each player */}

                {/* role modal removed — roles are displayed inline in the role panel above */}

              </div>
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
              {playerList.map((p, i) => {
                const name = p && typeof p === 'object' ? p.name : p;
                const id = p && typeof p === 'object' ? p.id : `${name}-${i}`;
                const isHost = id && hostId && id === hostId;
                const isReady = readyState && readyState.includes(id);
                const isElim = eliminatedIds.includes(id);
                // determine which action buttons should be enabled for this client
                const canKill = myRole === 'Killer' && phase === 'killer' && !killerActed && !isElim && !eliminatedIds.includes(meRef.current.id);
                const canSave = myRole === 'Doctor' && phase === 'doctor' && !doctorActed && !isElim && !eliminatedIds.includes(meRef.current.id);
                const canInvestigate = myRole === 'Detective' && (phase === 'killer' || phase === 'doctor' || phase === 'night_start' || phase === 'pre_night') && !detectiveUsed && !isElim && !eliminatedIds.includes(meRef.current.id);
                const canSusVote = (phase === 'day' || phase === 'voting') && !isElim && !eliminatedIds.includes(meRef.current.id) && !(currentVotes[meRef.current.id] === id);
                return (
                  <li key={`${id}-${i}`} className="lobby-player-item" style={{display:'flex', alignItems:'center', justifyContent:'space-between', gap:12}}>
                    <div style={isElim ? {textDecoration: 'line-through', opacity: 0.6} : {}}>{name} {id === meRef.current?.id ? <span style={{fontWeight:800, marginLeft:6}}>(you)</span> : ''} {isElim ? '💀' : ''}
                      {isHost && <span style={{marginLeft:8, color:'#ffd27a', fontWeight:700}}>HOST</span>}
                      {isReady && !inGame && <span style={{marginLeft:8, color:'#9be', fontWeight:700}}>READY</span>}
                    </div>
                    <div style={{display:'flex', gap:8}}>
                      {/* Killer action (knife) - visible only to Killers */}
                      {myRole === 'Killer' && (
                        <>
                          <button title="Kill" disabled={!canKill} onClick={() => {
                            if (!canKill) return;
                            socket.emit('killer_action', { roomId: roomCode, player: meRef.current, targetId: id });
                            setKillerActed(true);
                            setNotificationText(`You targeted ${name}`);
                          }}>🔪</button>
                          <button title="Skip Kill" disabled={!canKill} onClick={() => {
                            if (!canKill) return;
                            socket.emit('killer_action', { roomId: roomCode, player: meRef.current, skip: true });
                            setKillerActed(true);
                            setNotificationText(`You skipped killing this night`);
                          }}>⏭</button>
                        </>
                      )}
                      {/* Doctor action (bandage) - visible only to Doctors */}
                      {myRole === 'Doctor' && (
                        <>
                          <button title="Save" disabled={!canSave} onClick={() => {
                            if (!canSave) return;
                            socket.emit('doctor_action', { roomId: roomCode, player: meRef.current, targetId: id });
                            setDoctorActed(true);
                            setNotificationText(`You chose to save ${name}`);
                          }}>🩹</button>
                          <button title="Skip Save" disabled={!canSave} onClick={() => {
                            if (!canSave) return;
                            socket.emit('doctor_action', { roomId: roomCode, player: meRef.current, skip: true });
                            setDoctorActed(true);
                            setNotificationText(`You skipped saving this night`);
                          }}>⏭</button>
                        </>
                      )}
                      {/* Detective action (magnifier) - visible only to Detectives */}
                      {myRole === 'Detective' && (
                        <button title="Investigate" disabled={!canInvestigate} onClick={() => {
                          if (!canInvestigate) return;
                          socket.emit('detective_action', { roomId: roomCode, player: meRef.current, targetId: id });
                          setDetectiveUsed(true);
                          setNotificationText(`You investigated ${name}`);
                        }}>🔍</button>
                      )}
                      {/* Sus/vote button - visible during day to everyone alive */}
                      <button title="Sus / Vote" disabled={!canSusVote} onClick={() => {
                        if (!canSusVote) return;
                        // locally track current vote and emit cast_vote
                        setCurrentVotes((s) => ({ ...s, [meRef.current.id]: id }));
                        socket.emit('cast_vote', { roomId: roomCode, player: meRef.current, targetId: id });
                        setNotificationText(`You voted for ${name}`);
                      }}>🤨</button>
                      {/* Skip/Abstain for voting per-row (also permitted) */}
                      <button title="Skip Vote" disabled={!canSusVote} onClick={() => {
                        if (!canSusVote) return;
                        setCurrentVotes((s) => ({ ...s, [meRef.current.id]: null }));
                        socket.emit('cast_vote', { roomId: roomCode, player: meRef.current, targetId: null });
                        setNotificationText('You abstained from voting');
                      }}>⏭</button>
                    </div>
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
          /* show chat input only if public day OR if private phase for the user's role */
          ((phase === 'day' || phase === null) || (phase === 'killer' && myRole === 'Killer') || (phase === 'doctor' && myRole === 'Doctor')) && (
            <div className="chat-input-row chat-input-bottom">
            {/* disable chat input and send button if player is eliminated */}
            <input id="game-chat-input" ref={inputRef} name="chatMessage" aria-label="Type a message" className="chat-input" placeholder="Type a message..." style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid #ccc', marginRight: '8px' }} disabled={eliminatedIds.includes(meRef.current.id)} />
            <button
              onClick={() => {
                const text = inputRef.current?.value;
                if (!text) return;
                const me = meRef.current;
                const uniqueId = `${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
                const message = { id: uniqueId, from: { id: me.id, name: me.name }, text, ts: Date.now() };
                let scope = 'public';
                if (phase === 'killer' && myRole === 'Killer') scope = 'killers';
                if (phase === 'doctor' && myRole === 'Doctor') scope = 'doctors';
                socket.emit('send_message', { roomId: roomCode, message: { ...message, scope }, scope });
                if (inputRef.current) inputRef.current.value = '';
              }}
              className="chat-send-btn"
              style={{ padding: '10px 18px', borderRadius: '8px', background: '#f6d27a', color: '#2b1f12', fontWeight: 700, border: 'none', cursor: 'pointer' }}
              disabled={eliminatedIds.includes(meRef.current.id)}
            >
              Send
            </button>
          </div>
          ))}
        {/* Action UI removed per request: players act through other controls/flows handled by server */}
      </main>

      <div className="external-actions">
        <button className="lobby-action start">VOTE</button>
        <button className="lobby-action close" onClick={onExit}>LEAVE THE ROOM</button>
      </div>
      {/* persistent win banner */}
      {winBanner && (
        <div className={`win-banner ${winBanner.winner === 'Killers' ? 'killers' : 'civilians'}`} role="status" aria-live="polite">
          <span>{winBanner.message}</span>
          <button className="dismiss" onClick={() => setWinBanner(null)}>Dismiss</button>
        </div>
      )}
    </div>
  );
}
