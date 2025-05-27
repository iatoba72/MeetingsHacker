// meeting-copilot/backend/python_bridge.js
// Manages the Python child process for ML tasks and facilitates communication.
// Emits events for messages, status, errors, and exit from the Python process.

const { spawn } = require('child_process');
const EventEmitter = require('events');

class PythonBridge extends EventEmitter {
  constructor() {
    super();
    this.pythonProcess = null; // Holds the Python child process instance.
    this.dataBuffer = '';    // Buffer for accumulating stdout data from Python.
  }

  /**
   * Starts the Python worker script.
   * @param {string} scriptPath - Path to the Python script to execute.
   *                              Path Check: Default is '../ml/assistant_worker.py', which is correct
   *                              relative to this file in `backend/`.
   * @param {string} pythonExecutable - The command to run Python (e.g., 'python3', 'python').
   */
  start(scriptPath = '../ml/assistant_worker.py', pythonExecutable = 'python3') {
    if (this.pythonProcess) {
      this.emit('status', { message: 'Python process already running.' });
      // TODO: Consider if this should be an error or if it should try to kill existing and restart.
      return;
    }

    this.emit('status', { message: `Starting Python process with script: ${scriptPath} using ${pythonExecutable}` });
    
    // Spawn Options Change: stdio now uses ['pipe', 'pipe', 'inherit']
    // 'inherit' for stderr means Python's stderr will go directly to Node's stderr, useful for live debugging.
    this.pythonProcess = spawn(pythonExecutable, [scriptPath], { stdio: ['pipe', 'pipe', 'inherit'] });

    // --- stdout Handling ---
    // Data Flow: Receives null-character-terminated JSON strings from Python's stdout.
    this.pythonProcess.stdout.on('data', (data) => {
      this.dataBuffer += data.toString();
      let delimiterIndex;
      // IPC Delimiter Change: Process each complete JSON message (null-character-terminated).
      while ((delimiterIndex = this.dataBuffer.indexOf('\0')) !== -1) {
        const messageString = this.dataBuffer.substring(0, delimiterIndex);
        this.dataBuffer = this.dataBuffer.substring(delimiterIndex + 1);
        if (messageString) { // Ensure we don't process empty strings if multiple delimiters occur
          try {
            const parsedMessage = JSON.parse(messageString);
            // Data Flow: Emit 'message' event with the parsed JSON object.
            this.emit('message', parsedMessage); 
          } catch (error) {
            // Emit an error if JSON parsing fails, including the raw data for debugging.
            this.emit('error', { 
              message: 'Error parsing JSON from Python stdout.', 
              raw_data: messageString,
              error_details: error.message 
            });
          }
        }
      }
    });

    // --- stderr Handling ---
    // Note: With stdio 'inherit' for stderr, this handler will not be explicitly called
    // as stderr is directly piped to the parent process's stderr.
    // If specific error event emission for stderr is still needed,
    // then stderr should be 'pipe' and this handler re-enabled.
    // this.pythonProcess.stderr.on('data', (data) => {
    //   const errorMessage = data.toString();
    //   this.emit('error', { message: `Python process stderr: ${errorMessage}` });
    // });

    // --- Process Error Handling ---
    // Handles errors during the spawning or execution of the Python process itself (e.g., script not found).
    this.pythonProcess.on('error', (error) => {
      this.emit('error', { message: 'Error spawning or during Python process execution.', error_details: error.message });
      this.pythonProcess = null; // Reset process state on error.
    });

    // --- Process Exit Handling ---
    // Emits 'exit' event when the Python process terminates.
    this.pythonProcess.on('exit', (code, signal) => {
      this.emit('exit', { code, signal, message: `Python process exited with code ${code} and signal ${signal}` });
      this.pythonProcess = null; // Reset process state on exit.
    });
  }

  /**
   * Sends a command (as a JSON object) to the Python process via its stdin.
   * @param {object} commandObject - The command object to send (will be stringified to JSON).
   * @returns {boolean} True if the command was written to stdin, false otherwise.
   */
  sendCommand(commandObject) {
    if (!this.pythonProcess || !this.pythonProcess.stdin || !this.pythonProcess.stdin.writable) {
      this.emit('error', { message: 'Python process not running or stdin not writable. Cannot send command.' });
      return false;
    }
    try {
      // IPC Delimiter Change: Command object is stringified and a null character is appended.
      const message = JSON.stringify(commandObject) + '\0';
      this.pythonProcess.stdin.write(message);
      return true;
    } catch (error) {
      this.emit('error', { message: 'Error stringifying or writing command to Python.', error_details: error.message });
      return false;
    }
  }

  /**
   * Stops the Python process by sending a SIGINT signal.
   */
  stop() {
    if (this.pythonProcess) {
      this.emit('status', { message: 'Stopping Python process...' });
      this.pythonProcess.kill('SIGINT'); 
      this.pythonProcess = null; 
    } else {
      this.emit('status', { message: 'Python process not running, nothing to stop.'});
    }
  }
}

// Export a single instance of PythonBridge (singleton pattern).
module.exports = new PythonBridge();
