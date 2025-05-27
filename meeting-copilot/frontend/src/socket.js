import { io } from 'socket.io-client';
// Adjust URL if your Node.js server is different, but localhost:3001 is current default
const SOCKET_URL = process.env.NODE_ENV === 'production' ? '/' : 'http://localhost:3001';
const socket = io(SOCKET_URL, {
  autoConnect: false // Allow explicit connection e.g. in App.jsx or specific pages
});
export default socket; // Export the instance
