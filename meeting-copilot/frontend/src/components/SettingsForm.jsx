// meeting-copilot/frontend/src/components/SettingsForm.jsx
import React, { useState, useEffect } from 'react';

function SettingsForm({ currentConfig, onSave }) {
  const [formData, setFormData] = useState({});

  useEffect(() => {
    // Initialize formData when currentConfig is loaded or changed
    // Exclude 'templates' as it's handled by TemplateManager
    const { templates, ...mainConfig } = currentConfig || {};
    setFormData(mainConfig);
  }, [currentConfig]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    
    if (name.startsWith("stream.")) {
      const streamField = name.split(".")[1];
      setFormData(prev => ({
        ...prev,
        stream: { ...prev.stream, [streamField]: type === 'checkbox' ? checked : value }
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: type === 'checkbox' ? checked : value
      }));
    }
  };
  
  // Special handler for llmEndpoints as it's an array of objects
  // This is a simplified example: allows editing the URL of the *first* endpoint.
  // A real UI would need add/remove/edit capabilities for multiple endpoints.
  const handleLlmEndpointChange = (e, index) => {
    const { name, value } = e.target; // 'name' here would be 'url' or 'key'
    setFormData(prev => {
      const newEndpoints = [...(prev.llmEndpoints || [])];
      if (newEndpoints[index]) {
        newEndpoints[index] = { ...newEndpoints[index], [name]: value };
      } else {
        // Initialize if not existing, assuming 'name' of endpoint is fixed for this example
        newEndpoints[index] = { name: "local_llm", url: "", key: "", [name]: value };
      }
      return { ...prev, llmEndpoints: newEndpoints };
    });
  };


  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData); // Pass only the main config, templates are managed separately
  };

  if (Object.keys(formData).length === 0) {
    return <div className="text-gray-400">Loading form data...</div>;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 bg-gray-800 p-6 rounded-lg shadow-md">
      <h2 className="text-2xl font-semibold text-white mb-6 border-b border-gray-700 pb-3">General Configuration</h2>

      {/* Stream Settings */}
      <fieldset className="border border-gray-700 p-4 rounded-md">
        <legend className="text-lg font-medium text-blue-400 px-2">Stream Settings</legend>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="stream.type" className="block text-sm font-medium text-gray-300 mb-1">Stream Type</label>
            <select name="stream.type" id="stream.type" value={formData.stream?.type || 'RTMP'} onChange={handleChange} className="w-full p-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:ring-blue-500 focus:border-blue-500">
              <option value="RTMP">RTMP</option>
              <option value="NDI">NDI</option>
            </select>
          </div>
          <div>
            <label htmlFor="stream.url" className="block text-sm font-medium text-gray-300 mb-1">Stream URL</label>
            <input type="text" name="stream.url" id="stream.url" value={formData.stream?.url || ''} onChange={handleChange} className="w-full p-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:ring-blue-500 focus:border-blue-500" />
          </div>
        </div>
      </fieldset>

      {/* Model Settings */}
      <fieldset className="border border-gray-700 p-4 rounded-md">
        <legend className="text-lg font-medium text-blue-400 px-2">AI Model Settings</legend>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="whisperModel" className="block text-sm font-medium text-gray-300 mb-1">Whisper Model</label>
            <select name="whisperModel" id="whisperModel" value={formData.whisperModel || 'base'} onChange={handleChange} className="w-full p-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:ring-blue-500 focus:border-blue-500">
              <option value="tiny">Tiny</option>
              <option value="base">Base</option>
              <option value="small">Small</option>
              <option value="medium">Medium</option>
              <option value="large">Large</option>
            </select>
          </div>
          <div>
            <label htmlFor="llmModel" className="block text-sm font-medium text-gray-300 mb-1">LLM Model Name/Path</label>
            <input type="text" name="llmModel" id="llmModel" value={formData.llmModel || ''} onChange={handleChange} className="w-full p-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:ring-blue-500 focus:border-blue-500" placeholder="e.g., Mistral7B-Instruct-v0.2-GGUF" />
          </div>
          <div>
            <label htmlFor="ocrMode" className="block text-sm font-medium text-gray-300 mb-1">OCR Mode</label>
            <select name="ocrMode" id="ocrMode" value={formData.ocrMode || 'OFF'} onChange={handleChange} className="w-full p-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:ring-blue-500 focus:border-blue-500">
              <option value="OFF">Off</option>
              <option value="OCR">OCR Only</option>
              <option value="OCR_PLUS_DONUT">OCR + Donut (Advanced)</option>
            </select>
          </div>
          <div>
            <label htmlFor="llmBackend" className="block text-sm font-medium text-gray-300 mb-1">LLM Backend</label>
            <select name="llmBackend" id="llmBackend" value={formData.llmBackend || 'LOCAL'} onChange={handleChange} className="w-full p-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:ring-blue-500 focus:border-blue-500">
              <option value="LOCAL">Local</option>
              <option value="OPENAI">OpenAI API</option>
              <option value="GROK">Grok API</option>
            </select>
          </div>
        </div>
      </fieldset>
      
      {/* LLM Endpoints - Simplified for first endpoint URL */}
      {/* TODO: Add UI for managing multiple LLM endpoints (add/remove/edit all fields) */}
      <fieldset className="border border-gray-700 p-4 rounded-md">
        <legend className="text-lg font-medium text-blue-400 px-2">LLM Endpoint Configuration</legend>
        {formData.llmEndpoints && formData.llmEndpoints.length > 0 && (
          <div className="space-y-2">
            <label htmlFor="llmEndpoints.0.url" className="block text-sm font-medium text-gray-300 mb-1">
              Primary LLM Endpoint URL ({formData.llmEndpoints[0].name || 'local_llm'})
            </label>
            <input
              type="text"
              name="url" // Field name within the endpoint object
              id="llmEndpoints.0.url"
              value={formData.llmEndpoints[0].url || ''}
              onChange={(e) => handleLlmEndpointChange(e, 0)}
              className="w-full p-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:ring-blue-500 focus:border-blue-500"
              placeholder="http://localhost:8080/completion"
            />
             <label htmlFor="llmEndpoints.0.key" className="block text-sm font-medium text-gray-300 mb-1">
              Primary LLM API Key (if any)
            </label>
            <input
              type="password" // Use password type for keys
              name="key" // Field name within the endpoint object
              id="llmEndpoints.0.key"
              value={formData.llmEndpoints[0].key || ''}
              onChange={(e) => handleLlmEndpointChange(e, 0)}
              className="w-full p-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:ring-blue-500 focus:border-blue-500"
              placeholder="Optional API Key"
            />
          </div>
        )}
        {(!formData.llmEndpoints || formData.llmEndpoints.length === 0) && (
            <p className="text-sm text-gray-400">No LLM endpoints configured. Add one via direct config edit or future UI.</p>
        )}
      </fieldset>

      {/* Prompt Settings */}
      <fieldset className="border border-gray-700 p-4 rounded-md">
        <legend className="text-lg font-medium text-blue-400 px-2">Prompt Engineering</legend>
        <div>
          <label htmlFor="quickPrompt" className="block text-sm font-medium text-gray-300 mb-1">Quick Insight Prompt</label>
          <textarea name="quickPrompt" id="quickPrompt" value={formData.quickPrompt || ''} onChange={handleChange} rows="3" className="w-full p-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:ring-blue-500 focus:border-blue-500" placeholder="e.g., Provide a quick insight based on the latest transcript: {transcript}"></textarea>
        </div>
        <div className="mt-4">
          <label htmlFor="summaryPrompt" className="block text-sm font-medium text-gray-300 mb-1">Summary Prompt</label>
          <textarea name="summaryPrompt" id="summaryPrompt" value={formData.summaryPrompt || ''} onChange={handleChange} rows="4" className="w-full p-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:ring-blue-500 focus:border-blue-500" placeholder="e.g., Summarize the meeting so far... based on: {transcript} and slide content: {slides}"></textarea>
        </div>
      </fieldset>
      
      <button type="submit" className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-4 rounded-md transition duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-50">
        Save Configuration
      </button>
    </form>
  );
}

export default SettingsForm;
