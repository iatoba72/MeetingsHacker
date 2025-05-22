// meeting-copilot/backend/python_bridge.js
const { spawn } = require('child_process');
const EventEmitter = require('events');

class PythonBridge extends EventEmitter {
  constructor() {
    super();
    this.pythonProcess = null;
    this.dataBuffer = ''; // Buffer for stdout data
  }

  start(scriptPath = '../ml/assistant_worker.py', pythonExecutable = 'python3') {
    if (this.pythonProcess) {
      this.emit('status', { message: 'Python process already running.' });
      return;
    }

    this.emit('status', { message: `Starting Python process with script: ${scriptPath} using ${pythonExecutable}` });
    // stdio: 'pipe' creates pipes for stdin, stdout, stderr
    this.pythonProcess = spawn(pythonExecutable, [scriptPath], { stdio: ['pipe', 'pipe', 'pipe'] });

    this.pythonProcess.stdout.on('data', (data) => {
      this.dataBuffer += data.toString();
      let newlineIndex;
      while ((newlineIndex = this.dataBuffer.indexOf('\n')) !== -1) {
        const messageString = this.dataBuffer.substring(0, newlineIndex);
        this.dataBuffer = this.dataBuffer.substring(newlineIndex + 1);
        try {
          const parsedMessage = JSON.parse(messageString);
          // Emit the entire parsed message object, server.js can then decide how to route it
          this.emit('message', parsedMessage); 
        } catch (error) {
          this.emit('error', { 
            message: 'Error parsing JSON from Python stdout.', 
            raw_data: messageString,
            error_details: error.message 
          });
        }
      }
    });

    this.pythonProcess.stderr.on('data', (data) => {
      const errorMessage = data.toString();
      this.emit('error', { message: `Python process stderr: ${errorMessage}` });
    });

    this.pythonProcess.on('error', (error) => {
      this.emit('error', { message: 'Error spawning or during Python process execution.', error_details: error.message });
      this.pythonProcess = null; // Reset process state
    });

    this.pythonProcess.on('exit', (code, signal) => {
      this.emit('exit', { code, signal, message: `Python process exited with code ${code} and signal ${signal}` });
      this.pythonProcess = null; // Reset process state
    });
  }

  sendCommand(commandObject) {
    if (!this.pythonProcess || !this.pythonProcess.stdin || !this.pythonProcess.stdin.writable) {
      this.emit('error', { message: 'Python process not running or stdin not writable. Cannot send command.' });
      // console.error('Python process not running or stdin not writable.'); // For server-side log
      return false;
    }
    try {
      const message = JSON.stringify(commandObject) + '\n';
      this.pythonProcess.stdin.write(message);
      // console.log('Sent to Python:', commandObject); // For server-side log
      return true;
    } catch (error) {
      this.emit('error', { message: 'Error stringifying or writing command to Python.', error_details: error.message });
      // console.error('Error sending command to Python:', error); // For server-side log
      return false;
    }
  }

  stop() {
    if (this.pythonProcess) {
      this.emit('status', { message: 'Stopping Python process...' });
      this.pythonProcess.kill('SIGINT'); // Or 'SIGTERM'
      this.pythonProcess = null;
    } else {
      this.emit('status', { message: 'Python process not running, nothing to stop.'});
    }
  }
}

// Export a single instance (singleton pattern)
module.exports = new PythonBridge();
