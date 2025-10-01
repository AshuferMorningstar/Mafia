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
  // privateScope removed: main chat always sends to public; private panels use scoped sends
  const [aliveRoleMembers, setAliveRoleMembers] = useState({});
  const [privatePanel, setPrivatePanel] = useState(null); // null | 'killers' | 'doctors'
  const panelInputRef = useRef(null);
  const [privateMessages, setPrivateMessages] = useState([]);
  const modalRef = useRef(null);
  const closeBtnRef = useRef(null);
  const prevFocusRef = useRef(null);

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
      // if this is a scoped private message and the private panel for that scope is open, append to privateMessages
      try {
        const scope = message?.scope;
        if (scope === 'killers' || scope === 'doctors') {
          if (privatePanel === scope) {
            setPrivateMessages((pm) => [...pm, message]);
          }
        }
      } catch (e) {}
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
        // store alive role members mapping if provided by server
        if (d?.alive_role_members) {
          try {
            // e.g. { Killer: [{id,name}], Doctor: [...] }
            // keep it on state as a simple mapping
            setAliveRoleMembers(d.alive_role_members);
          } catch (e) {}
        }
      } catch (e) {}
    });

    // focus management: save previous active element and focus inside modal when opened; restore on close
    try {
      if (privatePanel) {
        prevFocusRef.current = document.activeElement;
        // small timeout to allow element to mount
        setTimeout(() => {
          if (panelInputRef.current) panelInputRef.current.focus();
          else if (closeBtnRef.current) closeBtnRef.current.focus();
          else if (modalRef.current && typeof modalRef.current.focus === 'function') modalRef.current.focus();
        }, 60);
      } else {
        // restore previous focus
        try { prevFocusRef.current && prevFocusRef.current.focus && prevFocusRef.current.focus(); } catch (e) {}
      }
    } catch (e) {}

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
      // reset detective usage flag at game start for this client
      try { setDetectiveUsed(false); } catch (e) {}
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
      // update local settings counts from server-provided settings if present
      try {
        const s = d?.settings || {};
        setLocalSettings({ killCount: s.killCount || 1, doctorCount: s.doctorCount || 0, detectiveCount: s.detectiveCount || 0 });
      } catch (e) {}
      // reset detective usage when roles are assigned (new game / new role assignment)
      try { setDetectiveUsed(false); } catch (e) {}
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
      // Show the detective result privately to this client (server emits only to the requesting detective)
      const text = d.is_killer ? `Investigation: target is a KILLER` : `Investigation: target is NOT a killer (role: ${d.role})`;
      setNotificationText(text);
      // do NOT append to public chat history; this should remain private
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

  // Helper to send private (scoped) messages. Performs optimistic append and ensures socket is connected.
  const sendPrivate = async (text) => {
    if (!text) return;
    const nightPhases = ['killer','doctor','night_start','pre_night'];
    const isNightPhase = phase && nightPhases.includes(phase);
    if (isNightPhase) return;
    const me = meRef.current;
    const uniqueId = `${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
    const scope = privatePanel === 'killers' ? 'killers' : 'doctors';
    const message = { id: uniqueId, from: { id: me.id, name: me.name }, text, ts: Date.now(), scope };
    // optimistic append
    setPrivateMessages((pm) => [...pm, message]);
    // ensure socket is connected
    try {
      if (!socket.connected) {
        console.debug('[socket] not connected — attempting to connect');
        try { socket.connect(); } catch (e) {}
        // small delay to allow handshake
        await new Promise((r) => setTimeout(r, 200));
      }
      socket.emit('send_message', { roomId: roomCode, message: message, scope });
    } catch (e) {
      console.error('sendPrivate error', e);
    }
  };

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

                {/* Shared Skip/Abstain control moved to the players card bottom-right (see player list render) */}

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
            <div>
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
                    <div style={isElim ? {textDecoration: 'line-through', opacity: 0.6} : {}}>
                      {name} {id === meRef.current?.id ? <span style={{fontWeight:700, marginLeft:6, fontSize:12}}>(you)</span> : ''} {isElim ? '💀' : ''}
                      {isHost && <span style={{marginLeft:8, color:'#ffd27a', fontWeight:600, fontSize:12}}>HOST</span>}
                      {isReady && !inGame && <span style={{marginLeft:8, color:'#9be', fontWeight:700}}>READY</span>}
                    </div>
                    <div style={{display:'flex', gap:8}}>
                            {/* Killer action (knife) - visible only to Killers and when actionable. Hide if target is a Killer teammate. */}
                            {myRole === 'Killer' && canKill && (() => {
                              try {
                                const killers = aliveRoleMembers?.Killer || [];
                                const targetIsKiller = killers.some((k) => k.id === id);
                                if (targetIsKiller) return null;
                              } catch (e) {}
                              return (
                                <button title="Kill" onClick={() => {
                                  socket.emit('killer_action', { roomId: roomCode, player: meRef.current, targetId: id });
                                  setKillerActed(true);
                                  setNotificationText(`You targeted ${name}`);
                                }}>🔪</button>
                              );
                            })()}
                      {/* Doctor action (bandage) - visible only to Doctors and when actionable */}
                      {myRole === 'Doctor' && canSave && (
                        <button title="Save" onClick={() => {
                          socket.emit('doctor_action', { roomId: roomCode, player: meRef.current, targetId: id });
                          setDoctorActed(true);
                          setNotificationText(`You chose to save ${name}`);
                        }}>🩹</button>
                      )}
                      {/* Detective action (magnifier) - visible only to Detectives and when actionable */}
                      {myRole === 'Detective' && canInvestigate && (
                        <button title="Investigate" onClick={() => {
                          socket.emit('detective_action', { roomId: roomCode, player: meRef.current, targetId: id });
                          setDetectiveUsed(true);
                          setNotificationText(`You investigated ${name}`);
                        }}>🔍</button>
                      )}
                      {/* Sus/vote button - visible during day/voting to everyone alive */}
                      {canSusVote && (
                        <button title="Sus / Vote" onClick={() => {
                          // locally track current vote and emit cast_vote
                          setCurrentVotes((s) => ({ ...s, [meRef.current.id]: id }));
                          socket.emit('cast_vote', { roomId: roomCode, player: meRef.current, targetId: id });
                          setNotificationText(`You voted for ${name}`);
                        }}>🤨</button>
                      )}
                      {/* per-row Skip/Abstain removed in favor of the shared control above */}
                    </div>
                  </li>
                );
              })}
            </ul>
            </div>
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

        {/* Shared Skip/Abstain button anchored to the bottom-right of the lobby card */}
        {activeTab === 'players' && (() => {
          const pid = meRef.current?.id;
          const amEliminated = eliminatedIds.includes(pid);
          const killerOnlyPhase = phase === 'killer';
          const doctorOnlyPhase = phase === 'doctor';
          const votingPhase = phase === 'day' || phase === 'voting';
          const killerCanSkip = myRole === 'Killer' && killerOnlyPhase && !killerActed && !amEliminated;
          const doctorCanSkip = myRole === 'Doctor' && doctorOnlyPhase && !doctorActed && !amEliminated;
          const canAbstain = votingPhase && !amEliminated;
          const visible = killerCanSkip || doctorCanSkip || canAbstain;
          const disabled = amEliminated || !(killerCanSkip || doctorCanSkip || canAbstain);

          if (!visible) return null;

          const handleSharedSkip = () => {
            if (disabled) return;
            if (killerCanSkip) {
              socket.emit('killer_action', { roomId: roomCode, player: meRef.current, skip: true });
              setKillerActed(true);
              setNotificationText('You skipped your kill');
              return;
            }
            if (doctorCanSkip) {
              socket.emit('doctor_action', { roomId: roomCode, player: meRef.current, skip: true });
              setDoctorActed(true);
              setNotificationText('You skipped your save');
              return;
            }
            if (canAbstain) {
              setCurrentVotes((s) => ({ ...s, [pid]: null }));
              socket.emit('cast_vote', { roomId: roomCode, player: meRef.current, targetId: null });
              setNotificationText('You abstained from voting');
            }
          };

          return (
            <div style={{position:'absolute', right:16, bottom:16}}>
              <button title="Skip / Abstain" disabled={disabled} onClick={handleSharedSkip} style={{padding:'8px 12px', borderRadius:12, background:'#f6d27a', border:'none', fontWeight:800, cursor:'pointer'}}>
                ⏭
              </button>
            </div>
          );
        })()}

        {activeTab === 'chat' && (
          // show chat input always for the chat tab; sending is enabled only when allowed
          <div className="chat-input-row chat-input-bottom">
            {/* Inline private toggle chips removed (we have separate private panel buttons) */}
            {/* disable chat input if player is eliminated */}
            <input
              id="game-chat-input"
              ref={inputRef}
              name="chatMessage"
              aria-label="Type a message"
              className="chat-input"
              placeholder="Type a message..."
              style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid #ccc', marginRight: '8px' }}
              disabled={eliminatedIds.includes(meRef.current.id)}
              onKeyDown={(e) => {
                // send on Enter (no Shift+Enter) when allowed; block sending during night phases
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  const nightPhases = ['killer', 'doctor', 'night_start', 'pre_night'];
                  const isNightPhase = phase && nightPhases.includes(phase);
                  if (isNightPhase) return; // client-side prevention
                  const text = inputRef.current?.value;
                  if (!text) return;
                  const me = meRef.current;
                  const uniqueId = `${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
                  const message = { id: uniqueId, from: { id: me.id, name: me.name }, text, ts: Date.now(), scope: 'public' };
                  // optimistic append so the message appears immediately
                  setMessages((prev) => [...prev, message]);
                  // main chat always sends public messages
                  const scope = 'public';
                  try { socket.emit('send_message', { roomId: roomCode, message: message, scope }); } catch (e) { console.error('emit failed', e); }
                  if (inputRef.current) inputRef.current.value = '';
                }
              }}
            />
            <button
              onClick={() => {
                const nightPhases = ['killer', 'doctor', 'night_start', 'pre_night'];
                const isNightPhase = phase && nightPhases.includes(phase);
                if (isNightPhase) return;
                const text = inputRef.current?.value;
                if (!text) return;
                const me = meRef.current;
                const uniqueId = `${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
                const message = { id: uniqueId, from: { id: me.id, name: me.name }, text, ts: Date.now(), scope: 'public' };
                // optimistic UI append
                setMessages((prev) => [...prev, message]);
                const scope = 'public';
                try { socket.emit('send_message', { roomId: roomCode, message: message, scope }); } catch (e) { console.error('emit failed', e); }
                if (inputRef.current) inputRef.current.value = '';
              }}
              className="chat-send-btn"
              style={{ padding: '10px 18px', borderRadius: '8px', background: '#f6d27a', color: '#2b1f12', fontWeight: 700, border: 'none', cursor: 'pointer' }}
              disabled={eliminatedIds.includes(meRef.current.id) || (phase && ['killer', 'doctor', 'night_start', 'pre_night'].includes(phase))}
            >
              Send
            </button>
          </div>
        )}
        {activeTab === 'chat' && (phase && ['killer', 'doctor', 'night_start', 'pre_night'].includes(phase)) && (
          <div style={{padding: '6px 12px', color: 'var(--muted)', fontStyle: 'italic'}}>Chat closed</div>
        )}
        {/* Action UI removed per request: players act through other controls/flows handled by server */}
      </main>

  <div className="external-actions">
        {/* Show team private chat buttons conditionally. Civilians only see Leave. */}
        {myRole === 'Killer' && ((aliveRoleMembers?.Killer && aliveRoleMembers.Killer.length > 1) || (localSettings.killCount || 0) > 1) && (
          <button className="lobby-action start" onClick={async () => { setPrivatePanel('killers'); try { const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/rooms/${roomCode}/messages?scope=killers`); const d = await res.json(); const msgs = (d.messages || []).map(m => ({ ...m, from: m.from || { id: m.sender_id, name: m.sender_name } })); setPrivateMessages(msgs); } catch(e){ setPrivateMessages([]);} setTimeout(() => panelInputRef.current?.focus(), 50); }}>
            Shadows
          </button>
        )}
        {myRole === 'Doctor' && ((aliveRoleMembers?.Doctor && aliveRoleMembers.Doctor.length > 1) || (localSettings.doctorCount || 0) > 1) && (
          <button className="lobby-action start" onClick={async () => { setPrivatePanel('doctors'); try { const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/rooms/${roomCode}/messages?scope=doctors`); const d = await res.json(); const msgs = (d.messages || []).map(m => ({ ...m, from: m.from || { id: m.sender_id, name: m.sender_name } })); setPrivateMessages(msgs); } catch(e){ setPrivateMessages([]);} setTimeout(() => panelInputRef.current?.focus(), 50); }}>
            Sanctuary
          </button>
        )}
        <button className="lobby-action close" onClick={onExit}>LEAVE THE ROOM</button>
      </div>
      {/* Private toast panel for team chat */}
      {privatePanel && (privatePanel === 'killers' || privatePanel === 'doctors') && (
        <div ref={modalRef} role="dialog" aria-modal="true" aria-label={privatePanel === 'killers' ? 'Shadows private chat' : 'Sanctuary private chat'} style={{position:'fixed', left:'50%', top:'50%', transform:'translate(-50%, -50%)', width:680, maxWidth:'96vw', height:480, maxHeight:'88vh', background:'var(--panel)', border:`1px solid rgba(255,75,75,0.12)`, borderRadius:14, boxShadow:'0 12px 40px rgba(0,0,0,0.5)', color:'var(--text)', zIndex:1200}} tabIndex={-1} onKeyDown={(e)=>{
          // trap Tab/Shift+Tab inside modal
          if (e.key === 'Tab') {
            const focusable = Array.from((e.currentTarget).querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')).filter((el) => !el.hasAttribute('disabled'));
            if (focusable.length === 0) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault();
              first.focus();
            } else if (e.shiftKey && document.activeElement === first) {
              e.preventDefault();
              last.focus();
            }
          }
          if (e.key === 'Escape') {
            setPrivatePanel(null);
          }
        }}>
          <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 16px', borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
            <div style={{fontWeight:900, fontSize:18}}>{privatePanel === 'killers' ? 'Shadows' : 'Sanctuary'}</div>
            <div style={{display:'flex', gap:8, alignItems:'center'}}>
              <div style={{color:'var(--muted)', fontSize:12}}>
                {(() => {
                  const roleKey = privatePanel === 'killers' ? 'Killer' : 'Doctor';
                  const list = (aliveRoleMembers?.[roleKey] || []);
                  if (list && list.length > 0) return list.map((p) => p.name).filter(Boolean).join(', ');
                  // fallback: attempt to infer teammate names from privateMessages history
                  const inferred = (privateMessages || []).map(m => (m.from && m.from.name) || m.sender_name).filter(Boolean);
                  if (inferred && inferred.length > 0) return Array.from(new Set(inferred)).join(', ');
                  return 'No teammates yet';
                })()}
              </div>
              <button onClick={() => setPrivatePanel(null)} style={{background:'transparent', border:'none', color:'#f6d27a', fontWeight:800, cursor:'pointer'}}>Close</button>
            </div>
          </div>
          <div style={{display:'flex', flexDirection:'column', gap:10, padding:12, height:'calc(100% - 92px)', boxSizing:'border-box', overflow:'hidden'}}>
            <div style={{flex:1, overflowY:'auto', paddingRight:8}}>
              {(privateMessages.length ? privateMessages : messages.filter(m => m.scope === (privatePanel === 'killers' ? 'killers' : 'doctors'))) .map((m, i) => (
                <div key={`pmsg-${i}-${m.id || m.ts}`} style={{marginBottom:10}}>
                  <div style={{fontSize:13, fontWeight:700, color:'var(--muted)'}}>{(m.from && m.from.name) || m.sender_name || 'Anon'}</div>
                  <div style={{fontSize:15, marginTop:4}}>{m.text}</div>
                </div>
              ))}
              {((messages.filter(m => m.scope === (privatePanel === 'killers' ? 'killers' : 'doctors')) || []).length === 0) && (
                <div style={{color:'var(--muted)'}}>No messages yet</div>
              )}
            </div>
            <div style={{display:'flex', gap:8, alignItems:'center'}}>
              <input id={`private-chat-${privatePanel || 'panel'}`} name={`privateChat_${privatePanel || 'panel'}`} ref={panelInputRef} placeholder={`Message ${privatePanel === 'killers' ? 'Shadows' : 'Sanctuary'}`} style={{flex:1, padding:'12px', borderRadius:10, border:'1px solid rgba(255,255,255,0.06)', background:'var(--bg)', color:'var(--text)'}} onKeyDown={async (e)=>{
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  const text = panelInputRef.current?.value;
                  if (!text) return;
                  await sendPrivate(text);
                  if (panelInputRef.current) panelInputRef.current.value = '';
                }
            }} />
              <button onClick={async () => {
                const text = panelInputRef.current?.value;
                if (!text) return;
                await sendPrivate(text);
                if (panelInputRef.current) panelInputRef.current.value = '';
              }} style={{padding:'10px 12px', borderRadius:10, background:'var(--accent)', border:'none', cursor:'pointer', fontWeight:800, color:'var(--text)'}} aria-label="Send">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M22 2L11 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M22 2L15 22L11 13L2 9L22 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Backdrop and focus trap for modal behavior */}
      {privatePanel && (
        <div onKeyDown={(e) => {
          // simple focus trap: close on Escape, allow Tab cycles by preventing focus leave
          if (e.key === 'Escape') setPrivatePanel(null);
        }} tabIndex={-1} style={{position:'fixed', left:0, top:0, right:0, bottom:0, background:'rgba(0,0,0,0.45)', zIndex:1190}} onClick={() => setPrivatePanel(null)} />
      )}
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
