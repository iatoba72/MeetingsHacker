// meeting-copilot/frontend/src/pages/LiveFeed.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { socket } from '../socket';
import AssistantFeed from '../components/AssistantFeed';
// import LiveControls from '../components/LiveControls'; // TODO: Consider for transcription/vision toggles

function LiveFeed() {
  const [messages, setMessages] = useState([]);
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

  return (
    <div className="flex flex-col h-full">
      {/* TODO: Add LiveControls component here if created 
      <LiveControls 
        transcriptionActive={transcriptionActive}
        visionActive={visionActive}
        onToggleTranscription={handleToggleTranscription}
        onToggleVision={handleToggleVision}
      /> 
      */}
      <AssistantFeed messages={messages} onSendMessage={handleSendMessage} />
    </div>
  );
}

export default LiveFeed;
