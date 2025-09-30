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
    # map player id -> sid so we can send private messages later
    sids = meta.setdefault('player_sids', {})
    try:
        pid = player.get('id')
        if pid:
            sids[pid] = sid
    except Exception:
        pass
    # if no host assigned yet, the first player becomes host
    if not meta.get('host_id'):
        meta['host_id'] = player.get('id')
    await sio.save_session(sid, {'room': room, 'player': player})
    await sio.enter_room(sid, room)
    # broadcast to room
    await sio.emit('player_joined', {'player': player}, room=room)
    # also emit a room_state update (players + host)
    await sio.emit('room_state', {'players': _rooms.get(room, []), 'host_id': meta.get('host_id'), 'eliminated': meta.get('eliminated', {})}, room=room)


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
        await sio.leave_room(sid, room)
        await sio.emit('player_left', {'player': player}, room=room)
        # update room metadata: if host left, promote next player (if any)
        meta = _room_meta.get(room, {})
        if meta.get('host_id') == player.get('id'):
            remaining = _rooms.get(room, [])
            meta['host_id'] = remaining[0].get('id') if remaining else None
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

    # Night restrictions: public chat is locked during night
    if phase and phase.startswith('night'):
        if scope == 'public':
            # public chat is closed during night
            try:
                await sio.emit('chat_blocked', {'message': 'Public chat is closed during night'}, room=sid)
            except Exception:
                pass
            return
        elif scope == 'killers':
            # emit only to killer private room
            kr = meta.get('killer_room')
            if kr:
                await sio.emit('new_message', {'message': message}, room=kr)
            return
        elif scope == 'doctors':
            dr = meta.get('doctor_room')
            if dr:
                await sio.emit('new_message', {'message': message}, room=dr)
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
    meta['settings'] = settings
    await sio.emit('settings_updated', {'settings': settings}, room=room)


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
                    'doctorCount': int(settings.get('doctorCount', 0)),
                    'detectiveCount': int(settings.get('detectiveCount', 0)),
                }
            except Exception:
                settings = {'killCount': 1, 'doctorCount': 0, 'detectiveCount': 0}
            assigned = _assign_roles_to_players(players, settings)
            # store assigned roles in meta and mark in-game
            meta['assigned_roles'] = {p.get('id'): p.get('role') for p in assigned}
            meta['in_game'] = True
            meta['phase'] = 'pre_night'
            meta['eliminated'] = meta.get('eliminated', {})

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
                psid = sids.get(pid)
                if psid:
                    try:
                        # send role and description privately
                        await sio.emit('your_role', {'role': p.get('role'), 'description': role_descriptions.get(p.get('role'))}, room=psid)
                        # server-side: place killers/doctors into private rooms so server can emit to them
                        if p.get('role') == 'Killer':
                            try:
                                await sio.enter_room(psid, killer_room)
                            except Exception:
                                pass
                        if p.get('role') == 'Doctor':
                            try:
                                await sio.enter_room(psid, doctor_room)
                            except Exception:
                                pass
                    except Exception as e:
                        print(f"[player_ready] error sending role to {pid}: {e}")

            # broadcast roles assigned (public roster only)
            public_players = [{'id': p.get('id'), 'name': p.get('name')} for p in assigned]
            # include the normalized settings the host applied so clients can display them
            await sio.emit('roles_assigned', {'players': public_players, 'role_descriptions': role_descriptions, 'settings': settings}, room=room)

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
    await sio.emit('phase', {'phase': 'night_start', 'message': "It's night — close your eyes.", 'duration': 3, 'start_ts': start_ts}, room=room)
    # wait 3s then start killer phase
    await asyncio.sleep(3)
    await _start_killer_phase(room)


