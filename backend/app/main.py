from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

import sqlite3
import os
import time

# import python-socketio ASGI
import socketio
import asyncio


app = FastAPI()

# Allow CORS for frontend dev
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def read_root():
    return {"message": "Mafia backend is running!"}


# in-memory room player list
_rooms = {}
# room metadata (e.g., host id)
_room_meta = {}
# grace window before removing a disconnected player (seconds)
GRACE_SECONDS = 8


# --- Simple SQLite persistence for messages ---
DB_PATH = os.path.join(os.path.dirname(__file__), 'chat.db')


def get_db_conn():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_db_conn()
    cur = conn.cursor()
    cur.execute('''
    CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        room TEXT,
        sender_id TEXT,
        sender_name TEXT,
        text TEXT,
        ts INTEGER
    )
    ''')
    conn.commit()
    conn.close()


def save_message(room, message):
    conn = get_db_conn()
    cur = conn.cursor()
    cur.execute('INSERT OR REPLACE INTO messages (id, room, sender_id, sender_name, text, ts) VALUES (?, ?, ?, ?, ?, ?)', (
        str(message.get('id')), room, str(message.get('from', {}).get('id')), message.get('from', {}).get('name'), message.get('text'), int(message.get('ts') or time.time())
    ))
    conn.commit()
    conn.close()


def get_recent_messages(room, limit=50):
    conn = get_db_conn()
    cur = conn.cursor()
    cur.execute('SELECT id, room, sender_id, sender_name, text, ts FROM messages WHERE room = ? ORDER BY ts DESC LIMIT ?', (room, limit))
    rows = cur.fetchall()
    conn.close()
    # return newest-first reversed to chronological
    return [dict(r) for r in reversed(rows)]


init_db()


# ----------------- Socket.IO server -----------------
# Create an Async Socket.IO server and mount it on the FastAPI app via ASGI
# Enable socketio/engineio logging to surface handshake details in uvicorn logs
sio = socketio.AsyncServer(async_mode='asgi', cors_allowed_origins='*', logger=True, engineio_logger=True)
socket_app = socketio.ASGIApp(sio, other_asgi_app=app)


@sio.event
async def connect(sid, environ, auth):
    # Print helpful debug info for handshake troubleshooting
    print('Socket connect:', sid)
    try:
        # environ is the WSGI/ASGI environ - print common fields
        remote = environ.get('REMOTE_ADDR') or environ.get('REMOTE_HOST')
        origin = None
        # headers may be bytes tuples depending on server; attempt to extract
        headers = environ.get('headers') or environ.get('HTTP_HEADERS') or []
        # Try to find origin header
        for h in headers:
            try:
                # h might be a (b'name', b'value') tuple
                if isinstance(h, (list, tuple)) and len(h) >= 2:
                    name = h[0].decode() if isinstance(h[0], bytes) else str(h[0])
                    val = h[1].decode() if isinstance(h[1], bytes) else str(h[1])
                    if name.lower() == 'origin':
                        origin = val
            except Exception:
                continue
        print(f"  remote={remote} origin={origin}")
        # Print a small subset of headers for visibility
        head_preview = []
        for h in headers[:10]:
            try:
                k = h[0].decode() if isinstance(h[0], bytes) else str(h[0])
                v = h[1].decode() if isinstance(h[1], bytes) else str(h[1])
                head_preview.append(f"{k}: {v}")
            except Exception:
                continue
        if head_preview:
            print('  headers:', head_preview)
    except Exception as e:
        print('  connect debug error:', e)


@sio.event
async def disconnect(sid):
    print('Socket disconnect:', sid)
    # Attempt to remove the sid mapping and, if this was the player's last connection, remove them from the room
    removed = False
    try:
        session = await sio.get_session(sid)
    except Exception:
        session = None
    room = session.get('room') if session else None
    player = session.get('player') if session else None

    # Helper to finalize removal of a player from a room (actual deletion and emits)
    async def _finalize_removal(room, pid, player_obj):
        meta = _room_meta.setdefault(room, {})
        # double-check no active sids exist for this pid
        sids = meta.setdefault('player_sids', {})
        lst = sids.get(pid) or []
        if lst:
            # player reconnected, do nothing
            return False
        players = _rooms.get(room, [])
        _rooms[room] = [p for p in players if p.get('id') != pid]
        sids.pop(pid, None)
        # clean up any pending disconnect task entry
        pending = meta.get('pending_disconnects', {})
        pending.pop(pid, None)
        try:
            await sio.emit('player_left', {'player': player_obj}, room=room)
        except Exception:
            pass
        if meta.get('host_id') == pid:
            remaining = _rooms.get(room, [])
            meta['host_id'] = remaining[0].get('id') if remaining else None
        try:
            # include alive role member lists for client-facing convenience
            players = _rooms.get(room, [])
            assigned = meta.get('assigned_roles', {})
            eliminated = meta.get('eliminated', {}) or {}
            alive = [p for p in players if not eliminated.get(p.get('id'))]
            alive_role_members = {}
            for p in alive:
                r = assigned.get(p.get('id')) or 'Civilian'
                alive_role_members.setdefault(r, []).append({'id': p.get('id'), 'name': p.get('name')})
            role_counts = {k: len(v) for k, v in alive_role_members.items()}
            await sio.emit('room_state', {'players': players, 'host_id': meta.get('host_id'), 'eliminated': meta.get('eliminated', {}), 'alive_role_members': alive_role_members, 'role_counts': role_counts}, room=room)
        except Exception:
            pass
        return True

    if room and player:
        pid = player.get('id')
        try:
            # remove this sid from the player's sid list
            meta = _room_meta.setdefault(room, {})
            sids = meta.setdefault('player_sids', {})
            lst = sids.get(pid) or []
            if sid in lst:
                try:
                    lst.remove(sid)
                except ValueError:
                    pass
            meta['player_sids'][pid] = lst
            # if no more sids, schedule a delayed finalize to allow quick reconnects
            if not lst:
                pending = meta.setdefault('pending_disconnects', {})
                if pid not in pending:
                    async def _delayed():
                        try:
                            await asyncio.sleep(GRACE_SECONDS)
                            # re-check and finalize
                            await _finalize_removal(room, pid, player)
                        except asyncio.CancelledError:
                            # cancelled because player rejoined
                            return
                        except Exception:
                            return
                    task = asyncio.create_task(_delayed())
                    pending[pid] = task
                    print(f"Scheduled removal for player {pid} in room {room} in {GRACE_SECONDS}s")
        except Exception:
            removed = False

    # If not removed via session, search all rooms for the sid in player_sids lists
    if not removed:
        for r, meta in list(_room_meta.items()):
            try:
                sids = meta.get('player_sids', {})
                for pid, sid_list in list(sids.items()):
                    if sid in (sid_list or []):
                        # find player object from _rooms
                        players = _rooms.get(r, [])
                        player_obj = next((p for p in players if p.get('id') == pid), {'id': pid, 'name': None})
                        # remove this sid from the list
                        lst = sid_list or []
                        if sid in lst:
                            try:
                                lst.remove(sid)
                            except ValueError:
                                pass
                        meta['player_sids'][pid] = lst
                        # if empty, schedule delayed finalize if not already scheduled
                        if not lst:
                            pending = meta.setdefault('pending_disconnects', {})
                            if pid not in pending:
                                async def _delayed_r(rm, p, pobj):
                                    try:
                                        await asyncio.sleep(GRACE_SECONDS)
                                        await _finalize_removal(rm, p, pobj)
                                    except asyncio.CancelledError:
                                        return
                                    except Exception:
                                        return
                                task = asyncio.create_task(_delayed_r(r, pid, player_obj))
                                pending[pid] = task
                                print(f"Scheduled removal for player {pid} in room {r} in {GRACE_SECONDS}s")
                        break
                if removed:
                    break
            except Exception:
                continue

    try:
        # best-effort leave any rooms this sid may still be in
        sio.leave_room(sid, room or '')
    except Exception:
        pass


