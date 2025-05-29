// meeting-copilot/backend/server.js - Main Node.js server.
// Handles:
// - HTTP API requests (configuration, templates).
// - Socket.IO connections for real-time frontend communication.
// - Managing the Python subprocess via PythonBridge.
// - Relaying data between frontend and Python subprocess.

// Standard library imports
const http = require('http');
const path = require('path'); // For serving frontend static files and frames.
const fs = require('fs'); // For creating frames directory

// Third-party library imports
const express = require('express');
const { Server } = require('socket.io'); // For real-time bidirectional communication.

// Local module imports
const configStore = require('./configStore');     // Manages application configuration.
const pythonBridge = require('./python_bridge');  // Manages Python subprocess interaction.
// const configRoutes = require('./routes/config');    // API routes for /api/config. - Will be initialized with io
const templateRoutes = require('./routes/templates'); // API routes for /api/templates.
const metaRoutes = require('./routes/meta'); // Added for /api/meta/* routes
const infoRoutes = require('./routes/info'); // Routes for /api/models and /api/meetings

// Initialize Express app and HTTP server.
const app = express();
const server = http.createServer(app);

// Initialize Socket.IO server.
const io = new Server(server, {
  cors: {
    origin: "*", 
    methods: ["GET", "POST"]
  }
});

// Configuration: Port for the server to listen on.
const PORT = process.env.PORT || 3001; // Default to 3001 if not specified.

// --- Express Middleware ---
app.use(express.json()); // For parsing JSON request bodies from API calls.

// --- API Routes ---
// app.use('/api/config', configRoutes); // Will be initialized with io
app.use('/api/templates', templateRoutes);
app.use('/api/meta', metaRoutes); // Use the new meta routes
app.use('/api/info', infoRoutes); // Use the new info routes

// Initialize routes that need access to the io instance
const configRouter = require('./routes/config')(io);
app.use('/api/config', configRouter);


// --- Static Serving for /frames ---
// Path Check: `../frames` correctly points to `meeting-copilot/frames/` from `meeting-copilot/backend/`.
const framesDirectory = path.join(__dirname, '../frames');
// Create frames directory if it doesn't exist.
if (!fs.existsSync(framesDirectory)){
    fs.mkdirSync(framesDirectory, { recursive: true });
    console.log(`Created directory: ${framesDirectory}`);
}
app.use('/frames', express.static(framesDirectory));


// --- Application Initialization ---
// Asynchronous IIFE to handle initial setup.
(async () => {
  try {
    // Config Loading: Ensure configStore.load() is awaited.
    await configStore.load();
    console.log("Configuration loaded successfully on server startup.");
    
    // const currentConfig = await configStore.get(); // configStore.get is async
    // TODO: Pass pythonExecutable and scriptPath from config to pythonBridge.start() if needed.
    pythonBridge.start(); // Start the Python subprocess.
  } catch (error) {
    console.error("Critical error during server initialization:", error);
    // process.exit(1); // Exit if initialization fails.
  }
})();

// --- Python Bridge Event Handling ---
pythonBridge.on('message', (data) => {
  if (data && data.event) {
    // Relay 'restart_required' Event:
    if (data.event === 'restart_required') {
      console.log("Python worker signaled restart_required. Relaying to clients.");
      io.emit('restart_required', data); // data might contain details or reasons.
    } else {
      // Relay other events from Python directly to all connected Socket.IO clients.
      io.emit(data.event, data); 
    }
  } else {
    console.warn('Received message from Python without an "event" field:', data);
    io.emit('python_status', { event: 'generic_message', original_message: data });
  }
});

pythonBridge.on('status', (status) => {
  console.log('Python Bridge Status Update:', status.message);
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
  console.warn('Python Bridge Process Exited:', exitInfo.message);
  io.emit('python_status', { event: 'critical_exit', message: exitInfo.message, code: exitInfo.code, signal: exitInfo.signal });
  // TODO: Implement a robust restart strategy for the Python process if the exit was unexpected.
});


// --- Socket.IO Connection Handling ---
io.on('connection', async (socket) => { // Make handler async to await configStore.get()
  console.log('A user connected via Socket.IO:', socket.id);

  // Emit Config on Connect: Send current config to newly connected client.
  try {
    const currentConfig = await configStore.get(); // configStore.get is now async
    socket.emit('config', currentConfig);
  } catch (error) {
    console.error("Error sending initial config to client:", error);
    socket.emit('error_message', { message: "Failed to retrieve initial configuration." });
  }

  // Generic command handler to forward messages from frontend to Python.
  const handleCommandToPython = (commandName, data) => {
    console.log(`Socket.IO: Received '${commandName}' from client ${socket.id}:`, data);
    const success = pythonBridge.sendCommand({ command: commandName, payload: data || {} });
    if (!success) {
      socket.emit('error_message', { message: `Failed to send '${commandName}' command to Python. Bridge not ready or command error.` });
    }
  };

  // Register handlers for various frontend commands to be relayed to Python.
  socket.on('user_question', (data) => handleCommandToPython('query_llm', { prompt: data.prompt }));
  socket.on('settings_update', (data) => handleCommandToPython('update_setting', data));
  socket.on('start_transcription', (data) => handleCommandToPython('start_transcription', data));
  socket.on('stop_transcription', (data) => handleCommandToPython('stop_transcription', data));
  socket.on('start_vision', (data) => handleCommandToPython('start_vision', data));
  socket.on('stop_vision', (data) => handleCommandToPython('stop_vision', data));
  
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });

  socket.on('error', (error) => {
    console.error('Socket.IO error for client', socket.id, ':', error);
  });
});

// --- HTTP Endpoints ---
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'Node.js server is running.' });
});

app.post('/upload', (req, res) => {
  console.log('File upload endpoint hit. (Placeholder - no actual upload processing implemented)');
  res.status(501).json({ message: 'File upload endpoint hit, but processing not yet implemented.' });
});

// --- Serve Frontend Static Files (Production) ---
// TODO: Uncomment and configure to serve the React frontend build in production.
// const frontendBuildPath = path.join(__dirname, '../../frontend/dist'); // Adjust path as necessary.
// app.use(express.static(frontendBuildPath));
// // SPA fallback: For any GET request not handled by API routes or static files, serve index.html.
// app.get('*', (req, res) => {
//   res.sendFile(path.join(frontendBuildPath, 'index.html'));
// });


// --- Start Server ---
server.listen(PORT, () => {
  console.log(`Node.js server listening on port ${PORT}`);
});

// --- Graceful Shutdown ---
function gracefulShutdown(signal) {
  console.log(`${signal} received. Shutting down gracefully.`);
  pythonBridge.stop(); 
  
  server.close(() => {
    console.log('Node.js server closed.');
    process.exit(0); 
  });

  setTimeout(() => {
    console.error('Could not close connections in time, forcefully shutting down.');
    process.exit(1);
  }, 10000); 
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
