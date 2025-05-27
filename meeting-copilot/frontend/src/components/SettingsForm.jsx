// meeting-copilot/frontend/src/components/SettingsForm.jsx
import React, { useState, useEffect } from 'react';

// Helper to get nested values safely
const getNestedValue = (obj, path, defaultValue = '') => {
  const value = path.split('.').reduce((acc, part) => acc && acc[part], obj);
  return value === undefined || value === null ? defaultValue : value;
};

function SettingsForm({ section, currentData, onSave }) {
  const [formData, setFormData] = useState({});

  useEffect(() => {
    // Initialize or update formData when currentData or section changes
    // This ensures the form displays the correct section's data
    setFormData(currentData || {});
  }, [currentData, section]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    const keys = name.split('.');

    if (keys.length > 1) {
      setFormData(prev => {
        const newState = { ...prev };
        let currentLevel = newState;
        keys.forEach((key, index) => {
          if (index === keys.length - 1) {
            currentLevel[key] = type === 'checkbox' ? checked : value;
          } else {
            currentLevel[key] = { ...(currentLevel[key] || {}) };
            currentLevel = currentLevel[key];
          }
        });
        return newState;
      });
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: type === 'checkbox' ? checked : value
      }));
    }
  };
  
  const handleLlmEndpointChange = (e, index, field) => {
    const { value } = e.target;
    setFormData(prev => {
      const newEndpoints = [...(prev.llmEndpoints || [])];
      // Ensure the endpoint at the index exists, initialize if not
      while (newEndpoints.length <= index) {
        newEndpoints.push({ name: "", url: "", key: "" }); 
      }
      newEndpoints[index] = { ...newEndpoints[index], [field]: value };
      // Ensure the name field is populated if it's the first endpoint and being created.
      // This is a default for the simplified UI.
      if (index === 0 && !newEndpoints[index].name) {
        newEndpoints[index].name = "local_llm"; // Default name for the first endpoint
      }
      return { ...prev, llmEndpoints: newEndpoints };
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData); 
  };

  if (Object.keys(formData).length === 0 && currentData === null) { // Check if currentData was null initially
    return <div className="text-slate-400">Loading form data or no data available...</div>;
  }
  
  const inputClass = "w-full p-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:ring-blue-500 focus:border-blue-500";
  const labelClass = "block text-sm font-medium text-slate-300 mb-1";
  const fieldsetLegendClass = "text-lg font-medium text-blue-400 px-2";
  const fieldsetClass = "border border-slate-700 p-4 rounded-md space-y-4";

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {section === 'models' && (
        <fieldset className={fieldsetClass}>
          <legend className={fieldsetLegendClass}>AI Model Settings</legend>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label htmlFor="whisperModel" className={labelClass}>Whisper Model</label>
              <select name="whisperModel" id="whisperModel" value={getNestedValue(formData, 'whisperModel', 'base')} onChange={handleChange} className={inputClass}>
                <option value="tiny">Tiny</option>
                <option value="base">Base</option>
                <option value="small">Small</option>
                <option value="medium">Medium</option>
                <option value="large">Large</option>
              </select>
            </div>
            <div>
              <label htmlFor="llmModel" className={labelClass}>LLM Model Name/Path</label>
              <input type="text" name="llmModel" id="llmModel" value={getNestedValue(formData, 'llmModel')} onChange={handleChange} className={inputClass} placeholder="e.g., Mistral7B-Instruct-v0.2-GGUF" />
            </div>
            <div>
              <label htmlFor="ocrMode" className={labelClass}>OCR Mode</label>
              <select name="ocrMode" id="ocrMode" value={getNestedValue(formData, 'ocrMode', 'OFF')} onChange={handleChange} className={inputClass}>
                <option value="OFF">Off</option>
                <option value="OCR">OCR Only</option>
                <option value="OCR_PLUS_DONUT">OCR + Donut (Advanced)</option>
              </select>
            </div>
          </div>
        </fieldset>
      )}

      {section === 'stream' && (
        <fieldset className={fieldsetClass}>
          <legend className={fieldsetLegendClass}>Stream Settings</legend>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label htmlFor="stream.type" className={labelClass}>Stream Type</label>
              <select name="stream.type" id="stream.type" value={getNestedValue(formData, 'stream.type', 'RTMP')} onChange={handleChange} className={inputClass}>
                <option value="RTMP">RTMP</option>
                <option value="NDI">NDI</option>
              </select>
            </div>
            <div>
              <label htmlFor="stream.url" className={labelClass}>Stream URL</label>
              <input type="text" name="stream.url" id="stream.url" value={getNestedValue(formData, 'stream.url')} onChange={handleChange} className={inputClass} placeholder="rtmp://localhost/live/stream or NDI_Source_Name" />
            </div>
          </div>
        </fieldset>
      )}

      {section === 'endpoints' && (
         <fieldset className={fieldsetClass}>
          <legend className={fieldsetLegendClass}>LLM Endpoint Configuration</legend>
          <div>
            <label htmlFor="llmBackend" className={labelClass}>LLM Backend</label>
            <select name="llmBackend" id="llmBackend" value={getNestedValue(formData, 'llmBackend', 'LOCAL')} onChange={handleChange} className={inputClass}>
              <option value="LOCAL">Local (Llama.cpp server)</option>
              <option value="OPENAI">OpenAI API</option>
              <option value="ANTHROPIC">Anthropic API</option>
              {/* <option value="GROK">Grok API</option> TODO: Add if supported */}
              <option value="OLLAMA">Ollama</option>
              <option value="CUSTOM_API">Custom API</option>
            </select>
          </div>
          <p className="text-xs text-slate-400 mt-1">For local backends, ensure the server is running. For cloud APIs, ensure endpoints and keys are set below.</p>
          
          <h3 className="text-md font-semibold text-slate-200 mt-4 pt-2 border-t border-slate-700">Primary Endpoint Details</h3>
          <p className="text-xs text-slate-400 mb-2">Currently, only the first endpoint in the array is configurable here. Full array management is a TODO.</p>
          
          {/* Simplified: Edit first endpoint */}
          <div>
            <label htmlFor="llmEndpoints.0.name" className={labelClass}>Endpoint Name</label>
            <input type="text" name="llmEndpoints.0.name" id="llmEndpoints.0.name" value={getNestedValue(formData, 'llmEndpoints.0.name', 'local_llm')} onChange={(e) => handleLlmEndpointChange(e, 0, 'name')} className={inputClass} placeholder="e.g., local_mistral, openai_gpt4" />
          </div>
          <div>
            <label htmlFor="llmEndpoints.0.url" className={labelClass}>Endpoint URL</label>
            <input type="text" name="llmEndpoints.0.url" id="llmEndpoints.0.url" value={getNestedValue(formData, 'llmEndpoints.0.url')} onChange={(e) => handleLlmEndpointChange(e, 0, 'url')} className={inputClass} placeholder="http://localhost:8080/completion" />
          </div>
          <div>
            <label htmlFor="llmEndpoints.0.key" className={labelClass}>API Key (if required)</label>
            <input type="password" name="llmEndpoints.0.key" id="llmEndpoints.0.key" value={getNestedValue(formData, 'llmEndpoints.0.key')} onChange={(e) => handleLlmEndpointChange(e, 0, 'key')} className={inputClass} placeholder="Enter API Key" />
          </div>
        </fieldset>
      )}

      {section === 'prompts' && (
        <fieldset className={fieldsetClass}>
          <legend className={fieldsetLegendClass}>Prompt Engineering (Main Prompts)</legend>
          <div>
            <label htmlFor="quickPrompt" className={labelClass}>Quick Insight Prompt</label>
            <textarea name="quickPrompt" id="quickPrompt" value={getNestedValue(formData, 'quickPrompt')} onChange={handleChange} rows="4" className={inputClass} placeholder="e.g., Provide a quick insight based on the latest transcript: {transcript}"></textarea>
          </div>
          <div>
            <label htmlFor="summaryPrompt" className={labelClass}>Summary Prompt</label>
            <textarea name="summaryPrompt" id="summaryPrompt" value={getNestedValue(formData, 'summaryPrompt')} onChange={handleChange} rows="6" className={inputClass} placeholder="e.g., Summarize the meeting so far... based on: {transcript} and slide content: {slides}"></textarea>
          </div>
        </fieldset>
      )}
      
      <button 
        type="submit" 
        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 px-4 rounded-md transition duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-75"
      >
        Save Settings for {section.charAt(0).toUpperCase() + section.slice(1)}
      </button>
    </form>
  );
}

export default SettingsForm;
