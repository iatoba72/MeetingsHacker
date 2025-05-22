// frontend/src/components/SettingsPanel.jsx - Component for managing application settings.
// Allows users to control transcription, vision, model choices, and other operational parameters.

import React from 'react';

/**
 * SettingsPanel component.
 * Provides UI controls for various application settings.
 * @param {object} props - Component props.
 * @param {object} props.settings - Current application settings object.
 *                                  Example: { whisperModel: 'base', llmModel: 'dummy_llm', ... }
 * @param {function} props.onUpdate - Callback function to update settings in the parent (App.jsx).
 *                                    Takes an object with the setting key and new value.
 * @param {boolean} props.isConnected - Boolean indicating the connection status to the server.
 * @returns {JSX.Element} The rendered SettingsPanel component.
 */
function SettingsPanel({ settings, onUpdate, isConnected }) {

  /**
   * Handles changes to input fields (selects, checkboxes, etc.).
   * Calls the `onUpdate` prop with the changed setting.
   * @param {React.ChangeEvent<HTMLSelectElement | HTMLInputElement>} e - The input change event.
   */
  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    // Data Flow: Call onUpdate with the new setting value.
    // Example: onUpdate({ whisperModel: "small" })
    onUpdate({ [name]: type === 'checkbox' ? checked : value });
  };

  /**
   * Handles file selection for VTT upload.
   * Placeholder for actual file upload logic.
   * @param {React.ChangeEvent<HTMLInputElement>} e - The file input change event.
   */
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      // TODO: Implement actual file upload logic.
      // This could involve:
      // 1. Using FormData to POST the file to an endpoint on the Node.js server (e.g., /upload).
      //    Example: 
      //      const formData = new FormData();
      //      formData.append('vttFile', file);
      //      fetch('/upload', { method: 'POST', body: formData })
      //        .then(response => response.json())
      //        .then(data => console.log('Upload success:', data))
      //        .catch(error => console.error('Upload error:', error));
      // 2. Or, reading the file content and sending it via Socket.IO if small enough (not recommended for large files).
      console.log("File selected for VTT upload:", file.name); // Placeholder log.
      alert("File upload functionality is a placeholder. See TODO in SettingsPanel.jsx.");
      // Optionally, could call onUpdate if file object or content needs to be in global state,
      // but typically upload is a one-time action.
      // Example: onUpdate({ vttFile: file }); 
    }
  };
  
  // Dynamically set text color for connection status.
  const connectionStatusClass = isConnected ? "text-green-400" : "text-red-400";

  return (
    <div className="p-4 bg-gray-800 rounded-lg h-full flex flex-col shadow-lg">
      <h2 className="text-xl font-semibold mb-4 text-white">Settings</h2>
      {/* Display server connection status */}
      <p className={`mb-4 text-sm ${connectionStatusClass}`}>Server: {isConnected ? 'Connected' : 'Disconnected'}</p>

      {/* Live Transcription Toggle */}
      <div className="mb-4">
        <label htmlFor="transcriptionActiveToggle" className="block mb-1 text-sm font-medium text-gray-300">
          Live Transcription
        </label>
        <button
          id="transcriptionActiveToggle"
          onClick={() => onUpdate({ transcriptionActive: !settings.transcriptionActive })}
          // Styling: Button color changes based on transcription state.
          className={`w-full px-3 py-2 rounded font-medium transition-colors duration-150 ${settings.transcriptionActive ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'} text-white`}
        >
          {settings.transcriptionActive ? 'Stop Transcription' : 'Start Transcription'}
        </button>
      </div>

      {/* Vision Analysis Toggle */}
      <div className="mb-4">
        <label htmlFor="visionActiveToggle" className="block mb-1 text-sm font-medium text-gray-300">
          Vision Analysis (OCR)
        </label>
         <button
          id="visionActiveToggle"
          onClick={() => onUpdate({ visionActive: !settings.visionActive })}
          className={`w-full px-3 py-2 rounded font-medium transition-colors duration-150 ${settings.visionActive ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'} text-white`}
        >
          {settings.visionActive ? 'Disable Vision' : 'Enable Vision'}
        </button>
      </div>
      
      {/* Whisper Model Selection Dropdown */}
      {/* Configuration Note: These model options should correspond to models available in the Python backend. */}
      <div className="mb-4">
        <label htmlFor="whisperModel" className="block mb-1 text-sm font-medium text-gray-300">Whisper Model</label>
        <select
          name="whisperModel" // Name attribute is used in handleInputChange to identify the setting.
          id="whisperModel"
          value={settings.whisperModel}
          onChange={handleInputChange}
          className="w-full p-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:ring-blue-500 focus:border-blue-500"
        >
          {/* TODO: Potentially fetch available models from backend or a config file. */}
          <option value="tiny">Tiny</option>
          <option value="base">Base</option>
          <option value="small">Small</option>
          <option value="medium">Medium</option>
          <option value="large">Large</option>
        </select>
      </div>

      {/* LLM Model Selection Dropdown */}
      {/* Configuration Note: These model options should correspond to LLMs configured in the Python backend. */}
      <div className="mb-4">
        <label htmlFor="llmModel" className="block mb-1 text-sm font-medium text-gray-300">LLM Model</label>
        <select
          name="llmModel" // Used in handleInputChange.
          id="llmModel"
          value={settings.llmModel}
          onChange={handleInputChange}
          className="w-full p-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:ring-blue-500 focus:border-blue-500"
        >
          {/* TODO: Fetch available LLM models from backend or config. */}
          <option value="dummy_llm">Dummy LLM (Simulated)</option>
          <option value="mistral7b">Mistral 7B (Local - if configured)</option>
          <option value="llama2_7b">Llama2 7B (Local - if configured)</option>
          <option value="openai_gpt35">OpenAI GPT-3.5 (API)</option>
          <option value="openai_gpt4">OpenAI GPT-4 (API)</option>
        </select>
      </div>
      
      {/* VTT File Upload Section */}
      {/* TODO: Implement full VTT processing pipeline: upload -> Node.js -> Python -> LLM context. */}
      <div className="mb-4">
        <label htmlFor="vttUpload" className="block mb-1 text-sm font-medium text-gray-300">Upload VTT Transcript</label>
        <input 
          type="file" 
          name="vttUpload" 
          id="vttUpload"
          accept=".vtt" // Restrict file type to .vtt.
          onChange={handleFileChange}
          className="w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-100 file:text-blue-700 hover:file:bg-blue-200 cursor-pointer"
        />
      </div>
      
      {/* TODO: Add more settings sections as needed, e.g.:
          - Context Management (e.g., context window size for LLM)
          - Assistant Behavior (e.g., proactiveness, summarization frequency)
          - Simulation Mode Toggle (if applicable for frontend to control Python's SIMULATION_MODE)
      */}

      {/* Footer section for version or status info. */}
      <div className="mt-auto pt-4 border-t border-gray-700">
        <p className="text-xs text-gray-500 text-center">Copilot UI v0.1.0 (Placeholder)</p>
      </div>
    </div>
  );
}

export default SettingsPanel;
