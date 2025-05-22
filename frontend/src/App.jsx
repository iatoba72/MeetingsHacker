// frontend/src/App.jsx - Main application component for the AI Meeting Copilot UI.
// Manages global state, WebSocket connections, and renders primary UI layout.

import React, { useState, useEffect } from 'react';
import { socket } from './socket'; // Socket.IO client instance
import AssistantFeed from './components/AssistantFeed'; // Component for displaying messages and user input
import SettingsPanel from './components/SettingsPanel'; // Component for managing application settings

function App() {
  // State variable for WebSocket connection status.
  const [isConnected, setIsConnected] = useState(socket.connected);
  
  // State variable for storing and displaying messages in the AssistantFeed.
  // Each message is an object, e.g., { type: 'transcript', text: 'Hello', speaker: 'User1', ts: 1678886400000 }
  const [messages, setMessages] = useState([]);
  
  // State variable for application settings, controlled by SettingsPanel.
  // TODO: Consider persisting settings to localStorage or backend user preferences.
  const [settings, setSettings] = useState({
    whisperModel: 'base',       // Default Whisper model for transcription.
    llmModel: 'dummy_llm',      // Default LLM model for assistant responses.
    visionActive: false,        // Flag to enable/disable vision analysis features.
    transcriptionActive: false, // Flag to enable/disable live transcription.
    // TODO: Add setting for simulation_mode toggle in Python backend.
  });

  // Effect hook for managing Socket.IO connection and event listeners.
  useEffect(() => {
    // Attempt to connect the socket when the component mounts.
    // Configuration Note: `socket.connect()` is called here. `autoConnect: false` in socket.js allows this manual control.
    socket.connect();

    // Event handler for successful connection.
    function onConnect() {
      setIsConnected(true);
      setMessages(prev => [...prev, { type: 'system', text: 'Connected to server.' , ts: Date.now() }]);
    }

    // Event handler for disconnection.
    function onDisconnect() {
      setIsConnected(false);
      setMessages(prev => [...prev, { type: 'system', text: 'Disconnected from server.' , ts: Date.now() }]);
    }

    // Data Flow: Event handler for 'transcript' messages from the server.
    // Receives transcribed text and speaker information.
    function onTranscript(data) {
      // TODO: Enhance message display logic. Could append to the last message if same speaker and recent.
      setMessages(prev => [...prev, { type: 'transcript', text: data.text, speaker: data.speaker, ts: data.ts }]);
    }

    // Data Flow: Event handler for 'assistant' messages (LLM responses, insights) from the server.
    function onAssistant(data) {
      setMessages(prev => [...prev, { type: data.type || 'assistant', text: data.message, data: data.data, ts: Date.now() }]);
    }
    
    // Data Flow: Event handler for 'slide_text' (OCR results) from the server.
    function onSlideText(data) {
      setMessages(prev => [...prev, { type: 'slide_text', text: data.text, ts: data.ts }]);
    }

    // Data Flow: Event handler for generic status or error messages from the Python backend.
    function onPythonStatus(data) {
        // Display Python status messages, useful for debugging or informing user of backend state.
        setMessages(prev => [...prev, { type: data.event || 'system', text: `Python: ${data.message || JSON.stringify(data)}`, ts: Date.now() }]);
    }
    
    // Data Flow: Event handler for error messages from the Node.js backend (e.g., Python not running).
    function onErrorMessage(data) {
        setMessages(prev => [...prev, { type: 'error', text: `Server Error: ${data.message}`, ts: Date.now() }]);
    }

    // Register Socket.IO event listeners.
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('transcript', onTranscript);
    socket.on('assistant', onAssistant);
    socket.on('slide_text', onSlideText);
    socket.on('python_status', onPythonStatus); 
    socket.on('error_message', onErrorMessage); // Listener for explicit error messages from Node server

    // Cleanup function: Remove event listeners and disconnect socket when component unmounts.
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('transcript', onTranscript);
      socket.off('assistant', onAssistant);
      socket.off('slide_text', onSlideText);
      socket.off('python_status', onPythonStatus);
      socket.off('error_message', onErrorMessage);
      socket.disconnect();
    };
  }, []); // Empty dependency array ensures this effect runs only once on mount and cleanup on unmount.

  /**
   * Handles sending a user's question to the backend.
   * @param {string} text - The question text entered by the user.
   */
  const handleSendMessage = (text) => {
    if (text.trim() === '') return; // Ignore empty messages.
    const userMessage = { type: 'user_question', text: text, speaker: 'User', ts: Date.now() };
    setMessages(prevMessages => [...prevMessages, userMessage]); // Display user's message locally.
    // Data Flow: Emit 'user_question' event to the server with the prompt.
    socket.emit('user_question', { prompt: text });
  };
  
  /**
   * Handles updates to application settings from the SettingsPanel.
   * Updates local settings state and emits 'settings_update' to the server.
   * Also sends specific start/stop commands for transcription and vision based on toggle changes.
   * @param {object} newSetting - An object containing the setting key and its new value.
   *                              Example: { whisperModel: "small" } or { transcriptionActive: true }
   */
  const handleSettingsUpdate = (newSetting) => {
    // Update local state first for responsiveness.
    setSettings(prev => ({ ...prev, ...newSetting }));
    
    // Data Flow: Emit 'settings_update' to the server with all changed settings.
    // Python backend will handle individual setting changes.
    socket.emit('settings_update', newSetting);

    // For boolean toggles that control backend processes (transcription, vision),
    // send explicit start/stop commands.
    // TODO: Ensure Python backend correctly handles these commands idempotently or based on current state.
    if (newSetting.hasOwnProperty('transcriptionActive')) {
        // Data Flow: Send start/stop command for transcription.
        socket.emit(newSetting.transcriptionActive ? 'start_transcription' : 'stop_transcription');
    }
    if (newSetting.hasOwnProperty('visionActive')) {
        // Data Flow: Send start/stop command for vision analysis.
        socket.emit(newSetting.visionActive ? 'start_vision' : 'stop_vision');
    }
    // TODO: If a 'simulation_mode' toggle is added to settings, emit `update_setting` for it.
    // Example: if (newSetting.hasOwnProperty('simulation_mode')) {
    //   socket.emit('settings_update', { simulation_mode: newSetting.simulation_mode });
    // }
  };

  // Render the main application layout.
  return (
    <div className="flex h-screen bg-gray-900 text-white">
      {/* Left panel for settings */}
      <div className="w-1/4 p-4 border-r border-gray-700 overflow-y-auto">
        <SettingsPanel settings={settings} onUpdate={handleSettingsUpdate} isConnected={isConnected} />
      </div>
      {/* Right panel for assistant feed (messages and input) */}
      <div className="flex-1 flex flex-col p-4">
        <AssistantFeed messages={messages} onSendMessage={handleSendMessage} />
      </div>
    </div>
  );
}

export default App;
