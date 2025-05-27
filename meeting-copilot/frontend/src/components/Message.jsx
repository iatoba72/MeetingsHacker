// frontend/src/components/Message.jsx - Component for rendering individual messages in the feed.
// Displays messages with different styles based on their type (user, assistant, system, etc.).

import React, { useEffect, useRef } from 'react'; // Added useEffect, useRef
import ReactMarkdown from 'react-markdown'; // Library to render Markdown content.
import hljs from 'highlight.js'; // Import highlight.js

/**
 * Generates a hash code from a string.
 * Used for assigning a consistent color to a speaker.
 * @param {string} str - The input string.
 * @returns {number} A hash code.
 */
const hashCode = (str) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32bit integer
  }
  return Math.abs(hash);
};

/**
 * Message component.
 * Renders a single message bubble with appropriate styling and content.
 * @param {object} props - Component props.
 * @param {object} props.message - The message object to render.
 * @param {string} props.message.type - The type of the message (e.g., 'user_question', 'transcript', 'assistant', 'system', 'error').
 * @param {string} props.message.text - The main text content of the message. Supports Markdown.
 * @param {string} [props.message.speaker] - The speaker associated with the message (for transcripts).
 * @param {number} [props.message.ts] - Timestamp of the message (optional, for display).
 * @param {object} [props.message.data] - Any additional data associated with the message (not directly rendered but could be used).
 * @returns {JSX.Element} The rendered Message component.
 */
function Message({ message }) {
  /**
   * Determines the Tailwind CSS classes for the message bubble based on its type.
   * This allows visual differentiation between user messages, assistant responses, system notifications, etc.
   * @returns {string} Tailwind CSS classes for styling the message bubble.
   */
  const getBubbleClass = () => {
    // Styling is based on message type.
    // `self-end` aligns user messages to the right, `self-start` for others to the left.
    // `self-center` for system messages.
    switch (message.type) {
      case 'user_question':
        return 'bg-blue-600 text-white self-end'; // User's own questions.
      case 'transcript':
        return 'bg-gray-600 text-gray-100 self-start text-sm'; // Live transcript segments.
      case 'insight': // LLM-generated insights.
      case 'summary': // LLM-generated summaries.
      case 'answer':  // Direct answers from LLM to user questions.
        return 'bg-green-700 text-white self-start';
      case 'slide_text': // OCR text from slides.
        return 'bg-purple-600 text-gray-100 self-start text-sm italic';
      case 'system': // System messages (e.g., connection status, Python worker status).
        return 'bg-yellow-500 text-black self-center text-xs italic rounded-full px-3 py-1';
      case 'error': // Error messages from the backend or frontend.
      case 'critical': // Critical errors from Python.
        return 'bg-red-700 text-white self-start font-medium';
      case 'warning': // Warnings from Python.
        return 'bg-yellow-600 text-black self-start';
      default: // Default styling for any other message types.
        return 'bg-gray-700 text-white self-start';
    }
  };

  /**
   * Generates a prefix for the message content based on its type (e.g., speaker ID for transcripts).
   * @returns {string} The prefix string to be displayed before the message text.
   */
  const getPrefix = () => {
    // Speaker name is now handled separately with a color badge for 'transcript' type
    if (message.type === 'transcript') return ''; // No text prefix, speaker badge will be used
    if (message.type === 'insight') return "💡 Insight: ";
    if (message.type === 'summary') return "📝 Summary: ";
    if (message.type === 'answer') return "💬 Answer: ";
    if (message.type === 'slide_text') return "🖼️ Slide: ";
    return '';
  }

  const messageRef = useRef(null);

  useEffect(() => {
    if (messageRef.current) {
      const codeBlocks = messageRef.current.querySelectorAll('pre code');
      codeBlocks.forEach((block) => {
        hljs.highlightElement(block);
      });
    }
  }, [message.text]); // Rerun if message text changes

  // Base styling for all message bubbles.
  const bubbleBaseStyle = "max-w-2xl my-2 p-3 rounded-lg shadow-md";

  const speakerName = message.speaker || (message.type === 'user_question' ? 'User' : 'System');
  const speakerColor = hashCode(speakerName);
  const showSpeaker = message.type === 'transcript' || message.type === 'user_question' || (message.type === 'assistant' && message.speaker);


  return (
    <div ref={messageRef} className={`${bubbleBaseStyle} ${getBubbleClass()}`}>
      {showSpeaker && (
        <span 
          style={{ backgroundColor: `hsl(${speakerColor % 360}, 60%, 35%)` }}
          className="text-xs font-medium text-white px-2 py-0.5 rounded-full mr-2 mb-1 inline-block"
        >
          {speakerName}
        </span>
      )}
      {/* Display the prefix (e.g., speaker) if any. */}
      {getPrefix() && <span className="font-semibold mr-1">{getPrefix()}</span>}
      
      {/* Render message media if available */}
      {message.media && (
        <img src={message.media} alt="Slide preview" className="max-w-xs md:max-w-sm rounded-lg shadow my-2 border border-slate-600" />
      )}

      {/* `whitespace-pre-wrap` for text content, `prose` for markdown styling */}
      <div className="prose prose-sm prose-invert max-w-none whitespace-pre-wrap">
        <ReactMarkdown>
          {message.text}
        </ReactMarkdown>
      </div>
      {/* Display timestamp if available, formatted to local time string. */}
      {message.ts && (
        <div className={`text-xs mt-1 ${message.type === 'user_question' ? 'text-blue-200' : 'text-slate-400'}`}>
            {new Date(message.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </div>
      )}
    </div>
  );
}

export default Message;
