// frontend/src/App.jsx - Main application component for the AI Meeting Copilot UI.
// Manages global state (like current page), WebSocket connections (optional here), and renders primary UI layout.

import React, { useState, useEffect } from 'react';
import { socket } from './socket'; // Socket.IO client instance
import LiveFeed from './pages/LiveFeed'; // Page component for the live feed
import Settings from './pages/Settings'; // Page component for settings management

function App() {
  // State for simple routing: 'LiveFeed' or 'Settings'.
  const [currentPage, setCurrentPage] = useState('LiveFeed');
  // State variable for WebSocket connection status (can be managed here or in LiveFeed).
  const [isConnected, setIsConnected] = useState(socket.connected);

  // Effect hook for managing Socket.IO connection status.
  // This can remain here if multiple pages need to know the connection status,
  // or be moved to LiveFeed.jsx if only that page directly uses the socket events.
  useEffect(() => {
    // Function to handle connection
    function onConnect() {
      setIsConnected(true);
      // Optionally, add a system message to a global context or specific page if needed
      // For now, just updating connection status.
    }
    // Function to handle disconnection
    function onDisconnect() {
      setIsConnected(false);
    }

    // If socket is not already connected and autoConnect is false, connect it.
    if (!socket.connected) {
      socket.connect();
    }

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);

    // Cleanup: remove listeners when App component unmounts.
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      // Note: App.jsx no longer directly handles 'transcript', 'assistant' etc.
      // Those will be handled by LiveFeed.jsx.
      // socket.disconnect(); // Optional: disconnect if App unmounts, though usually App is root.
    };
  }, []); // Runs once on component mount.

  // Navigation button styling
  const navButtonBase = "px-4 py-2 rounded-md text-sm font-medium transition-colors";
  const activeNavButton = "bg-blue-600 text-white";
  const inactiveNavButton = "text-gray-300 hover:bg-gray-700 hover:text-white";

  return (
    <div className="flex flex-col h-screen bg-gray-900 text-white">
      {/* Navigation Bar */}
      <nav className="bg-gray-800 p-3 shadow-md">
        <div className="container mx-auto flex justify-between items-center">
          <div className="text-lg font-semibold">AI Meeting Copilot</div>
          <div className="space-x-3">
            <button 
              onClick={() => setCurrentPage('LiveFeed')}
              className={`${navButtonBase} ${currentPage === 'LiveFeed' ? activeNavButton : inactiveNavButton}`}
            >
              Live Feed
            </button>
            <button 
              onClick={() => setCurrentPage('Settings')}
              className={`${navButtonBase} ${currentPage === 'Settings' ? activeNavButton : inactiveNavButton}`}
            >
              Settings
            </button>
          </div>
          {/* Display connection status in nav for global visibility */}
          <div className={`text-sm ${isConnected ? 'text-green-400' : 'text-red-400'}`}>
            {isConnected ? '● Connected' : '○ Disconnected'}
          </div>
        </div>
      </nav>

      {/* Content Area: Renders the current page based on `currentPage` state */}
      <main className="flex-grow p-4 overflow-y-auto">
        {currentPage === 'LiveFeed' && <LiveFeed />}
        {currentPage === 'Settings' && <Settings />}
      </main>
    </div>
  );
}

export default App;
