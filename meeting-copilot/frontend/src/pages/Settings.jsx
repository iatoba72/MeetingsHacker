import React, { useState, useEffect, useCallback } from 'react';
import socket from '../socket'; // Assuming socket.js is in ../
import SettingsForm from '../components/SettingsForm';
import TemplateManager from '../components/TemplateManager';
import Toast from '../components/Toast'; // Assuming a Toast component exists or will be created

function Settings() {
  const [config, setConfig] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('Models'); // 'Models', 'Endpoints', 'Prompts', 'Stream'
  const [saveStatus, setSaveStatus] = useState(''); // '', 'Saving...', 'Saved!', 'Error!'
  const [showRestartToast, setShowRestartToast] = useState(false);
  const [restartMessage, setRestartMessage] = useState('');

  const fetchConfig = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setSaveStatus('');
    try {
      const response = await fetch('/api/config');
      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`HTTP error! status: ${response.status}, body: ${errorBody}`);
      }
      const data = await response.json();
      setConfig(data);
    } catch (e) {
      console.error("Failed to fetch config:", e);
      setError(e.message);
      setConfig({}); // Fallback to empty config to prevent crashing children
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  useEffect(() => {
    if (!socket.connected) {
      socket.connect();
    }
    const handleRestartRequired = (data) => {
      setRestartMessage(`Configuration change for ${data.component || 'a component'} requires an assistant restart to apply fully. Some changes may apply partially without a restart.`);
      setShowRestartToast(true);
    };
    socket.on('restart_required', handleRestartRequired);
    return () => {
      socket.off('restart_required', handleRestartRequired);
    };
  }, []);

  const handleSaveConfig = async (updatedConfigData) => {
    setSaveStatus('Saving...');
    setError(null);
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
      setConfig(savedData); // Update local state with the saved config
      setSaveStatus('Configuration saved successfully!');
      setTimeout(() => setSaveStatus(''), 3000); // Clear status after 3s
    } catch (e) {
      console.error("Failed to save config:", e);
      setError(e.message);
      setSaveStatus('Failed to save configuration.');
    }
  };

  const handleTemplatesUpdate = (updatedTemplates) => {
    if (config) {
      const newConfig = { ...config, templates: updatedTemplates };
      setConfig(newConfig); // Update local state immediately for responsiveness
      handleSaveConfig(newConfig); // Then save the entire config
    }
  };
  
  const tabButtonClasses = (tabName) => 
    `px-4 py-2 rounded-md text-sm font-medium transition-colors ` +
    (activeTab === tabName 
      ? 'bg-slate-700 text-white' 
      : 'text-slate-300 hover:bg-slate-800 hover:text-white');

  if (isLoading) return <div className="p-4 text-lg text-white">Loading configuration...</div>;
  if (error && !config) return <div className="p-4 text-lg text-red-400">Error loading settings: {error}</div>;
  if (!config && !isLoading) return <div className="p-4 text-lg text-white">No configuration loaded.</div>;

  return (
    <div className="container mx-auto p-4 space-y-6 max-w-4xl">
      <h1 className="text-3xl font-bold text-white mb-8">Application Settings</h1>

      {showRestartToast && (
        <Toast
          message={restartMessage}
          type="warning"
          onDismiss={() => setShowRestartToast(false)}
        />
      )}
      
      {error && ( // Display general errors if config partially loaded
        <div className="bg-red-700/50 border border-red-600 text-red-100 px-4 py-3 rounded relative mb-4" role="alert">
          <strong className="font-bold">Error: </strong>
          <span className="block sm:inline">{error}</span>
        </div>
      )}
      {saveStatus && (
         <div className={`px-4 py-3 rounded relative mb-4 text-white ${saveStatus.startsWith('Failed') ? 'bg-red-700/50 border-red-600' : 'bg-green-700/50 border-green-600'}`} role="status">
         {saveStatus}
       </div>
      )}

      <div className="mb-6 flex space-x-2 border-b border-slate-700 pb-2">
        <button onClick={() => setActiveTab('Models')} className={tabButtonClasses('Models')}>Models</button>
        <button onClick={() => setActiveTab('Endpoints')} className={tabButtonClasses('Endpoints')}>Endpoints</button>
        <button onClick={() => setActiveTab('Prompts')} className={tabButtonClasses('Prompts')}>Prompts</button>
        <button onClick={() => setActiveTab('Stream')} className={tabButtonClasses('Stream')}>Stream</button>
        {/* Add other tabs as needed */}
      </div>

      <div className="bg-slate-800 shadow-xl rounded-lg p-6">
        {config ? (
          <>
            {activeTab === 'Models' && <SettingsForm section="models" currentData={config} onSave={handleSaveConfig} />}
            {activeTab === 'Endpoints' && <SettingsForm section="endpoints" currentData={config} onSave={handleSaveConfig} />}
            {activeTab === 'Prompts' && (
              <div className="space-y-6">
                <SettingsForm section="prompts" currentData={config} onSave={handleSaveConfig} />
                <TemplateManager 
                  currentTemplates={config.templates || []} 
                  onUpdateTemplates={handleTemplatesUpdate} 
                />
              </div>
            )}
            {activeTab === 'Stream' && <SettingsForm section="stream" currentData={config} onSave={handleSaveConfig} />}
          </>
        ) : (
          <p className="text-slate-400">Configuration data is not available.</p>
        )}
      </div>
    </div>
  );
}

export default Settings;