async def _start_killer_phase(room: str, duration: int = 120):
    meta = _room_meta.setdefault(room, {})
    meta['phase'] = 'killer'
    # reset per-round actions tracker
    meta['actions'] = meta.get('actions', {})
    meta['actions']['killer'] = {}
    meta['night_kill'] = None
    # notify everyone that killer phase has started (public notification + timer)
    start_ts = int(time.time() * 1000)
    await sio.emit('phase', {'phase': 'killer', 'message': 'Night has fallen — Killers, choose your target', 'duration': duration, 'start_ts': start_ts}, room=room)
    # also notify killer private room so killers get private chat context
    if meta.get('killer_room'):
        await sio.emit('phase', {'phase': 'killer', 'message': 'Killer, open your eyes and choose a target', 'duration': duration, 'start_ts': start_ts}, room=meta.get('killer_room'))

    async def killer_timer():
        try:
            await asyncio.sleep(duration)
        except asyncio.CancelledError:
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
    # block eliminated players from acting
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
    players = _rooms.get(room, [])
    assigned = meta.get('assigned_roles', {})
    alive_players = [p for p in players if not meta.get('eliminated', {}).get(p.get('id'))]
    # count alive doctors
    alive_doctors = sum(1 for p in alive_players if assigned.get(p.get('id')) == 'Doctor')
    if alive_doctors <= 0:
        # directly resolve night (doctor phase skipped)
        await _resolve_night_and_start_day(room)
    else:
        await _start_doctor_phase(room)


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
            await asyncio.sleep(duration)
        except asyncio.CancelledError:
            return
        # timer expired, resolve night
        await _resolve_night_and_start_day(room)

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
    meta = _room_meta.setdefault(room, {})
    killed = meta.get('night_kill')
    saved = meta.get('doctor_save')
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

    # determine outcome
    outcome = {}
    if killed and saved and killed == saved:
        # doctor saved the victim
        outcome['result'] = 'saved'
        outcome['player'] = saved_player
    elif killed:
        outcome['result'] = 'killed'
        outcome['player'] = killed_player
    else:
        outcome['result'] = 'none'
        outcome['player'] = None

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

    # start day after small pause
    meta['phase'] = 'day'
    start_ts = int(time.time() * 1000)
    # default discussion window can be controlled via settings; use 180s if not set
    discussion_duration = int(meta.get('settings', {}).get('discussionDuration', 180)) if meta.get('settings') else 180
    await sio.emit('phase', {'phase': 'day', 'message': 'Day has begun — discuss and then vote', 'duration': discussion_duration, 'start_ts': start_ts}, room=room)

    # allow public chat again; send updated room state and players list
    await sio.emit('room_state', {'players': _rooms.get(room, []), 'host_id': meta.get('host_id'), 'eliminated': meta.get('eliminated', {})}, room=room)

    # start voting phase automatically after a short discussion window (optional)
    # For simplicity, immediately start voting — clients can delay locally if desired
    await _start_voting_phase(room)
    # Check win conditions after night resolution (example simple checks)
    await _check_win_conditions(room)


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
    # count votes
    counts = {}
    for v in votes.values():
        # ignore abstain/skip (None) votes
        if v is None:
            continue
        counts[v] = counts.get(v, 0) + 1
    if not counts:
        await sio.emit('vote_result', {'result': 'no_votes'}, room=room)
        meta['phase'] = 'post_vote'
        return
    # find max
    max_votes = max(counts.values())
    top = [pid for pid, c in counts.items() if c == max_votes]
    eliminated = None
    if len(top) == 1:
        eliminated = top[0]
    else:
        # tie: no elimination (could randomize if desired)
        eliminated = None

    if eliminated:
        # find player object
        players = _rooms.get(room, [])
        eliminated_player = next((p for p in players if p.get('id') == eliminated), None)
        if eliminated_player:
            role = meta.get('assigned_roles', {}).get(eliminated)
            # mark eliminated (do not remove from players list so UIs can show skull)
            meta.setdefault('eliminated', {})[eliminated] = True
            await sio.emit('vote_result', {'result': 'eliminated', 'player': {'id': eliminated_player.get('id'), 'name': eliminated_player.get('name'), 'role': role}}, room=room)
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
    await sio.emit('vote_result', {'result': 'no_elimination', 'top': top, 'counts': counts}, room=room)
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
    civilians = alive_roles.get('Civilian', 0) + alive_roles.get('Doctor', 0) + alive_roles.get('Detective', 0)

    if killers == 0:
        # civilians win
        await sio.emit('game_over', {'winner': 'Civilians'}, room=room)
        meta['phase'] = 'ended'
        meta['in_game'] = False
        return
    if killers >= civilians:
        # killers win
        await sio.emit('game_over', {'winner': 'Killers'}, room=room)
        meta['phase'] = 'ended'
        meta['in_game'] = False
        return



@app.get('/rooms/{room_id}/messages')
async def room_messages(room_id: str, limit: int = 50):
    msgs = get_recent_messages(room_id, limit=limit)
    return JSONResponse({'messages': msgs})


@app.get('/rooms/{room_id}/players')
async def room_players(room_id: str):
    players = _rooms.get(room_id, [])
    meta = _room_meta.get(room_id, {})
    return JSONResponse({'players': players, 'host_id': meta.get('host_id')})


# expose the ASGI app at the module level so uvicorn can import app
asgi_app = socket_app


