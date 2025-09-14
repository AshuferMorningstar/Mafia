Realtime setup (Socket.IO)

Backend
- Run the backend ASGI app (Socket.IO mounted at /ws) with uvicorn:

  uvicorn backend.app.main:sio_app --reload --port 8000

- Install Python requirements in a virtualenv:

  pip install -r backend/requirements.txt

Frontend
- Install frontend deps:

  cd frontend
  npm install

- Start dev server (Vite):

  npm run dev

Notes
- Socket.IO is mounted under `/ws` on the backend. The frontend uses `VITE_SOCKET_URL` or `http://localhost:8000/ws` by default.
- For production, run the FastAPI app behind a proper ASGI server and adjust CORS and origin checks.