@sio.on('join_room')
async def handle_join(sid, data):
    room = data.get('roomId')
    player = data.get('player')
    if not room or not player:
        return
    meta = _room_meta.setdefault(room, {})
    # If a game is already in progress, reject new joins (per new rules)
    if meta.get('in_game'):
        try:
            await sio.emit('join_rejected', {'message': 'Game already in progress'}, room=sid)
        except Exception:
            pass
        return
    # add player to in-memory room list
    lst = _rooms.setdefault(room, [])
    # avoid duplicates
    if not any(p.get('id') == player.get('id') for p in lst):
        lst.append(player)
    # ensure room metadata exists
    meta = _room_meta.setdefault(room, {})
    # cancel any pending disconnect removal for this player (they reconnected)
    try:
        pid = player.get('id')
        pending = meta.get('pending_disconnects', {})
        if pid and pending and pid in pending:
            task = pending.pop(pid, None)
            if task:
                try:
                    task.cancel()
                except Exception:
                    pass
    except Exception:
        pass
    # map player id -> list of sids so we can support multiple tabs per player
    sids = meta.setdefault('player_sids', {})
    try:
        pid = player.get('id')
        if pid:
            lst = sids.setdefault(pid, [])
            if sid not in lst:
                lst.append(sid)
            sids[pid] = lst
    except Exception:
        pass
    # if no host assigned yet, the first player becomes host
    if not meta.get('host_id'):
        meta['host_id'] = player.get('id')
    await sio.save_session(sid, {'room': room, 'player': player})
    sio.enter_room(sid, room)
    # broadcast to room
    await sio.emit('player_joined', {'player': player}, room=room)
    # also emit a room_state update (players + host)
    # include alive role members in room_state updates
    try:
        players = _rooms.get(room, [])
        assigned = meta.get('assigned_roles', {})
        eliminated = meta.get('eliminated', {}) or {}
        alive = [p for p in players if not eliminated.get(p.get('id'))]
        alive_role_members = {}
        for p in alive:
            r = assigned.get(p.get('id')) or 'Civilian'
            alive_role_members.setdefault(r, []).append({'id': p.get('id'), 'name': p.get('name')})
        role_counts = {k: len(v) for k, v in alive_role_members.items()}
        await sio.emit('room_state', {'players': players, 'host_id': meta.get('host_id'), 'eliminated': meta.get('eliminated', {}), 'alive_role_members': alive_role_members, 'role_counts': role_counts}, room=room)
    except Exception:
        try:
            await sio.emit('room_state', {'players': _rooms.get(room, []), 'host_id': meta.get('host_id'), 'eliminated': meta.get('eliminated', {})}, room=room)
        except Exception:
            pass


@sio.on('time_sync')
async def handle_time_sync(sid, data):
    """Lightweight time sync: client may send its local timestamp; server replies with server time.
    Client should compute RTT and clock offset using the round-trip measurement.
    """
    try:
        now = int(time.time() * 1000)
        await sio.emit('time_sync_response', {'server_ts': now}, room=sid)
    except Exception:
        pass


@sio.on('leave_room')
async def handle_leave(sid, data):
    room = data.get('roomId')
    player = data.get('player')
    if room and player:
        lst = _rooms.get(room, [])
        _rooms[room] = [p for p in lst if p.get('id') != player.get('id')]
        sio.leave_room(sid, room)
        await sio.emit('player_left', {'player': player}, room=room)
        # update room metadata: if host left, promote next player (if any)
        meta = _room_meta.get(room, {})
        if meta.get('host_id') == player.get('id'):
            remaining = _rooms.get(room, [])
            meta['host_id'] = remaining[0].get('id') if remaining else None
            try:
                players = _rooms.get(room, [])
                assigned = meta.get('assigned_roles', {})
                eliminated = meta.get('eliminated', {}) or {}
                alive = [p for p in players if not eliminated.get(p.get('id'))]
                alive_role_members = {}
                for p in alive:
                    r = assigned.get(p.get('id')) or 'Civilian'
                    alive_role_members.setdefault(r, []).append({'id': p.get('id'), 'name': p.get('name')})
                role_counts = {k: len(v) for k, v in alive_role_members.items()}
                await sio.emit('room_state', {'players': players, 'host_id': meta.get('host_id'), 'eliminated': meta.get('eliminated', {}), 'alive_role_members': alive_role_members, 'role_counts': role_counts}, room=room)
            except Exception:
                await sio.emit('room_state', {'players': _rooms.get(room, []), 'host_id': meta.get('host_id')}, room=room)


