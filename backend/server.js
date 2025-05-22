// backend/server.js - Main Node.js server for handling client connections and Python communication.

// Standard library imports
const http = require('http');
const { spawn } = require('child_process'); // Used to run the Python worker as a separate process.

// Third-party library imports
const express = require('express');
const { Server } = require('socket.io'); // For real-time bidirectional communication with the frontend.

// Initialize Express app and HTTP server
const app = express();
const server = http.createServer(app);

// Initialize Socket.IO server with CORS configuration.
// CORS is configured to allow all origins for simplicity during development.
// TODO: Restrict origin for production environments.
const io = new Server(server, {
  cors: {
    origin: "*", 
    methods: ["GET", "POST"]
  }
});

// Configuration: Port for the server to listen on.
const PORT = process.env.PORT || 3001; // Default to 3001 if not specified in environment.

// State variables for managing the Python subprocess.
let pythonProcess = null; // Holds the spawned Python child process instance.
let pythonStdin = null;   // stdin stream of the Python process, used to send commands.
let dataBuffer = '';      // Buffer for accumulating data chunks from Python's stdout.

/**
 * Starts the Python worker script as a child process.
 * Configures handlers for stdout, stderr, errors, and exit events from the Python process.
 */
function startPythonProcess() {
  console.log('Starting Python process...');
  // Configuration Note: Assumes 'python3' is in PATH and the script path is relative to this file.
  // The Python script is expected to be in '../ml/assistant_worker.py'.
  pythonProcess = spawn('python3', ['../ml/assistant_worker.py']);
  pythonStdin = pythonProcess.stdin; // Get the stdin stream to send data to Python.

  // Handle data received from Python's stdout.
  // Data is expected to be newline-terminated JSON strings.
  pythonProcess.stdout.on('data', (data) => {
    dataBuffer += data.toString(); // Append incoming data to buffer.
    let newlineIndex;
    // Process each complete JSON message (newline-terminated).
    while ((newlineIndex = dataBuffer.indexOf('\n')) !== -1) {
      const messageString = dataBuffer.substring(0, newlineIndex);
      dataBuffer = dataBuffer.substring(newlineIndex + 1);
      try {
        const message = JSON.parse(messageString); // Parse the JSON string.
        console.log('Received from Python:', message); // Log for debugging.

        // Data Flow: Relay specific events from Python to all connected Socket.IO clients.
        // TODO: Add more robust event handling and routing based on message.event.
        if (message.event === 'transcript') {
          io.emit('transcript', message); // Emit 'transcript' event to frontend.
        } else if (message.event === 'assistant') {
          io.emit('assistant', message);  // Emit 'assistant' event (e.g., LLM response) to frontend.
        } else if (message.event === 'slide_text') {
          io.emit('slide_text', message); // Emit 'slide_text' (OCR results) to frontend.
        } else if (message.event === 'system_message' || message.event === 'error' || message.event === 'warning' || message.event === 'critical') {
          // Relay system/status/error messages from Python to frontend for visibility.
          io.emit('python_status', message);
        }
      } catch (error) {
        console.error('Error parsing JSON from Python:', error, 'Raw data:', messageString);
        io.emit('python_status', { event: 'error', message: 'Error parsing JSON from Python.', details: messageString });
      }
    }
  });

  // Handle data received from Python's stderr.
  pythonProcess.stderr.on('data', (data) => {
    console.error(`Python process stderr: ${data}`);
    io.emit('python_status', { event: 'error', message: `Python stderr: ${data.toString()}` });
  });

  // Handle errors during spawning or running the Python process.
  pythonProcess.on('error', (error) => {
    console.error('Error spawning/running Python process:', error);
    pythonProcess = null;
    pythonStdin = null;
    io.emit('python_status', { event: 'critical', message: 'Failed to start or an error occurred with the Python process.' });
    // TODO: Implement a more robust restart strategy (e.g., exponential backoff).
    // setTimeout(startPythonProcess, 5000); // Optional: Attempt to restart after a delay.
  });

  // Handle the Python process exiting.
  pythonProcess.on('exit', (code, signal) => {
    console.log(`Python process exited with code ${code} and signal ${signal}`);
    pythonProcess = null;
    pythonStdin = null;
    io.emit('python_status', { event: 'critical', message: `Python process exited (code ${code}, signal ${signal}).` });
    // TODO: Implement a restart strategy if the exit was unexpected.
    // if (code !== 0 && signal !== 'SIGINT' && signal !== 'SIGTERM') { 
    //   console.log('Attempting to restart Python process due to unexpected exit...');
    //   setTimeout(startPythonProcess, 5000); // Optional: Restart if not a clean exit.
    // }
  });
}

