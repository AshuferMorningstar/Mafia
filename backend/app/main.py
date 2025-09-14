from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# Socket.IO imports and persistence/auth
import socketio
import sqlite3
import os
# import jwt (try PyJWT, otherwise provide a minimal fallback decoder)
try:
    import jwt  # type: ignore
except Exception:
    # Minimal non-verifying JWT decoder fallback for environments without PyJWT.
    # NOTE: This does NOT verify signatures and should only be used for development/testing.
    import base64
    import json

    class _JWTStubModule:
        def decode(self, token, key=None, algorithms=None):
            try:
                parts = token.split('.')
                if len(parts) < 2:
                    raise ValueError("Invalid token")
                payload_b64 = parts[1]
                # Add padding if needed
                rem = len(payload_b64) % 4
                if rem:
                    payload_b64 += '=' * (4 - rem)
                payload_json = base64.urlsafe_b64decode(payload_b64.encode()).decode()
                return json.loads(payload_json)
            except Exception as e:
                raise RuntimeError("Failed to decode JWT token without PyJWT installed") from e

    jwt = _JWTStubModule()
import time

app = FastAPI()

# Allow CORS for frontend dev
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Create an async Socket.IO server and attach as ASGI app via FastAPI
sio = socketio.AsyncServer(async_mode='asgi', cors_allowed_origins='*')
sio_app = socketio.ASGIApp(sio, other_asgi_app=app)


@app.get("/")
async def read_root():
    return {"message": "Mafia backend is running!"}


# --- Simple in-memory presence store: { roomId: [players] } ---
_rooms = {}
# sid -> { room, player }
_sid_info = {}
# sid -> auth payload passed on connect
_connect_auth = {}


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


# init DB at startup
init_db()


@sio.event
async def connect(sid, environ, auth):
    print(f"socket connected: {sid} auth={auth}")
    # store connect-time auth for this sid (may be None)
    if auth and isinstance(auth, dict):
        _connect_auth[sid] = auth


@sio.event
async def disconnect(sid):
    print(f"socket disconnected: {sid}")
    # Clean up presence if we have a mapping
    info = _sid_info.pop(sid, None)
    # remove connect auth
    _connect_auth.pop(sid, None)
    if info:
        room = info.get('room')
        player = info.get('player')
        if room and player:
            # remove player from room list
            room_players = _rooms.get(room, [])
            _rooms[room] = [p for p in room_players if p.get('id') != player.get('id')]
            await sio.emit('player_left', {'player': player}, room=room)
            await sio.emit('player_list_update', {'players': _rooms.get(room, [])}, room=room)


@sio.event
async def join_room(sid, data):
    # data: { roomId, player, token? }
    room = data.get('roomId')
    player = data.get('player')
    if not room or not player:
        await sio.emit('error', {'message': 'invalid join_room payload'}, to=sid)
        return
    token = data.get('token') or (_connect_auth.get(sid) or {}).get('token')
    # If token present, validate and optionally override player id/name
    if token:
        try:
            payload = jwt.decode(token, os.environ.get('JWT_SECRET', 'dev-secret'), algorithms=['HS256'])
            # prefer token-subject as id and name if available
            if payload.get('sub'):
                player = player or {}
                player['id'] = payload.get('sub')
            if payload.get('name'):
                player = player or {}
                player['name'] = payload.get('name')
        except Exception as e:
            await sio.emit('error', {'message': 'invalid token'}, to=sid)
            return

    await sio.enter_room(sid, room)
    # track player in authoritative room list
    room_players = _rooms.setdefault(room, [])
    # avoid duplicates by id
    if not any(p.get('id') == player.get('id') for p in room_players):
        room_players.append(player)
    # map sid to player+room for cleanup
    _sid_info[sid] = {'room': room, 'player': player}
    # broadcast player joined and full list
    await sio.emit('player_joined', {'player': player}, room=room)
    await sio.emit('player_list_update', {'players': room_players}, room=room)


@sio.event
async def leave_room(sid, data):
    room = data.get('roomId')
    player = data.get('player')
    if room:
        await sio.leave_room(sid, room)
        # remove from authoritative list
        room_players = _rooms.get(room, [])
        _rooms[room] = [p for p in room_players if p.get('id') != player.get('id')]
        # cleanup sid mapping
        _sid_info.pop(sid, None)
        await sio.emit('player_left', {'player': player}, room=room)
        await sio.emit('player_list_update', {'players': _rooms.get(room, [])}, room=room)


@sio.event
async def send_message(sid, data):
    # data: { roomId, message }
    room = data.get('roomId')
    message = data.get('message')
    if not room or not message:
        await sio.emit('error', {'message': 'invalid send_message payload'}, to=sid)
        return
    # persist message
    try:
        save_message(room, message)
    except Exception:
        pass
    # Broadcast to room
    await sio.emit('new_message', {'message': message}, room=room)


@app.get('/rooms/{room_id}/messages')
async def room_messages(room_id: str, limit: int = 50):
    msgs = get_recent_messages(room_id, limit=limit)
    return JSONResponse({'messages': msgs})


@app.get('/rooms/{room_id}/players')
async def room_players(room_id: str):
    return JSONResponse({'players': _rooms.get(room_id, [])})


# Expose the ASGI app (run with `uvicorn backend.app.main:sio_app`)
app.mount('/ws', sio_app)