@sio.on('send_message')
async def handle_message(sid, data):
    room = data.get('roomId')
    message = data.get('message')
    # Messages can include an optional `scope` field: 'public' (default), 'killers', 'doctors'
    scope = data.get('scope') or 'public'
    if not room or not message:
        return
    meta = _room_meta.get(room, {})
    phase = meta.get('phase')

    # block messaging from eliminated players
    try:
        sender_id = message.get('from', {}).get('id')
        if sender_id and meta.get('eliminated', {}).get(sender_id):
            try:
                await sio.emit('chat_blocked', {'message': 'You are dead and cannot send messages.'}, room=sid)
            except Exception:
                pass
            return
    except Exception:
        pass

    # Night restrictions: all chat (public and private) is closed during explicit night phases
    night_phases = ('night_start', 'killer', 'doctor', 'pre_night')
    if phase and phase in night_phases:
        # Only block public chat during explicit night phases; allow scoped team chat (killers/doctors)
        if scope == 'public':
            try:
                await sio.emit('chat_blocked', {'message': 'Public chat is closed during the night phase.'}, room=sid)
            except Exception:
                pass
            return

    # handle scoped/team messages separately: killers/doctors private rooms
    try:
        sender_id = message.get('from', {}).get('id')
    except Exception:
        sender_id = None

    if scope in ('killers', 'doctors'):
        # only allow players with the matching assigned role to send scoped messages
        assigned = meta.get('assigned_roles', {})
        required_role = 'Killer' if scope == 'killers' else 'Doctor'
        if not sender_id or assigned.get(sender_id) != required_role:
            try:
                await sio.emit('chat_blocked', {'message': 'You are not authorized to send to that team chat.'}, room=sid)
            except Exception:
                pass
            return
        # determine canonical private room name (persist there even if meta hasn't stored it yet)
        canonical_private = f"{room}__killers" if scope == 'killers' else f"{room}__doctors"
        # persist private message under the canonical private room namespace so it can be fetched later
        try:
            save_message(canonical_private, message)
        except Exception:
            pass
        # emit to the socket.io private room if server has registered it, else emit to the canonical room
        private_room = meta.get('killer_room') if scope == 'killers' else meta.get('doctor_room')
        emit_room = private_room or canonical_private
        try:
            await sio.emit('new_message', {'message': message}, room=emit_room)
        except Exception:
            pass
        return

    # Daytime or public messages: save and broadcast publicly
    try:
        save_message(room, message)
    except Exception:
        pass
    await sio.emit('new_message', {'message': message}, room=room)


def _assign_roles_to_players(players, settings, seed=None):
    import random
    rnd = random.Random(seed)
    total_players = len(players)
    roles = []
    # Add killers
    k = int(settings.get('killCount', 1)) if settings else 1
    roles += ['Killer'] * min(k, total_players)
    # Doctors
    d = int(settings.get('doctorCount', 0)) if settings else 0
    roles += ['Doctor'] * min(d, max(0, total_players - len(roles)))
    # Detectives
    det = int(settings.get('detectiveCount', 0)) if settings else 0
    roles += ['Detective'] * min(det, max(0, total_players - len(roles)))
    # Remaining civilians
    remaining = total_players - len(roles)
    roles += ['Civilian'] * max(0, remaining)
    rnd.shuffle(roles)
    assigned = []
    for p, r in zip(players, roles):
        np = dict(p)
        np['role'] = r
        assigned.append(np)
    return assigned


@sio.on('set_settings')
async def handle_set_settings(sid, data):
    room = data.get('roomId')
    settings = data.get('settings')
    if not room or not isinstance(settings, dict):
        return
    meta = _room_meta.setdefault(room, {})
    # ensure only the current host can change settings
    try:
        session = await sio.get_session(sid)
        player = session.get('player') if session else None
        pid = player.get('id') if player else None
        if pid and meta.get('host_id') and pid != meta.get('host_id'):
            # not host, ignore
            try:
                await sio.emit('settings_rejected', {'message': 'Only the host may change settings'}, room=sid)
            except Exception:
                pass
            return
    except Exception:
        pass
    # persist settings in room meta (will be used on game start)
    # enforce duration rules: default minimal durations (seconds)
    DEFAULTS = {'killerDuration': 120, 'doctorDuration': 120, 'votingDuration': 120}
    incoming = dict(settings)
    # normalize numeric counts and durations safely
    try:
        incoming = {
            'killCount': int(incoming.get('killCount', 1)),
            'doctorCount': int(incoming.get('doctorCount', 0)),
            'detectiveCount': int(incoming.get('detectiveCount', 0)),
            'killerDuration': int(incoming.get('killerDuration', DEFAULTS['killerDuration'])),
            'doctorDuration': int(incoming.get('doctorDuration', DEFAULTS['doctorDuration'])),
            'votingDuration': int(incoming.get('votingDuration', DEFAULTS['votingDuration'])),
        }
    except Exception:
        # fall back to sensible defaults on parse error
        incoming = {'killCount': 1, 'doctorCount': 1, 'detectiveCount': 0, 'killerDuration': DEFAULTS['killerDuration'], 'doctorDuration': DEFAULTS['doctorDuration'], 'votingDuration': DEFAULTS['votingDuration']}

    # If existing settings are present, do not allow decreasing durations below current set or default
    existing = meta.get('settings', {}) or {}
    MAX_DURATION = 300
    for key in ('killerDuration', 'doctorDuration', 'votingDuration'):
        min_allowed = max(DEFAULTS[key], int(existing.get(key, DEFAULTS[key])))
        # enforce minimum
        if incoming.get(key, DEFAULTS[key]) < min_allowed:
            incoming[key] = min_allowed
        # enforce maximum cap so timers can't be set above MAX_DURATION
        if incoming.get(key, DEFAULTS[key]) > MAX_DURATION:
            incoming[key] = MAX_DURATION

    meta['settings'] = incoming
    try:
        await sio.emit('settings_updated', {'settings': meta['settings']}, room=room)
    except Exception:
        pass


