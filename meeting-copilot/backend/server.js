// backend/server.js - Main Node.js server for handling client connections and Python communication.

// Standard library imports
const http = require('http');
// const path = require('path'); // For serving frontend static files

// Third-party library imports
const express = require('express');
const { Server } = require('socket.io'); // For real-time bidirectional communication with the frontend.

// Local module imports
const configStore = require('./configStore');
const pythonBridge = require('./python_bridge');
const configRoutes = require('./routes/config');
const templateRoutes = require('./routes/templates');

// Initialize Express app and HTTP server
const app = express();
const server = http.createServer(app);

// Initialize Socket.IO server with CORS configuration.
// TODO: Restrict origin for production environments.
const io = new Server(server, {
  cors: {
    origin: "*", 
    methods: ["GET", "POST"]
  }
});

// Configuration: Port for the server to listen on.
const PORT = process.env.PORT || 3001; // Default to 3001 if not specified in environment.

// Express Middleware
app.use(express.json()); // For parsing JSON request bodies from API calls.

// API Routes
app.use('/api/config', configRoutes);
app.use('/api/templates', templateRoutes);

// Initialize configuration and Python Bridge
(async () => {
  try {
    await configStore.load();
    console.log("Configuration loaded successfully.");
    const currentConfig = configStore.get();
    // TODO: Potentially use a config value for pythonPath or pythonExecutable
    // For now, python_bridge.js uses defaults.
    // Example: pythonBridge.start(currentConfig.pythonScriptPath, currentConfig.pythonExecutable);
    pythonBridge.start(); 
  } catch (error) {
    console.error("Failed to initialize configuration or Python bridge:", error);
    // Consider how to handle critical startup errors (e.g., exit, or run in a degraded mode)
  }
})();

// Python Bridge Event Handling
// Data Flow: Listen for 'message' events from pythonBridge (parsed JSON from Python's stdout)
pythonBridge.on('message', (data) => {
  // console.log('Message from Python Bridge:', data); // Debug log
  // The 'data' object from Python is expected to have an 'event' field to route it
  // and a 'payload' (or other fields) for the actual data.
  if (data && data.event) {
    // Relay specific events from Python to all connected Socket.IO clients.
    // Example: if data is { event: 'transcript', text: 'Hello', speaker: 'Speaker1' }
    // io.emit('transcript', { text: 'Hello', speaker: 'Speaker1' });
    io.emit(data.event, data); // Emitting the whole data object as received
  } else {
    // Fallback for messages without a specific 'event' field - treat as generic python_status
    io.emit('python_status', { event: 'generic_message', original_message: data });
    console.warn('Received message from Python without an event field:', data);
  }
});

pythonBridge.on('status', (status) => {
  console.log('Python Bridge Status:', status.message);
  io.emit('python_status', { event: 'status', message: status.message });
});

pythonBridge.on('error', (error) => {
  console.error('Python Bridge Error:', error.message, error.error_details || '', error.raw_data || '');
  io.emit('python_status', { 
    event: 'error', 
    message: error.message, 
    details: error.error_details,
    raw_data: error.raw_data
  });
});

pythonBridge.on('exit', (exitInfo) => {
  console.warn('Python Bridge Exit:', exitInfo.message);
  io.emit('python_status', { event: 'critical', message: exitInfo.message, code: exitInfo.code, signal: exitInfo.signal });
  // TODO: Implement a restart strategy if the exit was unexpected.
});


// Socket.IO Connection Handling
io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  // Generic command handler to forward to Python
  const handleCommandToPython = (commandName, data) => {
    console.log(`Received '${commandName}' from frontend:`, data);
    const success = pythonBridge.sendCommand({ command: commandName, payload: data || {} });
    if (!success) {
      socket.emit('error_message', { message: `Failed to send '${commandName}' command to Python. Bridge not ready.` });
    }
  };

  // Register handlers for various frontend commands
  socket.on('user_question', (data) => handleCommandToPython('query_llm', { prompt: data.prompt }));
  socket.on('settings_update', (data) => handleCommandToPython('update_setting', data));
  socket.on('start_transcription', (data) => handleCommandToPython('start_transcription', data));
  socket.on('stop_transcription', (data) => handleCommandToPython('stop_transcription', data));
  socket.on('start_vision', (data) => handleCommandToPython('start_vision', data));
  socket.on('stop_vision', (data) => handleCommandToPython('stop_vision', data));
  // Add other direct commands here if needed, e.g., socket.on('custom_command', (data) => handleCommandToPython('custom_py_command', data));


  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });

  socket.on('error', (error) => {
    console.error('Socket.IO error for client', socket.id, ':', error);
  });
});

// HTTP Endpoints
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'Node.js server is running.' });
});

app.post('/upload', (req, res) => {
  console.log('File upload endpoint hit. (Placeholder - no actual upload processing)');
  res.status(501).json({ message: 'File upload endpoint hit, but processing not yet implemented.' });
});

// TODO: Serve frontend static files in production
// const path = require('path');
// app.use(express.static(path.join(__dirname, '../../frontend/dist'))); // Adjust path
// app.get('*', (req, res) => {
//   res.sendFile(path.join(__dirname, '../../frontend/dist/index.html')); // Adjust path
// });


// Start Server
server.listen(PORT, () => {
  console.log(`Node.js server listening on port ${PORT}`);
});

// Graceful Shutdown
function gracefulShutdown(signal) {
  console.log(`${signal} received. Shutting down gracefully.`);
  pythonBridge.stop(); // Stop the Python process
  server.close(() => {
    console.log('Node.js server closed.');
    process.exit(0);
  });

  setTimeout(() => {
    console.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000); // 10 seconds timeout
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
