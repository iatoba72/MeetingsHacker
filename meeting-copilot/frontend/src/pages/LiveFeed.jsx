// meeting-copilot/frontend/src/pages/LiveFeed.jsx
import React, { useState, useEffect, useCallback, useRef } from 'react'; // Added useRef
import { socket } from '../socket';
import AssistantFeed from '../components/AssistantFeed';
// import LiveControls from '../components/LiveControls';

function LiveFeed({ currentMeetingId, requestContextSetup, theme = 'dark' }) { // Added theme prop
  const [messages, setMessages] = useState([]);
  const messagesEndRef = useRef(null);
  const [userScrolledUp, setUserScrolledUp] = useState(false);
  const scrollableContainerRef = useRef(null); // Ref for the scrollable messages container

  // TODO: Add state for transcriptionActive, visionActive if controlled from this page
  // const [transcriptionActive, setTranscriptionActive] = useState(false); 
  // const [visionActive, setVisionActive] = useState(false);

  // Memoize handlers to avoid re-registering listeners on every render if not necessary
  const onTranscript = useCallback((data) => {
    setMessages(prev => [...prev, { type: 'transcript', text: data.text, speaker: data.speaker, ts: data.ts }]);
  }, []);

  const onAssistant = useCallback((data) => {
    setMessages(prev => [...prev, { type: data.type || 'assistant', text: data.message, data: data.data, ts: Date.now() }]);
  }, []);

  const onSlideText = useCallback((data) => {
    setMessages(prev => [...prev, { type: 'slide_text', text: data.text, ts: data.ts }]);
  }, []);

  const onPythonStatus = useCallback((data) => {
    setMessages(prev => [...prev, { type: data.event || 'system', text: `Python: ${data.message || JSON.stringify(data)}`, ts: Date.now() }]);
  }, []);

  const onErrorMessage = useCallback((data) => {
    setMessages(prev => [...prev, { type: 'error', text: `Server Error: ${data.message}`, ts: Date.now() }]);
  }, []);


  useEffect(() => {
    // Socket event listeners specific to LiveFeed
    socket.on('transcript', onTranscript);
    socket.on('assistant', onAssistant);
    socket.on('slide_text', onSlideText);
    socket.on('python_status', onPythonStatus);
    socket.on('error_message', onErrorMessage);

    // Initial system message for this page
    setMessages(prev => [...prev, { type: 'system', text: 'Live Feed page loaded. Waiting for events...', ts: Date.now() }]);
    
    // TODO: Fetch initial state for transcriptionActive/visionActive from config if needed
    // This might involve an API call or receiving initial settings via a socket event.

    return () => {
      // Cleanup: remove listeners specific to this page
      socket.off('transcript', onTranscript);
      socket.off('assistant', onAssistant);
      socket.off('slide_text', onSlideText);
      socket.off('python_status', onPythonStatus);
      socket.off('error_message', onErrorMessage);
    };
  }, [onTranscript, onAssistant, onSlideText, onPythonStatus, onErrorMessage]); // Dependencies for useEffect

  const handleSendMessage = (text) => {
    if (text.trim() === '') return;
    const userMessage = { type: 'user_question', text: text, speaker: 'User', ts: Date.now() };
    setMessages(prevMessages => [...prevMessages, userMessage]);
    socket.emit('user_question', { prompt: text });
  };

  // TODO: Implement handlers for LiveControls if added
  // const handleToggleTranscription = () => {
  //   const newState = !transcriptionActive;
  //   setTranscriptionActive(newState);
  //   socket.emit(newState ? 'start_transcription' : 'stop_transcription');
  //   setMessages(prev => [...prev, { type: 'system', text: `Transcription ${newState ? 'started' : 'stopped'}.`, ts: Date.now() }]);
  // };

  // const handleToggleVision = () => {
  //   const newState = !visionActive;
  //   setVisionActive(newState);
  //   socket.emit(newState ? 'start_vision' : 'stop_vision');
  //   setMessages(prev => [...prev, { type: 'system', text: `Vision analysis ${newState ? 'started' : 'stopped'}.`, ts: Date.now() }]);
  // };

  useEffect(() => {
    if (!userScrolledUp && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, userScrolledUp]);

  const handleScroll = () => {
    const container = scrollableContainerRef.current;
    if (container) {
      const { scrollTop, scrollHeight, clientHeight } = container;
      // Consider user scrolled up if they are more than a few pixels from the bottom
      const atBottom = scrollHeight - scrollTop - clientHeight <= 5;
      if (atBottom) {
        setUserScrolledUp(false);
      } else {
        setUserScrolledUp(true);
      }
    }
  };
  
  // Wrap AssistantFeed in a div that can be the scrollable container
  // AssistantFeed itself is responsible for rendering individual messages and the input bar.
  // The messagesEndRef should be placed after the list of messages within AssistantFeed or its child.
  
  const scrollToBottomSmooth = () => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
    setUserScrolledUp(false); // Reset the state after manually scrolling down
  };

  return (
    <div className={`flex flex-col h-full ${theme === 'dark' ? 'bg-slate-900' : 'bg-slate-100'}`}>
      {/* 
      <LiveControls 
        transcriptionActive={transcriptionActive} // TODO: Pass these if implementing controls here
        visionActive={visionActive} // TODO: Pass these if implementing controls here
        onToggleTranscription={handleToggleTranscription}
        onToggleVision={handleToggleVision}
      /> 
      */}
      <div 
        ref={scrollableContainerRef}
        onScroll={handleScroll} 
        className="flex-grow overflow-y-auto p-4 space-y-4 relative" // Added relative for button positioning
      >
        <AssistantFeed 
          messages={messages} 
          onSendMessage={handleSendMessage} 
          messagesEndRef={messagesEndRef} 
          theme={theme} // Pass theme to AssistantFeed
        />
        {userScrolledUp && (
          <button 
            onClick={scrollToBottomSmooth}
            className={`absolute bottom-20 right-6 p-3 rounded-full shadow-lg transition-opacity duration-300 hover:opacity-100
                        ${theme === 'dark' ? 'bg-blue-600 text-white hover:bg-blue-500' 
                                         : 'bg-indigo-600 text-white hover:bg-indigo-500'}
                        ${userScrolledUp ? 'opacity-80' : 'opacity-0'}`}
            aria-label="Scroll to latest messages"
            title="Scroll to latest messages"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

export default LiveFeed;