@sio.on('player_ready')
async def handle_player_ready(sid, data):
    """Mark a player as ready. When all current players are ready, assign roles and start the game."""
    room = data.get('roomId')
    player = data.get('player')
    if not room or not player:
        return
    meta = _room_meta.setdefault(room, {})
    ready = meta.setdefault('ready', {})
    pid = player.get('id')
    if not pid:
        return
    ready[pid] = True
    # broadcast ready state to room (list of ready player ids)
    await sio.emit('ready_state', {'ready': list(ready.keys())}, room=room)

    # Check if all current lobby players are ready
    players = _rooms.get(room, [])
    player_ids = [p.get('id') for p in players]
    all_ready = all((pid in ready and ready.get(pid)) for pid in player_ids) and len(player_ids) > 0
    if all_ready:
        # schedule a non-blocking start sequence: countdown, assign roles, deliver roles privately, then begin night/day orchestration
        async def start_sequence():
            meta = _room_meta.setdefault(room, {})
            # small countdown (3..1) emitted each second so clients can show it
            try:
                # Emit a single prestart event with start timestamp and duration so clients can sync the countdown
                prestart_duration = 3
                prestart_start = int(time.time() * 1000)
                await sio.emit('prestart', {'duration': prestart_duration, 'start_ts': prestart_start}, room=room)
            except Exception:
                pass

            # assign roles according to host settings stored in meta
            settings = meta.get('settings', {}) or {}
            # normalize numeric settings to ints (safeguard against string inputs)
            try:
                settings = {
                    'killCount': int(settings.get('killCount', 1)),
                    'doctorCount': int(settings.get('doctorCount', 1)),
                    'detectiveCount': int(settings.get('detectiveCount', 0)),
                    'killerDuration': int(settings.get('killerDuration', 120)),
                    'doctorDuration': int(settings.get('doctorDuration', 120)),
                    'votingDuration': int(settings.get('votingDuration', 120)),
                }
            except Exception:
                settings = {'killCount': 1, 'doctorCount': 0, 'detectiveCount': 0}
            assigned = _assign_roles_to_players(players, settings)
            # store assigned roles in meta and mark in-game
            # reset eliminated mapping so previous game's deaths do not persist
            meta['assigned_roles'] = {p.get('id'): p.get('role') for p in assigned}
            meta['in_game'] = True
            meta['phase'] = 'pre_night'
            meta['eliminated'] = {}

            # prepare private rooms for killers and doctors
            killer_room = f"{room}__killers"
            doctor_room = f"{room}__doctors"
            meta['killer_room'] = killer_room
            meta['doctor_room'] = doctor_room

            # send private role and instructions to each player using stored sids
            sids = meta.get('player_sids', {})
            role_descriptions = {
                'Killer': 'Secretly selects one player to eliminate each night. Killers know each other and coordinate in private chat.',
                'Doctor': 'Each night chooses one player to protect from being eliminated. If you save the targeted player, they survive the night.',
                'Detective': 'Can investigate one player to learn if they are a Killer. Use this information wisely and avoid revealing too early.',
                'Civilian': 'No special powers. Participate in discussion and voting to identify Killers.'
            }
            for p in assigned:
                pid = p.get('id')
                psids = sids.get(pid) or []
                for psid in psids:
                    try:
                        # send role and description privately to all active tabs for this player
                        await sio.emit('your_role', {'role': p.get('role'), 'description': role_descriptions.get(p.get('role'))}, room=psid)
                        # server-side: place each active socket into private rooms so server can emit to them
                        if p.get('role') == 'Killer':
                            try:
                                sio.enter_room(psid, killer_room)
                            except Exception:
                                pass
                        if p.get('role') == 'Doctor':
                            try:
                                sio.enter_room(psid, doctor_room)
                            except Exception:
                                pass
                    except Exception as e:
                        print(f"[player_ready] error sending role to {pid}: {e}")

            # broadcast roles assigned (public roster only)
            public_players = [{'id': p.get('id'), 'name': p.get('name')} for p in assigned]
            # include the normalized settings the host applied so clients can display them
            # also emit a room_state update that contains alive_role_members so clients have teammate lists
            try:
                players_now = _rooms.get(room, [])
                assigned_map = meta.get('assigned_roles', {})
                eliminated = meta.get('eliminated', {}) or {}
                alive = [p for p in players_now if not eliminated.get(p.get('id'))]
                alive_role_members = {}
                for p in alive:
                    r = assigned_map.get(p.get('id')) or 'Civilian'
                    alive_role_members.setdefault(r, []).append({'id': p.get('id'), 'name': p.get('name')})
                role_counts = {k: len(v) for k, v in alive_role_members.items()}
                await sio.emit('room_state', {'players': public_players, 'host_id': meta.get('host_id'), 'eliminated': meta.get('eliminated', {}), 'alive_role_members': alive_role_members, 'role_counts': role_counts}, room=room)
            except Exception:
                await sio.emit('roles_assigned', {'players': public_players, 'role_descriptions': role_descriptions, 'settings': settings}, room=room)
            try:
                await sio.emit('roles_assigned', {'players': public_players, 'role_descriptions': role_descriptions, 'settings': settings}, room=room)
            except Exception:
                pass

            # short pause to allow client to show role card, then start night
            await asyncio.sleep(3)
            # start night
            await _start_night_sequence(room)

        # schedule the start sequence without blocking the event loop
        asyncio.create_task(start_sequence())


async def _start_night_sequence(room: str):
    """Orchestrate night phases: announce night, run killer phase, run doctor phase, resolve night, then start day and voting."""
    meta = _room_meta.setdefault(room, {})
    meta['phase'] = 'night_start'
    start_ts = int(time.time() * 1000)
    # announce night and give players a little longer to close eyes per game flow
    await sio.emit('phase', {'phase': 'night_start', 'message': "Night time - Everyone close your eyes", 'duration': 5, 'start_ts': start_ts}, room=room)
    # wait 5s then start killer phase
    await asyncio.sleep(5)
    # use configured duration if present
    meta = _room_meta.setdefault(room, {})
    settings = meta.get('settings', {}) or {}
    killer_dur = int(settings.get('killerDuration', 120))
    await _start_killer_phase(room, duration=killer_dur)


async def _start_killer_phase(room: str, duration: int = 120):
    meta = _room_meta.setdefault(room, {})
    meta['phase'] = 'killer'
    # reset per-round actions tracker
    meta['actions'] = meta.get('actions', {})
    meta['actions']['killer'] = {}
    meta['night_kill'] = None
    # clear any previous doctor save or doctor actions so stale data doesn't carry between rounds
    meta['doctor_save'] = None
    try:
        meta['actions']['doctor'] = {}
    except Exception:
        meta.setdefault('actions', {})['doctor'] = {}
    # notify everyone that killer phase has started (public notification + timer)
    start_ts = int(time.time() * 1000)
    await sio.emit('phase', {'phase': 'killer', 'message': 'Night has fallen — Killers, choose your target', 'duration': duration, 'start_ts': start_ts}, room=room)
    # also notify killer private room so killers get private chat context
    if meta.get('killer_room'):
        await sio.emit('phase', {'phase': 'killer', 'message': 'Killer, open your eyes and choose a target', 'duration': duration, 'start_ts': start_ts}, room=meta.get('killer_room'))

    async def killer_timer():
        try:
            print(f"[killer_timer] Starting timer for room {room}, duration {duration}s")
            await asyncio.sleep(duration)
            print(f"[killer_timer] Timer expired for room {room}, proceeding to doctor phase")
        except asyncio.CancelledError:
            print(f"[killer_timer] Timer cancelled for room {room}")
            return
        # timer expired, proceed to doctor phase (or skip doctor if none alive)
        await _start_doctor_phase(room)

    task = asyncio.create_task(killer_timer())
    meta['killer_task'] = task


