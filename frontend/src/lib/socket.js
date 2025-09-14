import { io } from 'socket.io-client';

// Change this to your backend URL if different
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:8000/ws';

// Create socket and export
export const socket = io(SOCKET_URL, {
  transports: ['websocket', 'polling'],
  autoConnect: false,
});

export default socket;
