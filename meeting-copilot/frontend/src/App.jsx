// frontend/src/App.jsx - Main application component for the AI Meeting Copilot UI.
// Manages global state (like current page), WebSocket connections (optional here), and renders primary UI layout.

import React, { useState, useEffect, useCallback } from 'react';
import { socket } from './socket'; // Socket.IO client instance
import LiveFeed from './pages/LiveFeed'; 
import Settings from './pages/Settings'; 
import BackendConfigPage from './pages/BackendConfigPage'; 
import MeetingContextModal from './components/MeetingContextModal'; // Import the modal

function App() {
  const [currentPage, setCurrentPage] = useState('LiveFeed');
  const [isConnected, setIsConnected] = useState(socket.connected);
  
  // Meeting lifecycle and context state
  const [showContextModal, setShowContextModal] = useState(false);
  const [currentMeetingId, setCurrentMeetingId] = useState(null);
  const [currentMeetingContext, setCurrentMeetingContext] = useState(null); // Stores {role, purpose, etc.}
  
  // Data for modal and potentially other parts of the app
  const [config, setConfig] = useState(null); // Full config from /api/config
  const [availableMeetings, setAvailableMeetings] = useState([]); // From /api/meetings
  
  const [toastMessage, setToastMessage] = useState(null); // For global toasts like 'restart_required'
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');

  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === 'light') {
      root.classList.remove('dark');
      root.classList.add('light');
    } else {
      root.classList.remove('light');
      root.classList.add('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prevTheme => prevTheme === 'dark' ? 'light' : 'dark');
  };

  // Fetch initial data needed by App and Modal
  const fetchAppAndModalData = useCallback(async () => {
    try {
      const [configRes, meetingsRes] = await Promise.all([
        fetch('/api/config'),
        fetch('/api/meetings')
      ]);

      if (configRes.ok) {
        const configData = await configRes.json();
        setConfig(configData);
      } else {
        console.error("Failed to fetch app config:", configRes.status);
        setToastMessage("Error: Could not load initial application configuration.");
      }

      if (meetingsRes.ok) {
        const meetingsData = await meetingsRes.json();
        setAvailableMeetings(meetingsData);
      } else {
        console.error("Failed to fetch available meetings:", meetingsRes.status);
        // Non-critical, modal will just show empty list
      }
    } catch (error) {
      console.error("Error fetching app/modal data:", error);
      setToastMessage(`Error: ${error.message}`);
    }
  }, []);

  useEffect(() => {
    fetchAppAndModalData(); // Fetch on initial load

    function onConnect() { setIsConnected(true); }
    function onDisconnect() { setIsConnected(false); }
    
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);

    // Listener for when a meeting is successfully started by the backend
    socket.on('meeting_started', (data) => {
      console.log('Socket event: meeting_started', data);
      setCurrentMeetingId(data.meetingId);
      // currentMeetingContext is already set optimistically in handleStartMeeting
      // or could be updated from data if backend modifies/confirms it.
      // setCurrentMeetingContext(data.context_received); 
      setShowContextModal(false); // Ensure modal is closed
      setCurrentPage('LiveFeed'); // Navigate to LiveFeed
      setToastMessage(`Meeting ${data.meetingId} started successfully!`);
      setTimeout(() => setToastMessage(null), 3000);
    });

    // Global listener for restart_required events
    socket.on('restart_required', (data) => {
      console.log('Socket event: restart_required', data);
      const componentName = data.component || "system";
      const reason = data.reason || "apply configuration changes";
      setToastMessage(`Restart required for ${componentName} to ${reason}. Please save any work and restart the assistant service.`);
      // This toast will persist until manually closed.
    });
    
    // Socket.IO event for config being updated on server (e.g. by another client)
    // This is useful if BackendConfigPage is not the only way settings can change.
    socket.on('config_updated', (newConfig) => {
        console.log('Socket event: config_updated (external)', newConfig);
        setConfig(newConfig); // Update App's copy of config
        // Optionally, inform user that config was updated elsewhere.
        // BackendConfigPage itself listens to 'settings_update' for specific sections if it's open.
    });


    // If socket is not already connected and autoConnect is false, connect it.
    if (!socket.connected) {
      socket.connect();
    }

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('meeting_started');
      socket.off('restart_required');
      socket.off('config_updated');
    };
  }, [fetchAppAndModalData]);
  
  const handleStartMeeting = (contextDataFromModal) => {
    console.log("Attempting to start meeting with context:", contextDataFromModal);
    
    const payloadForSocket = {
      meetingId: contextDataFromModal.meetingId, // This is the customMeetingId from modal, or undefined
      context: { // This object becomes CURRENT_CONTEXT in Python
        role: contextDataFromModal.role,
        purpose: contextDataFromModal.purpose,
        meetings_ids_for_context: contextDataFromModal.meetings_for_context, // Python expects meetings_ids_for_context
        presetId: contextDataFromModal.presetId 
      }
    };
    
    socket.emit('start_meeting', payloadForSocket);
    // Optimistically set context with what was sent from modal.
    // Backend will confirm with 'meeting_started' event and provide the definitive meetingId.
    setCurrentMeetingContext(contextDataFromModal); 
    setShowContextModal(false); // Close modal immediately
  };

  const requestContextSetup = () => {
    // Potentially fetch latest presets/meetings here if modal hasn't been opened in a while
    // For now, assume fetchAppAndModalData on load is sufficient.
    setShowContextModal(true);
  };

  // Navigation button styling
  const navButtonBase = "px-3 py-2 rounded-md text-sm font-medium transition-colors";
  const activeNavButton = "bg-blue-600 text-white";
  const inactiveNavButton = "text-gray-300 hover:bg-gray-700 hover:text-white";
  // Ensure Tailwind dark mode classes work as expected by having 'dark' class on html/body
  // The main div class below dynamically sets bg and text based on theme.
  return (
    <div className={`flex flex-col h-screen relative ${theme === 'dark' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-black'}`}>
      {/* Global Toast Area */}
      {toastMessage && (
        <div className="absolute top-0 left-1/2 transform -translate-x-1/2 mt-4 w-auto max-w-md z-[100]">
          <div className={`p-3 rounded-md shadow-lg flex items-center justify-between ${theme === 'dark' ? 'bg-red-600 text-white' : 'bg-red-500 text-white'}`}>
            <span className="text-sm">{toastMessage}</span>
            <button 
              onClick={() => setToastMessage(null)} 
              className={`ml-4 text-xl font-semibold ${theme === 'dark' ? 'hover:text-red-200' : 'hover:text-red-100'}`}
              aria-label="Close toast"
            >
              &times;
            </button>
          </div>
        </div>
      )}

      <nav className={`${theme === 'dark' ? 'bg-gray-800' : 'bg-gray-200'} p-3 shadow-md`}>
        <div className="container mx-auto flex justify-between items-center">
          <div className={`text-lg font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>AI Meeting Copilot</div>
          <div className="space-x-2 flex items-center"> {/* Added flex items-center */}
            <button 
              onClick={() => setCurrentPage('LiveFeed')}
              className={`${navButtonBase} ${currentPage === 'LiveFeed' ? (theme === 'dark' ? activeNavButton : 'bg-indigo-600 text-white') : (theme === 'dark' ? inactiveNavButton : 'text-gray-700 hover:bg-gray-300')}`}
            >
              Live Feed
            </button>
            <button 
              onClick={() => requestContextSetup()} 
              className={`${navButtonBase} ${theme === 'dark' ? inactiveNavButton : 'text-gray-700 hover:bg-gray-300'} border ${theme === 'dark' ? 'border-blue-500 hover:bg-blue-500 hover:text-white' : 'border-indigo-500 hover:bg-indigo-500 hover:text-white'}`}
            >
              {currentMeetingId ? "Switch Context" : "Start New Meeting"}
            </button>
            <button 
              onClick={() => setCurrentPage('Settings')}
              className={`${navButtonBase} ${currentPage === 'Settings' ? (theme === 'dark' ? activeNavButton : 'bg-indigo-600 text-white') : (theme === 'dark' ? inactiveNavButton : 'text-gray-700 hover:bg-gray-300')}`}
            >
              Settings
            </button>
            <button 
              onClick={() => setCurrentPage('BackendConfig')}
              className={`${navButtonBase} ${currentPage === 'BackendConfig' ? (theme === 'dark' ? activeNavButton : 'bg-indigo-600 text-white') : (theme === 'dark' ? inactiveNavButton : 'text-gray-700 hover:bg-gray-300')}`}
            >
              Backend Config
            </button>
            <button
              onClick={toggleTheme}
              className={`${navButtonBase} ${theme === 'dark' ? inactiveNavButton : 'text-gray-700 hover:bg-gray-300'}`}
              title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
            >
              {theme === 'dark' ? '☀️ Light' : '🌙 Dark'}
            </button>
          </div>
          <div className={`text-sm ${isConnected ? (theme === 'dark' ? 'text-green-400' : 'text-green-600') : (theme === 'dark' ? 'text-red-400' : 'text-red-600')}`}>
            {isConnected ? '● Connected' : '○ Disconnected'}
          </div>
        </div>
      </nav>

      <main className="flex-grow p-4 overflow-y-auto"> {/* Content area will inherit text color from main div */}
        {currentPage === 'LiveFeed' && <LiveFeed currentMeetingId={currentMeetingId} requestContextSetup={requestContextSetup} theme={theme} />}
        {currentPage === 'Settings' && <Settings theme={theme} />}
        {currentPage === 'BackendConfig' && <BackendConfigPage theme={theme} />} {/* Pass theme if BackendConfigPage needs to adapt */}
      </main>

      <MeetingContextModal
        show={showContextModal}
        onClose={() => setShowContextModal(false)}
        onStartMeeting={handleStartMeeting}
        contextPresets={config?.contextPresets || []}
        availableMeetings={availableMeetings || []}
      />
    </div>
  );
}

export default App;