@sio.on('killer_action')
async def handle_killer_action(sid, data):
    room = data.get('roomId')
    player = data.get('player')
    # targetId may be omitted or null to indicate an explicit skip; or client may send { skip: true }
    target_id = data.get('targetId') if 'targetId' in data else None
    skip = bool(data.get('skip')) or (('targetId' in data) and data.get('targetId') is None)
    if not room or not player:
        return
    meta = _room_meta.setdefault(room, {})
    # only accept during killer phase
    if meta.get('phase') != 'killer':
        return
    # identify actor and block eliminated players from acting
    pid = player.get('id')
    if meta.get('eliminated', {}).get(pid):
        try:
            await sio.emit('action_blocked', {'message': 'You are eliminated and cannot act.'}, room=sid)
        except Exception:
            pass
        return
    # ensure per-round actions tracker exists
    actions = meta.setdefault('actions', {})
    killer_actions = actions.setdefault('killer', {})
    # if this killer (or any killer in the room) already acted this round, block further actions
    if killer_actions:
        try:
            await sio.emit('action_blocked', {'message': 'A kill has already been recorded this round.'}, room=sid)
        except Exception:
            pass
        return
    pid = player.get('id')
    assigned = meta.get('assigned_roles', {})
    if assigned.get(pid) != 'Killer':
        return
    # record the chosen kill (and actor) and cancel killer timer for early move to doctor
    if skip:
        meta['night_kill'] = {'target': None, 'by': pid, 'skipped': True}
        killer_actions[pid] = None
    else:
        # Prevent killers from targeting other killers
        assigned = meta.get('assigned_roles', {})
        if target_id and assigned.get(target_id) == 'Killer':
            try:
                await sio.emit('action_blocked', {'message': 'Killers cannot target other Killers.'}, room=sid)
            except Exception:
                pass
            return
        meta['night_kill'] = {'target': target_id, 'by': pid}
        killer_actions[pid] = target_id
    try:
        await sio.emit('action_accepted', {'action': 'killer', 'targetId': target_id}, room=sid)
    except Exception:
        pass
    task = meta.pop('killer_task', None)
    if task and not task.done():
        task.cancel()
    # after a killer action, if there are no alive doctors, skip doctor phase
    print(f"[killer_action] Checking for alive doctors in room {room}")
    players = _rooms.get(room, [])
    assigned = meta.get('assigned_roles', {})
    alive_players = [p for p in players if not meta.get('eliminated', {}).get(p.get('id'))]
    # count alive doctors
    alive_doctors = sum(1 for p in alive_players if assigned.get(p.get('id')) == 'Doctor')
    print(f"[killer_action] Found {alive_doctors} alive doctors")
    if alive_doctors <= 0:
        print(f"[killer_action] No doctors, skipping to resolve_night")
        # directly resolve night (doctor phase skipped)
        await _resolve_night_and_start_day(room)
    else:
        print(f"[killer_action] Starting doctor phase")
        settings = meta.get('settings', {}) or {}
        doctor_dur = int(settings.get('doctorDuration', 120))
        await _start_doctor_phase(room, duration=doctor_dur)


async def _start_doctor_phase(room: str, duration: int = 120):
    meta = _room_meta.setdefault(room, {})
    meta['phase'] = 'doctor'
    meta['doctor_save'] = None
    # notify everyone that doctor phase has started (public notification + timer)
    start_ts = int(time.time() * 1000)
    await sio.emit('phase', {'phase': 'doctor', 'message': 'Doctor: choose someone to save', 'duration': duration, 'start_ts': start_ts}, room=room)
    # also notify doctor private room so doctors get private chat context
    if meta.get('doctor_room'):
        await sio.emit('phase', {'phase': 'doctor', 'message': 'Doctor, choose someone to save', 'duration': duration, 'start_ts': start_ts}, room=meta.get('doctor_room'))

    async def doctor_timer():
        try:
            print(f"[doctor_timer] Starting timer for room {room}, duration {duration}s")
            await asyncio.sleep(duration)
            print(f"[doctor_timer] Timer expired for room {room}, scheduling resolve_night task")
        except asyncio.CancelledError:
            print(f"[doctor_timer] Timer cancelled for room {room}")
            return
        # timer expired, schedule resolve night as a separate task
        asyncio.create_task(_resolve_night_and_start_day(room))

    task = asyncio.create_task(doctor_timer())
    meta['doctor_task'] = task
    # reset doctor actions container for new round
    meta['actions']['doctor'] = {}


@sio.on('doctor_action')
async def handle_doctor_action(sid, data):
    room = data.get('roomId')
    player = data.get('player')
    target_id = data.get('targetId') if 'targetId' in data else None
    skip = bool(data.get('skip')) or (('targetId' in data) and data.get('targetId') is None)
    if not room or not player:
        return
    meta = _room_meta.setdefault(room, {})
    if meta.get('phase') != 'doctor':
        return
    pid = player.get('id')
    assigned = meta.get('assigned_roles', {})
    if assigned.get(pid) != 'Doctor':
        return
    # block eliminated doctors from acting
    if meta.get('eliminated', {}).get(pid):
        try:
            await sio.emit('action_blocked', {'message': 'You are eliminated and cannot act.'}, room=sid)
        except Exception:
            pass
        return
    # per-round action enforcement
    actions = meta.setdefault('actions', {})
    doctor_actions = actions.setdefault('doctor', {})
    if doctor_actions.get(pid):
        try:
            await sio.emit('action_blocked', {'message': 'You have already acted this round.'}, room=sid)
        except Exception:
            pass
        return
    # record doctor save target and which doctor performed the save (support skip)
    if skip:
        meta['doctor_save'] = {'target': None, 'by': pid, 'skipped': True}
        doctor_actions[pid] = None
    else:
        meta['doctor_save'] = {'target': target_id, 'by': pid}
        doctor_actions[pid] = target_id
    try:
        await sio.emit('action_accepted', {'action': 'doctor', 'targetId': target_id}, room=sid)
    except Exception:
        pass
    task = meta.pop('doctor_task', None)
    if task and not task.done():
        task.cancel()
    await _resolve_night_and_start_day(room)


@sio.on('detective_action')
async def handle_detective_action(sid, data):
    room = data.get('roomId')
    player = data.get('player')
    target_id = data.get('targetId')
    if not room or not player or not target_id:
        return
    meta = _room_meta.setdefault(room, {})
    # only accept during detective phase (we'll treat detective action during night while phase in 'killer' or 'doctor')
    # allow detective to act anytime during night phases
    if meta.get('phase') not in ('killer', 'doctor', 'night_start', 'pre_night'):
        return
    pid = player.get('id')
    assigned = meta.get('assigned_roles', {})
    if assigned.get(pid) != 'Detective':
        return
    # block eliminated detective from acting
    if meta.get('eliminated', {}).get(pid):
        try:
            await sio.emit('action_blocked', {'message': 'You are eliminated and cannot act.'}, room=sid)
        except Exception:
            pass
        return
    # per-round / one-time enforcement for detective
    actions = meta.setdefault('actions', {})
    detective_actions = actions.setdefault('detective', {})
    # If detective already used their ability (treat as one-time), block
    if detective_actions.get(pid):
        try:
            await sio.emit('action_blocked', {'message': 'Detective ability already used.'}, room=sid)
        except Exception:
            pass
        return
    # Determine if target is a killer
    role = assigned.get(target_id)
    is_killer = (role == 'Killer')
    # record detective use
    meta['detective_check'] = {'target': target_id, 'by': pid}
    detective_actions[pid] = target_id
    # send result privately to detective
    sids = meta.get('player_sids', {})
    psid = sids.get(pid)
    try:
        await sio.emit('detective_result', {'targetId': target_id, 'is_killer': is_killer, 'role': role}, room=psid)
        await sio.emit('action_accepted', {'action': 'detective', 'targetId': target_id}, room=sid)
    except Exception:
        pass


