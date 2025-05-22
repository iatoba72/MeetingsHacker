// frontend/src/components/AssistantFeed.jsx - Component for displaying messages and handling user input.
// Renders a list of messages and provides an input field for users to send questions.

import React, { useState, useRef, useEffect } from 'react';
import Message from './Message'; // Component to render individual messages

/**
 * AssistantFeed component.
 * Displays a scrollable feed of messages and an input form to send new messages.
 * @param {object} props - Component props.
 * @param {Array<object>} props.messages - Array of message objects to display.
 *                                         Each object should conform to the structure expected by the Message component.
 * @param {function} props.onSendMessage - Callback function to handle sending a new message.
 *                                         Takes the message text (string) as an argument.
 * @returns {JSX.Element} The rendered AssistantFeed component.
 */
function AssistantFeed({ messages, onSendMessage }) {
  // State for the current text in the input field.
  const [inputText, setInputText] = useState('');
  
  // Ref to the DOM element at the end of the messages list, used for auto-scrolling.
  const messagesEndRef = useRef(null);

  /**
   * Scrolls the message feed to the bottom smoothly.
   * Triggered when new messages are added.
   */
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Effect hook to scroll to bottom whenever the 'messages' array changes.
  useEffect(scrollToBottom, [messages]);

  /**
   * Handles the submission of the message input form.
   * Prevents default form submission, calls `onSendMessage` if input is not empty,
   * and clears the input field.
   * @param {React.FormEvent<HTMLFormElement>} e - The form submission event.
   */
  const handleSubmit = (e) => {
    e.preventDefault(); // Prevent page reload on form submission.
    if (inputText.trim()) { // Check if input text is not just whitespace.
      onSendMessage(inputText); // Call the parent's message sending handler.
      setInputText(''); // Clear the input field after sending.
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Message display area */}
      {/* Configuration Note: `overflow-y-auto` enables scrolling for messages. */}
      <div className="flex-grow overflow-y-auto mb-4 p-3 bg-gray-800 rounded-lg shadow-inner">
        {/* Data Flow: Maps over the `messages` prop to render each message using the `Message` component. */}
        {/* `index` is used as a key, which is acceptable for lists not subject to reordering/filtering.
            For more complex scenarios, unique message IDs would be preferable. */}
        {messages.map((msg, index) => (
          <Message key={index} message={msg} />
        ))}
        {/* Empty div at the end of the message list, used as a target for auto-scrolling. */}
        <div ref={messagesEndRef} />
      </div>
      
      {/* Message input form */}
      <form onSubmit={handleSubmit} className="flex items-center mt-auto">
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Ask a question or type your thoughts..." // User-facing placeholder text.
          // Styling: Tailwind CSS classes for appearance.
          className="flex-grow p-3 rounded-l-lg bg-gray-700 text-white border border-gray-600 focus:ring-blue-500 focus:border-blue-500 focus:outline-none transition duration-150 ease-in-out"
          // TODO: Consider adding loading/disabled state to input while waiting for assistant response.
        />
        <button 
          type="submit" 
          className="bg-blue-600 hover:bg-blue-700 p-3 rounded-r-lg text-white font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 transition duration-150 ease-in-out"
          // TODO: Disable button if inputText is empty or if waiting for a response.
        >
          Send
        </button>
      </form>
    </div>
  );
}

export default AssistantFeed;
