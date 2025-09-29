from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

import sqlite3
import os
import time

# import python-socketio ASGI
import socketio


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
    # add player to in-memory room list
    lst = _rooms.setdefault(room, [])
    # avoid duplicates
    if not any(p.get('id') == player.get('id') for p in lst):
        lst.append(player)
    # ensure room metadata exists
    meta = _room_meta.setdefault(room, {})
    # if no host assigned yet, the first player becomes host
    if not meta.get('host_id'):
        meta['host_id'] = player.get('id')
    await sio.save_session(sid, {'room': room, 'player': player})
    await sio.enter_room(sid, room)
    # broadcast to room
    await sio.emit('player_joined', {'player': player}, room=room)
    # also emit a room_state update (players + host)
    await sio.emit('room_state', {'players': _rooms.get(room, []), 'host_id': meta.get('host_id')}, room=room)


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
    if room and message:
        try:
            save_message(room, message)
        except Exception:
            pass
        await sio.emit('new_message', {'message': message}, room=room)


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