async def _resolve_night_and_start_day(room: str):
    print(f"[resolve_night] *** FUNCTION START *** for room {room}")
    meta = _room_meta.setdefault(room, {})
    killed = meta.get('night_kill')
    saved = meta.get('doctor_save')
    print(f"[resolve_night] killed={killed}, saved={saved}")
    killed_player = None
    saved_player = None
    saved_by = None

    # find player objects
    players = _rooms.get(room, [])
    id_to_player = {p.get('id'): p for p in players}
    if killed:
        # killed may be a dict with target/by or just an id (legacy)
        ktarget = killed.get('target') if isinstance(killed, dict) else killed
        killed_player = id_to_player.get(ktarget)
    if saved:
        starget = saved.get('target') if isinstance(saved, dict) else saved
        saved_player = id_to_player.get(starget)
        sb = saved.get('by') if isinstance(saved, dict) else None
        if sb:
            saved_by = id_to_player.get(sb)

    # Validate that the doctor save was performed by an alive Doctor. If the saving doctor is no longer alive
    # or no longer has the Doctor role, ignore the save to avoid stale saves from prior rounds.
    saved_valid = False
    try:
        if saved and isinstance(saved, dict):
            sb_id = saved.get('by')
            if sb_id:
                # assigned roles mapping indicates each player's role
                assigned_roles = meta.get('assigned_roles', {})
                # doctor must still be alive (not in eliminated) and still assigned as 'Doctor'
                if assigned_roles.get(sb_id) == 'Doctor' and not meta.get('eliminated', {}).get(sb_id):
                    saved_valid = True
    except Exception:
        saved_valid = False

    # determine outcome by comparing targeted ids
    outcome = {'result': 'none', 'player': None}
    ktarget = killed.get('target') if isinstance(killed, dict) else killed
    starget = saved.get('target') if isinstance(saved, dict) else saved
    if ktarget and starget and ktarget == starget and saved_valid:
        # doctor saved the victim (only if the save came from a live doctor)
        outcome['result'] = 'saved'
        outcome['player'] = saved_player
    elif ktarget:
        outcome['result'] = 'killed'
        outcome['player'] = killed_player

    # broadcast night resolution to all players
    if outcome['result'] == 'killed' and outcome['player']:
        await sio.emit('night_result', {'result': 'killed', 'player': {'id': outcome['player'].get('id'), 'name': outcome['player'].get('name'), 'role': meta.get('assigned_roles', {}).get(outcome['player'].get('id'))}}, room=room)
        # mark eliminated (keep player in the players list so UIs can show them as dead)
        meta.setdefault('eliminated', {})[outcome['player'].get('id')] = True
    elif outcome['result'] == 'saved' and outcome['player']:
        payload = {'result': 'saved', 'player': {'id': outcome['player'].get('id'), 'name': outcome['player'].get('name')}}
        if saved_by:
            payload['saved_by'] = {'id': saved_by.get('id'), 'name': saved_by.get('name')}
        await sio.emit('night_result', payload, room=room)
    else:
        await sio.emit('night_result', {'result': 'none'}, room=room)

    # cleanup private rooms tasks
    try:
        kt = meta.pop('killer_task', None)
        if kt and not kt.done():
            kt.cancel()
    except Exception:
        pass
    try:
        dt = meta.pop('doctor_task', None)
        if dt and not dt.done():
            dt.cancel()
    except Exception:
        pass

    # Begin day: signal players to open eyes, give a short window before showing night summary
    start_ts = int(time.time() * 1000)
    meta['phase'] = 'day_start'
    await sio.emit('phase', {'phase': 'day_start', 'message': 'Day time - Open your eyes', 'duration': 5, 'start_ts': start_ts}, room=room)
    print(f"[resolve_night] Day start phase emitted, sleeping for 5s...")
    # small pause for clients to show day transition
    try:
        await asyncio.sleep(5)
        print(f"[resolve_night] Day start sleep completed, preparing night summary...")
    except asyncio.CancelledError:
        print(f"[resolve_night] TASK CANCELLED during sleep, but continuing anyway...")
    except Exception as e:
        print(f"[resolve_night] ERROR during sleep: {e}")
        print(f"[resolve_night] Continuing despite error...")

    # Always show night summary first so players know what happened during the night
    # send a concise night summary that clients can display for 5s
    summary = {}
    if outcome['result'] == 'killed' and outcome['player']:
        summary['message'] = f"{outcome['player'].get('name')} was killed last night"
        summary['killed'] = {'id': outcome['player'].get('id'), 'name': outcome['player'].get('name'), 'role': meta.get('assigned_roles', {}).get(outcome['player'].get('id'))}
        summary['doctor_saved'] = False
    elif outcome['result'] == 'saved' and outcome['player']:
        summary['message'] = f"Doctor saved {outcome['player'].get('name')} last night"
        summary['saved'] = {'id': outcome['player'].get('id'), 'name': outcome['player'].get('name')}
        if saved_by:
            summary['saved_by'] = {'id': saved_by.get('id'), 'name': saved_by.get('name')}
        summary['doctor_saved'] = True
    else:
        summary['message'] = 'No one died last night'
        summary['doctor_saved'] = False

    # allow public chat again; send updated room state and players list before summary (include alive_role_members)
    try:
        players_now = _rooms.get(room, [])
        assigned_map = meta.get('assigned_roles', {})
        eliminated = meta.get('eliminated', {}) or {}
        alive = [p for p in players_now if not eliminated.get(p.get('id'))]
        alive_role_members = {}
        for p in alive:
            r = assigned_map.get(p.get('id')) or 'Civilian'
            alive_role_members.setdefault(r, []).append({'id': p.get('id'), 'name': p.get('name')})
        role_counts = {k: len(v) for k, v in alive_role_members.items()}
        await sio.emit('room_state', {'players': players_now, 'host_id': meta.get('host_id'), 'eliminated': meta.get('eliminated', {}), 'alive_role_members': alive_role_members, 'role_counts': role_counts}, room=room)
    except Exception:
        await sio.emit('room_state', {'players': _rooms.get(room, []), 'host_id': meta.get('host_id'), 'eliminated': meta.get('eliminated', {})}, room=room)
    print(f"[resolve_night] About to emit night_summary: {summary}")
    await sio.emit('night_summary', summary, room=room)
    print(f"[resolve_night] Night summary emitted, sleeping for 5s...")
    # give players time to read the summary
    try:
        await asyncio.sleep(5)
        print(f"[resolve_night] Night summary sleep completed")
    except asyncio.CancelledError:
        print(f"[resolve_night] TASK CANCELLED during night summary sleep, but continuing...")
    except Exception as e:
        print(f"[resolve_night] ERROR during night summary sleep: {e}")
        print(f"[resolve_night] Continuing despite error...")

    # Now check win conditions AFTER players have seen what happened at night
    try:
        print(f"[resolve_night] Night summary displayed, now checking win conditions...")
        await _check_win_conditions(room)
        print(f"[resolve_night] Win conditions checked, in_game={meta.get('in_game')}")
        if not meta.get('in_game'):
            # Game ended as a result of win condition; don't proceed to voting
            print(f"[resolve_night] Game ended after night summary, returning")
            return

        # If no win condition met, start the voting phase (120s default)
        print(f"[resolve_night] No win condition met, starting voting phase...")
        settings = meta.get('settings', {}) or {}
        voting_dur = int(settings.get('votingDuration', 120))
        await _start_voting_phase(room, duration=voting_dur)
        print(f"[resolve_night] *** FUNCTION END *** voting phase started")
    except Exception as e:
        print(f"[resolve_night] CRITICAL ERROR in win condition check or voting start: {e}")
        import traceback
        traceback.print_exc()


