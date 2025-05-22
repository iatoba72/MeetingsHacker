// frontend/src/socket.js - Configures and exports the Socket.IO client instance.
// This setup allows for centralized management of the WebSocket connection to the backend server.

import { io } from 'socket.io-client';

// Configuration Note: SOCKET_URL should point to the address of the Node.js backend server.
// Default is 'http://localhost:3001', which matches the backend server's default port.
// TODO: Make SOCKET_URL configurable via environment variables for different deployment stages (development, production).
// Example: const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || 'http://localhost:3001';
const SOCKET_URL = 'http://localhost:3001'; 

// Initialize the Socket.IO client instance.
export const socket = io(SOCKET_URL, {
  // Configuration Option: `autoConnect: false` prevents the socket from automatically connecting on initialization.
  // Connection is manually initiated in `App.jsx` using `socket.connect()`.
  // This provides more control over when the connection attempt occurs, especially useful within React's lifecycle.
  // Set to `true` if automatic connection on load is desired and `App.jsx` is adjusted accordingly.
  autoConnect: false,
  
  // TODO: Consider adding reconnection options if needed for robustness.
  // Example:
  //   reconnectionAttempts: 5,
  //   reconnectionDelay: 1000, // ms
});

// Data Flow: This `socket` object is imported by other components (primarily App.jsx)
// to send and receive events to/from the backend server.
// Key events sent from client: 'user_question', 'settings_update', 'start_transcription', etc.
// Key events received by client: 'connect', 'disconnect', 'transcript', 'assistant', 'python_status', 'error_message'.
