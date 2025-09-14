from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

import sqlite3
import os
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




@app.get("/")
async def read_root():
    return {"message": "Mafia backend is running!"}


_rooms = {}


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



@app.get('/rooms/{room_id}/messages')
async def room_messages(room_id: str, limit: int = 50):
    msgs = get_recent_messages(room_id, limit=limit)
    return JSONResponse({'messages': msgs})


@app.get('/rooms/{room_id}/players')
async def room_players(room_id: str):
    return JSONResponse({'players': _rooms.get(room_id, [])})