async def _start_voting_phase(room: str, duration: int = 120):
    meta = _room_meta.setdefault(room, {})
    meta['phase'] = 'voting'
    meta['votes'] = {}
    # reset per-round vote actions tracker
    actions = meta.setdefault('actions', {})
    actions['votes'] = {}
    start_ts = int(time.time() * 1000)
    await sio.emit('phase', {'phase': 'voting', 'message': 'Cast your vote: who do you think is a killer?', 'duration': duration, 'start_ts': start_ts}, room=room)

    async def voting_timer():
        try:
            await asyncio.sleep(duration)
        except asyncio.CancelledError:
            return
        await _resolve_votes(room)

    task = asyncio.create_task(voting_timer())
    meta['voting_task'] = task


@sio.on('cast_vote')
async def handle_cast_vote(sid, data):
    room = data.get('roomId')
    voter = data.get('player')
    # allow null/omitted to indicate abstain/skip
    target = data.get('targetId') if 'targetId' in data else None
    if not room or not voter:
        return
    meta = _room_meta.setdefault(room, {})
    if meta.get('phase') != 'voting':
        return
    vid = voter.get('id')
    # block eliminated players from voting
    if meta.get('eliminated', {}).get(vid):
        try:
            await sio.emit('action_blocked', {'message': 'You are eliminated and cannot vote.'}, room=sid)
        except Exception:
            pass
        return
    # record the vote in both the canonical votes mapping and the per-round actions tracker
    # Prevent killers from voting for other killers
    assigned = meta.get('assigned_roles', {})
    if target is not None and assigned.get(vid) == 'Killer' and assigned.get(target) == 'Killer':
        try:
            await sio.emit('action_blocked', {'message': 'Killers cannot vote for other Killers.'}, room=sid)
        except Exception:
            pass
        return

    prev = meta.setdefault('votes', {}).get(vid)
    meta.setdefault('votes', {})[vid] = target
    actions = meta.setdefault('actions', {})
    vote_actions = actions.setdefault('votes', {})
    vote_actions[vid] = target
    try:
        await sio.emit('vote_cast', {'by': vid, 'targetId': target, 'previous': prev}, room=room)
        await sio.emit('action_accepted', {'action': 'vote', 'targetId': target, 'previous': prev}, room=sid)
    except Exception:
        pass
    # optional early resolution: if all alive players have voted, resolve early
    # determine alive (non-eliminated) players
    all_players = _rooms.get(room, [])
    alive_players = [p for p in all_players if not meta.get('eliminated', {}).get(p.get('id'))]
    alive_ids = [p.get('id') for p in alive_players]
    if all((a in meta.get('votes', {})) for a in alive_ids):
        task = meta.pop('voting_task', None)
        if task and not task.done():
            task.cancel()
        await _resolve_votes(room)


async def _resolve_votes(room: str):
    meta = _room_meta.setdefault(room, {})
    votes = meta.get('votes', {})
    
    # count actual votes and skips
    counts = {}
    skip_count = 0
    total_votes = 0
    
    for v in votes.values():
        total_votes += 1
        if v is None:
            # count skips/abstains
            skip_count += 1
        else:
            # count actual votes
            counts[v] = counts.get(v, 0) + 1
    
    # calculate total actual votes cast (not skips)
    actual_vote_count = total_votes - skip_count
    
    print(f"[resolve_votes] Room {room}: {actual_vote_count} actual votes, {skip_count} skips, {total_votes} total")
    print(f"[resolve_votes] Vote counts: {counts}")
    
    # If no actual votes were cast, no elimination
    if not counts:
        await sio.emit('vote_result', {'result': 'no_votes', 'skip_count': skip_count}, room=room)
        meta['phase'] = 'post_vote'
        # schedule next night if game still active (no elimination occurred)
        await _check_win_conditions(room)
        if meta.get('in_game'):
            async def _next_night_no_votes():
                await asyncio.sleep(3)
                m = _room_meta.setdefault(room, {})
                if m.get('in_game') and m.get('phase') != 'ended':
                    await _start_night_sequence(room)
            asyncio.create_task(_next_night_no_votes())
        return
    
    # find max votes for any single player
    max_votes = max(counts.values())
    top = [pid for pid, c in counts.items() if c == max_votes]
    
    # IMPORTANT: Check if skips outnumber or equal the highest vote count
    # If skips >= max_votes, then no elimination should occur
    eliminated = None
    if skip_count >= max_votes:
        print(f"[resolve_votes] Skips ({skip_count}) >= max votes ({max_votes}), no elimination")
        eliminated = None
    elif len(top) == 1:
        eliminated = top[0]
        print(f"[resolve_votes] Clear winner: {eliminated} with {max_votes} votes")
    else:
        # tie between multiple players: no elimination 
        print(f"[resolve_votes] Tie between {len(top)} players with {max_votes} votes each, no elimination")
        eliminated = None

    if eliminated:
        # find player object
        players = _rooms.get(room, [])
        eliminated_player = next((p for p in players if p.get('id') == eliminated), None)
        if eliminated_player:
            role = meta.get('assigned_roles', {}).get(eliminated)
            # mark eliminated (do not remove from players list so UIs can show skull)
            meta.setdefault('eliminated', {})[eliminated] = True
            await sio.emit('vote_result', {
                'result': 'eliminated', 
                'player': {'id': eliminated_player.get('id'), 'name': eliminated_player.get('name'), 'role': role},
                'vote_count': max_votes,
                'skip_count': skip_count,
                'counts': counts
            }, room=room)
            meta['phase'] = 'post_vote'
            # after elimination, you may want to check win conditions (not implemented)
            # check win conditions after elimination
            await _check_win_conditions(room)
            # if game still running, schedule next night cycle
            if meta.get('in_game'):
                async def _next_night():
                    await asyncio.sleep(3)
                    # re-check in case game ended in the meantime
                    m = _room_meta.setdefault(room, {})
                    if m.get('in_game') and m.get('phase') != 'ended':
                        await _start_night_sequence(room)
                asyncio.create_task(_next_night())
            return
    # no elimination
    reason = 'tie' if len(top) > 1 else 'skips_majority' if skip_count >= max_votes else 'unknown'
    await sio.emit('vote_result', {
        'result': 'no_elimination', 
        'reason': reason,
        'top': top, 
        'counts': counts, 
        'skip_count': skip_count,
        'max_votes': max_votes
    }, room=room)
    meta['phase'] = 'post_vote'
    # check win conditions and continue the game if nobody has won
    await _check_win_conditions(room)
    if meta.get('in_game'):
        async def _next_night_noelim():
            await asyncio.sleep(3)
            m = _room_meta.setdefault(room, {})
            if m.get('in_game') and m.get('phase') != 'ended':
                await _start_night_sequence(room)
        asyncio.create_task(_next_night_noelim())


