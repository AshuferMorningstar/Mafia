import { io } from 'socket.io-client';

// Change this to your backend URL if different. Use backend root (client will talk to /socket.io).
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:8000';

// Create socket and export. Keep autoConnect false so callers control when to connect.
export const socket = io(SOCKET_URL, {
  path: '/socket.io',
  autoConnect: false,
});

export default socket;