// Initial startup of the Python process.
startPythonProcess();

// Handle new Socket.IO connections from clients.
io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  // Data Flow: Handle 'user_question' event from a client.
  // Sends the question to the Python worker via stdin.
  socket.on('user_question', (data) => {
    console.log('Received user_question from frontend:', data);
    if (pythonStdin) {
      const command = { command: 'query_llm', payload: { prompt: data.prompt } };
      pythonStdin.write(JSON.stringify(command) + '\n'); // Send command to Python.
    } else {
      console.error('Python process not running, cannot send user_question');
      socket.emit('error_message', { message: 'Backend is not ready to process this request (Python worker not running).' });
    }
  });

  // Data Flow: Handle 'settings_update' event from a client.
  // Sends the new settings to the Python worker.
  socket.on('settings_update', (data) => {
    console.log('Received settings_update from frontend:', data);
    if (pythonStdin) {
      const command = { command: 'update_setting', payload: data };
      pythonStdin.write(JSON.stringify(command) + '\n');
    } else {
      console.error('Python process not running, cannot send settings_update');
      socket.emit('error_message', { message: 'Backend is not ready to process settings update (Python worker not running).' });
    }
  });

  // Data Flow: Handle commands to start/stop transcription and vision processing in Python.
  ['start_transcription', 'stop_transcription', 'start_vision', 'stop_vision'].forEach(commandName => {
    socket.on(commandName, (data) => {
      console.log(`Received '${commandName}' command from frontend:`, data);
      if (pythonStdin) {
        const command = { command: commandName, payload: data || {} }; // Include payload if any
        pythonStdin.write(JSON.stringify(command) + '\n');
      } else {
        console.error(`Python process not running, cannot send '${commandName}'`);
        socket.emit('error_message', { message: `Cannot process '${commandName}', Python worker not running.` });
      }
    });
  });

  // Handle client disconnection.
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });

  // Handle Socket.IO errors for a specific client.
  socket.on('error', (error) => {
    console.error('Socket.IO error for client', socket.id, ':', error);
  });
});

// HTTP endpoint for health checks.
// Responds with status 'OK' if the server is running.
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'Node.js server is running.' });
});

// HTTP endpoint for file uploads (e.g., VTT files).
// TODO: Implement actual file handling logic (e.g., using 'multer' for multipart/form-data).
// For now, it's a placeholder.
app.post('/upload', (req, res) => {
  console.log('File upload endpoint hit. (Placeholder - no actual upload processing)');
  // In a real app, you'd use multer or similar to handle file uploads.
  // Example: save file, then potentially send a command to Python to process it.
  res.status(501).json({ message: 'File upload endpoint hit, but processing not yet implemented.' });
});

// Start the HTTP server.
server.listen(PORT, () => {
  console.log(`Node.js server listening on port ${PORT}`);
});

// Graceful shutdown logic for SIGINT and SIGTERM signals.
// Ensures the Python process is terminated and the server closes cleanly.
function gracefulShutdown(signal) {
  console.log(`${signal} received. Shutting down gracefully.`);
  if (pythonProcess) {
    console.log('Stopping Python process...');
    // Send SIGINT to Python process, assuming it handles it for cleanup.
    // If Python doesn't handle SIGINT, SIGTERM might be more forceful.
    pythonProcess.kill('SIGINT'); 
  }
  server.close(() => {
    console.log('Node.js server closed.');
    process.exit(0);
  });

  // Force exit if server doesn't close in time
  setTimeout(() => {
    console.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000); // 10 seconds timeout
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