async def _check_win_conditions(room: str):
    """Simple win checks: if all killers are dead -> Civilians win; if killers >= civilians -> Killers win."""
    print(f"[check_win_conditions] *** FUNCTION START *** for room {room}")
    meta = _room_meta.setdefault(room, {})
    # consider only non-eliminated players as alive
    all_players = _rooms.get(room, [])
    players = [p for p in all_players if not meta.get('eliminated', {}).get(p.get('id'))]
    assigned = meta.get('assigned_roles', {})
    # count alive roles
    alive_roles = {'Killer': 0, 'Civilian': 0, 'Doctor': 0, 'Detective': 0}
    for p in players:
        rid = p.get('id')
        r = assigned.get(rid) or 'Civilian'
        if r in alive_roles:
            alive_roles[r] += 1
        else:
            alive_roles['Civilian'] += 1

    killers = alive_roles.get('Killer', 0)
    others = alive_roles.get('Civilian', 0) + alive_roles.get('Doctor', 0) + alive_roles.get('Detective', 0)

    print(f"[check_win_conditions] killers={killers}, others={others}, alive_roles={alive_roles}")
    
    # Win conditions:
    # - If no killers remain -> Civilians win
    # - If killers >= others -> Killers win
    if killers == 0:
        await sio.emit('game_over', {'winner': 'Civilians'}, room=room)
        meta['phase'] = 'ended'
        # clear in-game flag and any ready marks so lobby must re-ready to start again
        meta['in_game'] = False
        try:
            meta['ready'] = {}
        except Exception:
            meta['ready'] = {}
        # schedule a reset after 10s so clients can display final message, then the room is cleared
        async def _delayed_reset_civ():
            try:
                await asyncio.sleep(10)
                await _reset_room(room)
            except Exception:
                return
        asyncio.create_task(_delayed_reset_civ())
        return

    if killers >= others:
        print(f"[check_win_conditions] Killers win condition triggered: {killers} >= {others}")
        # killers win - include alive killer names so clients can announce them
        all_players = _rooms.get(room, [])
        assigned = meta.get('assigned_roles', {})
        alive_killers = [p for p in all_players if not meta.get('eliminated', {}).get(p.get('id')) and assigned.get(p.get('id')) == 'Killer']
        killer_list = [{'id': p.get('id'), 'name': p.get('name')} for p in alive_killers]
        print(f"[check_win_conditions] Emitting game_over: Killers win, killer_list={killer_list}")
        await sio.emit('game_over', {'winner': 'Killers', 'killers': killer_list}, room=room)
        meta['phase'] = 'ended'
        # clear in-game flag and any ready marks so lobby must re-ready to start again
        meta['in_game'] = False
        try:
            meta['ready'] = {}
        except Exception:
            meta['ready'] = {}
        async def _delayed_reset_k():
            try:
                await asyncio.sleep(10)
                await _reset_room(room)
            except Exception:
                return
        asyncio.create_task(_delayed_reset_k())
        return


async def _reset_room(room: str):
    """Reset room metadata and delete room messages so clients see a fresh lobby with the same room code."""
    try:
        meta = _room_meta.setdefault(room, {})
        meta['in_game'] = False
        meta['phase'] = None
        meta['assigned_roles'] = {}
        meta['eliminated'] = {}
        meta['ready'] = {}
        meta['actions'] = {}
        meta['votes'] = {}
        meta.pop('killer_room', None)
        meta.pop('doctor_room', None)
        # clear messages from sqlite for this room and its private rooms
        try:
            conn = get_db_conn()
            cur = conn.cursor()
            cur.execute('DELETE FROM messages WHERE room = ?', (room,))
            cur.execute('DELETE FROM messages WHERE room = ?', (f"{room}__killers",))
            cur.execute('DELETE FROM messages WHERE room = ?', (f"{room}__doctors",))
            conn.commit()
            conn.close()
        except Exception:
            pass
        # notify clients to reset their UI
        try:
            await sio.emit('room_reset', {'room': room}, room=room)
        except Exception:
            pass
    except Exception:
        return



@app.get('/rooms/{room_id}/messages')
async def room_messages(room_id: str, scope: str = None, limit: int = 50):
    """Return recent messages for a room. If `scope` is provided and is 'killers' or 'doctors',
    attempt to return messages stored under the private room namespace (room_id + '__killers' or '__doctors').
    """
    target_room = room_id
    if scope in ('killers', 'doctors'):
        suffix = '__killers' if scope == 'killers' else '__doctors'
        candidate = f"{room_id}{suffix}"
        # if no messages found for the private room, fall back to public room
        msgs = get_recent_messages(candidate, limit=limit)
        if msgs:
            return JSONResponse({'messages': msgs})
        # else fall back to public
    msgs = get_recent_messages(room_id, limit=limit)
    return JSONResponse({'messages': msgs})


@app.get('/rooms/{room_id}/players')
async def room_players(room_id: str):
    players = _rooms.get(room_id, [])
    meta = _room_meta.get(room_id, {})
    return JSONResponse({'players': players, 'host_id': meta.get('host_id')})


# expose the ASGI app at the module level so uvicorn can import app
asgi_app = socket_app


