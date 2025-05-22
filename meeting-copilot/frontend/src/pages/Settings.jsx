// meeting-copilot/frontend/src/pages/Settings.jsx
import React, { useState, useEffect, useCallback } from 'react';
import SettingsForm from '../components/SettingsForm';
import TemplateManager from '../components/TemplateManager';

function Settings() {
  const [config, setConfig] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saveStatus, setSaveStatus] = useState(''); // To show save success/error messages

  const fetchConfig = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setSaveStatus('');
    try {
      const response = await fetch('/api/config');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setConfig(data);
    } catch (e) {
      console.error("Failed to fetch config:", e);
      setError(e.message);
      setConfig({}); // Set to empty or default config on error to prevent crashing children
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const handleSaveConfig = async (updatedConfigData) => {
    setSaveStatus('Saving...');
    setError(null); // Clear previous errors
    try {
      const response = await fetch('/api/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedConfigData),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }
      const savedData = await response.json();
      setConfig(savedData); // Update local state with the saved (and potentially validated/transformed) config
      setSaveStatus('Configuration saved successfully!');
    } catch (e) {
      console.error("Failed to save config:", e);
      setError(e.message);
      setSaveStatus('Failed to save configuration.');
    }
  };
  
  // This function is passed to TemplateManager.
  // It updates the templates array within the main config object and triggers a save for the whole config.
  const handleUpdateTemplates = async (newTemplatesArray) => {
    if (config) {
      const updatedConfigWithNewTemplates = { ...config, templates: newTemplatesArray };
      // Call handleSaveConfig to save the entire configuration object with the new templates array
      await handleSaveConfig(updatedConfigWithNewTemplates);
    } else {
      setSaveStatus("Cannot update templates: main configuration not loaded.");
    }
  };


  if (isLoading) return <div className="p-4 text-lg">Loading configuration...</div>;
  // Error state is handled, but main form might still render with default/empty values if config is set to {} on error.
  // A more robust error display might be needed depending on how SettingsForm handles null/empty config.
  
  return (
    <div className="container mx-auto p-4 space-y-8">
      <h1 className="text-3xl font-bold text-white mb-6">Application Settings</h1>
      
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">
          <strong className="font-bold">Error: </strong>
          <span className="block sm:inline">{error}</span>
        </div>
      )}
      {saveStatus && (
        <div className={`px-4 py-3 rounded relative mb-4 ${error ? 'bg-red-100 border-red-400 text-red-700' : 'bg-green-100 border-green-400 text-green-700'}`} role="status">
          {saveStatus}
        </div>
      )}

      {config ? (
        <>
          <SettingsForm currentConfig={config} onSave={handleSaveConfig} />
          <TemplateManager 
            currentTemplates={config?.templates || []} 
            onUpdateTemplates={handleUpdateTemplates} 
          />
        </>
      ) : (
        !isLoading && <div className="text-lg text-red-400">Could not load configuration to display form.</div>
      )}
    </div>
  );
}

export default Settings;
