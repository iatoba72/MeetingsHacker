import React, { useState, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid'; // For context preset IDs

// Helper function for consistent styling of form elements (optional)
const inputClassName = "mt-1 block w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-sm shadow-sm placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500";
const labelClassName = "block text-sm font-medium text-gray-300";
const selectClassName = inputClassName; // Selects can use the same styling as inputs
const buttonClassName = "px-4 py-2 text-sm font-medium rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2";
const primaryButtonClassName = `${buttonClassName} text-white bg-blue-600 hover:bg-blue-700 focus:ring-blue-500`;
const secondaryButtonClassName = `${buttonClassName} text-gray-300 bg-gray-600 hover:bg-gray-500 focus:ring-gray-500`;


function BackendConfigPage() {
  const [cfg, setCfg] = useState(null);
  const [initialCfg, setInitialCfg] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isDirty, setIsDirty] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');

  const [availableModels, setAvailableModels] = useState({ whisper: [], llm: [] });
  const [availableMeetings, setAvailableMeetings] = useState([]); // Currently unused, but fetched for future

  const [editingPreset, setEditingPreset] = useState(null); // Preset object being edited
  const [editingPresetIndex, setEditingPresetIndex] = useState(-1); // Index of preset being edited, -1 for new

  const fetchConfigAndSupportingData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setSaveStatus('');
    try {
      const [configRes, modelsRes, meetingsRes] = await Promise.all([
        fetch('/api/config'),
        fetch('/api/models'),
        fetch('/api/meetings') // Placeholder for now
      ]);

      if (!configRes.ok) throw new Error(`HTTP error fetching config! status: ${configRes.status}`);
      const configData = await configRes.json();
      setCfg(configData);
      setInitialCfg(JSON.parse(JSON.stringify(configData)));
      setIsDirty(false);

      if (modelsRes.ok) {
        const modelsData = await modelsRes.json();
        setAvailableModels(modelsData);
      } else {
        console.warn("Could not fetch available models:", modelsRes.status);
      }

      if (meetingsRes.ok) {
        const meetingsData = await meetingsRes.json();
        setAvailableMeetings(meetingsData);
      } else {
        console.warn("Could not fetch available meetings:", meetingsRes.status);
      }

    } catch (e) {
      setError(e);
      setCfg(null);
      setInitialCfg(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfigAndSupportingData();
  }, [fetchConfigAndSupportingData]);

  const handleGenericChange = (keys, value) => {
    setCfg(prevCfg => {
      let newCfg = { ...prevCfg };
      let currentLevel = newCfg;
      keys.forEach((key, index) => {
        if (index === keys.length - 1) {
          currentLevel[key] = value;
        } else {
          if (!currentLevel[key] || typeof currentLevel[key] !== 'object') {
            currentLevel[key] = Number.isInteger(keys[index+1]) ? [] : {}; // Create array if next key is index
          }
          currentLevel = currentLevel[key];
        }
      });
      setIsDirty(true);
      return newCfg;
    });
  };
  
  const handleLlmEndpointChange = (index, field, value) => {
    setCfg(prev => {
      const newEndpoints = prev.llmEndpoints ? [...prev.llmEndpoints] : [];
      // Ensure the array is long enough, fill with empty objects if necessary
      while (newEndpoints.length <= index) {
        newEndpoints.push({});
      }
      if (!newEndpoints[index]) newEndpoints[index] = {}; // Should be redundant due to loop above
      newEndpoints[index] = { ...newEndpoints[index], [field]: value };
      
      setIsDirty(true);
      return { ...prev, llmEndpoints: newEndpoints };
    });
  };


  const handleSave = async () => {
    setSaveStatus("Saving...");
    setError(null);
    try {
      // Construct the payload carefully, only sending what's actually in cfg
      // This assumes cfg structure matches the backend's expected PATCH structure.
      const payloadToSave = { ...cfg }; 
      // delete payloadToSave.someNonConfigState; // Example if cfg had other state

      const response = await fetch('/api/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payloadToSave),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }
      const updatedConfig = await response.json();
      setCfg(updatedConfig);
      setInitialCfg(JSON.parse(JSON.stringify(updatedConfig)));
      setIsDirty(false);
      setSaveStatus("Saved!");
      setTimeout(() => setSaveStatus(''), 2000);
    } catch (e) {
      setError(e);
      setSaveStatus(`Error: ${e.message}`);
    }
  };

  const handleRevert = () => {
    if (initialCfg) {
      setCfg(JSON.parse(JSON.stringify(initialCfg)));
      setIsDirty(false);
      setSaveStatus('Reverted changes.');
      setTimeout(() => setSaveStatus(''), 2000);
    }
  };

  // --- Context Preset Handlers ---
  const handleAddNewPreset = () => {
    setEditingPreset({ id: uuidv4(), name: "New Preset", role: "", purpose: "", defaultMeetings: [] });
    setEditingPresetIndex(-1); // Indicates a new preset
  };

  const handleSelectPresetForEditing = (preset, index) => {
    setEditingPreset(JSON.parse(JSON.stringify(preset))); // Edit a copy
    setEditingPresetIndex(index);
  };
  
  const handlePresetInputChange = (field, value) => {
    setEditingPreset(prev => ({ ...prev, [field]: value }));
  };

  const handlePresetDefaultMeetingsChange = (value) => {
    const meetingsArray = value.split(',').map(m => m.trim()).filter(m => m);
    setEditingPreset(prev => ({ ...prev, defaultMeetings: meetingsArray }));
  };

  const handleSavePreset = () => {
    if (!editingPreset || !editingPreset.name) {
        alert("Preset name cannot be empty.");
        return;
    }
    setCfg(prevCfg => {
      const newPresets = [...(prevCfg.contextPresets || [])];
      if (editingPresetIndex > -1) { // Existing preset
        newPresets[editingPresetIndex] = editingPreset;
      } else { // New preset
        newPresets.push(editingPreset);
      }
      setIsDirty(true);
      return { ...prevCfg, contextPresets: newPresets };
    });
    setEditingPreset(null);
    setEditingPresetIndex(-1);
  };

  const handleDeletePreset = (indexToDelete) => {
    if (window.confirm("Are you sure you want to delete this preset?")) {
        setCfg(prevCfg => {
            const newPresets = (prevCfg.contextPresets || []).filter((_, index) => index !== indexToDelete);
            setIsDirty(true);
            return { ...prevCfg, contextPresets: newPresets };
        });
        if (editingPresetIndex === indexToDelete) {
            setEditingPreset(null);
            setEditingPresetIndex(-1);
        }
    }
  };

  const handleDuplicatePreset = (presetToDuplicate) => {
    const newPreset = {
        ...JSON.parse(JSON.stringify(presetToDuplicate)),
        id: uuidv4(),
        name: `${presetToDuplicate.name} (Copy)`
    };
    setCfg(prevCfg => {
        const newPresets = [...(prevCfg.contextPresets || []), newPreset];
        setIsDirty(true);
        return {...prevCfg, contextPresets: newPresets};
    });
  };


  if (isLoading) return <div className="p-4 text-white">Loading configuration...</div>;
  if (error && !cfg) return <div className="p-4 text-red-400">Error loading configuration: {error.message}</div>;
  if (!cfg && !isLoading) return <div className="p-4 text-white">No configuration data available.</div>;

  return (
    <div className="p-6 bg-gray-800 text-gray-100 min-h-screen">
      <h1 className="text-3xl font-semibold mb-8 text-white">Backend Configuration</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        {/* Left Column */}
        <div className="md:col-span-5 space-y-6">
          {/* Models Card */}
          <div className="bg-gray-700 p-6 rounded-lg shadow">
            <h2 className="text-xl font-medium mb-4 border-b border-gray-600 pb-3">Models</h2>
            <div>
              <label htmlFor="whisperModel" className={labelClassName}>Whisper Model:</label>
              <select id="whisperModel" className={selectClassName} value={cfg.whisperModel || ''} onChange={e => handleGenericChange(['whisperModel'], e.target.value)}>
                {availableModels.whisper.map(model => <option key={model} value={model}>{model}</option>)}
              </select>
            </div>
            <div className="mt-4">
              <label htmlFor="llmModel" className={labelClassName}>LLM Model (Local):</label>
              <select id="llmModel" className={selectClassName} value={cfg.llmModel || ''} onChange={e => handleGenericChange(['llmModel'], e.target.value)}>
                 {availableModels.llm.map(model => <option key={model} value={model}>{model}</option>)}
              </select>
            </div>
            <div className="mt-4">
              <label className={labelClassName}>OCR Mode:</label>
              {["OFF", "OCR", "OCR_PLUS_DONUT"].map(mode => (
                <label key={mode} className="inline-flex items-center mr-4">
                  <input type="radio" className="form-radio text-blue-500 bg-gray-600 border-gray-500" name="ocrMode" value={mode} checked={cfg.ocrMode === mode} onChange={e => handleGenericChange(['ocrMode'], e.target.value)} />
                  <span className="ml-2 text-sm">{mode}</span>
                </label>
              ))}
            </div>
          </div>

          {/* APIs Card */}
          <div className="bg-gray-700 p-6 rounded-lg shadow">
            <h2 className="text-xl font-medium mb-4 border-b border-gray-600 pb-3">APIs & Backends</h2>
            <div>
              <label className={labelClassName}>LLM Backend:</label>
              {["LOCAL", "OPENAI", "GROK"].map(backend => ( // Assuming these are the main options
                <label key={backend} className="inline-flex items-center mr-4">
                  <input type="radio" className="form-radio text-blue-500 bg-gray-600 border-gray-500" name="llmBackend" value={backend} checked={cfg.llmBackend === backend} onChange={e => handleGenericChange(['llmBackend'], e.target.value)} />
                  <span className="ml-2 text-sm">{backend}</span>
                </label>
              ))}
            </div>
            {/* Simplified API Key input for the first endpoint */}
            {cfg.llmEndpoints && cfg.llmEndpoints[0] && (
              <div className="mt-4">
                <label htmlFor="openaiKey" className={labelClassName}>API Key for {cfg.llmEndpoints[0].name || 'Default Endpoint'}:</label>
                <input type="password" id="openaiKey" className={inputClassName} placeholder="Enter API Key" value={cfg.llmEndpoints[0].key || ''} onChange={e => handleLlmEndpointChange(0, 'key', e.target.value)} />
                 {/* TODO: Add UI to select which endpoint to edit or manage multiple named endpoints */}
              </div>
            )}
          </div>
        </div>

        {/* Right Column */}
        <div className="md:col-span-7 space-y-6">
          {/* Scheduling Card */}
          <div className="bg-gray-700 p-6 rounded-lg shadow">
            <h2 className="text-xl font-medium mb-4 border-b border-gray-600 pb-3">Scheduling</h2>
            <div>
              <label htmlFor="quickInterval" className={labelClassName}>Quick Insight Interval (sec): {cfg.scheduling?.quickIntervalSec}</label>
              <input type="range" id="quickInterval" className="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer" min="5" max="30" value={cfg.scheduling?.quickIntervalSec || 10} onChange={e => handleGenericChange(['scheduling', 'quickIntervalSec'], parseInt(e.target.value))} />
            </div>
            <div className="mt-4">
              <label htmlFor="summaryInterval" className={labelClassName}>Summary Interval (sec): {cfg.scheduling?.summaryIntervalSec}</label>
              <input type="range" id="summaryInterval" className="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer" min="30" max="600" value={cfg.scheduling?.summaryIntervalSec || 60} onChange={e => handleGenericChange(['scheduling', 'summaryIntervalSec'], parseInt(e.target.value))} />
            </div>
            <div className="mt-4 flex items-center">
              <input type="checkbox" id="questionTrigger" className="form-checkbox h-5 w-5 text-blue-500 bg-gray-600 border-gray-500 rounded" checked={cfg.scheduling?.questionTrigger || false} onChange={e => handleGenericChange(['scheduling', 'questionTrigger'], e.target.checked)} />
              <label htmlFor="questionTrigger" className="ml-2 text-sm text-gray-300">Trigger Insight on Question ('?')</label>
            </div>
          </div>

          {/* Context Presets Card */}
          <div className="bg-gray-700 p-6 rounded-lg shadow">
            <h2 className="text-xl font-medium mb-3 border-b border-gray-600 pb-2">Context Presets</h2>
            <button onClick={handleAddNewPreset} className={`${primaryButtonClassName} mb-4`}>Add New Preset</button>
            <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
              {(cfg.contextPresets || []).map((preset, index) => (
                <div key={preset.id} className="flex items-center justify-between p-3 bg-gray-600 rounded-md">
                  <span className="text-sm">{preset.name}</span>
                  <div>
                    <button onClick={() => handleSelectPresetForEditing(preset, index)} className={`${secondaryButtonClassName} mr-2`}>Edit</button>
                    <button onClick={() => handleDuplicatePreset(preset)} className={`${secondaryButtonClassName} mr-2`}>Dup</button>
                    <button onClick={() => handleDeletePreset(index)} className={`${secondaryButtonClassName} bg-red-700 hover:bg-red-600`}>Del</button>
                  </div>
                </div>
              ))}
            </div>

            {editingPreset && (
              <div className="mt-6 p-4 border border-gray-600 rounded-lg bg-gray-750"> {/* Slightly different bg for editor */}
                <h3 className="text-lg font-semibold mb-3">{editingPresetIndex === -1 ? "Add New Preset" : "Edit Preset"}</h3>
                <div>
                  <label htmlFor="presetName" className={labelClassName}>Name:</label>
                  <input type="text" id="presetName" className={inputClassName} value={editingPreset.name} onChange={e => handlePresetInputChange('name', e.target.value)} />
                </div>
                <div className="mt-3">
                  <label htmlFor="presetRole" className={labelClassName}>Role:</label>
                  <textarea id="presetRole" rows="2" className={inputClassName} value={editingPreset.role} onChange={e => handlePresetInputChange('role', e.target.value)} />
                </div>
                <div className="mt-3">
                  <label htmlFor="presetPurpose" className={labelClassName}>Purpose:</label>
                  <textarea id="presetPurpose" rows="2" className={inputClassName} value={editingPreset.purpose} onChange={e => handlePresetInputChange('purpose', e.target.value)} />
                </div>
                <div className="mt-3">
                  <label htmlFor="presetMeetings" className={labelClassName}>Default Meetings (IDs, comma-separated):</label>
                  <input type="text" id="presetMeetings" className={inputClassName} value={(editingPreset.defaultMeetings || []).join(',')} onChange={e => handlePresetDefaultMeetingsChange(e.target.value)} />
                  <p className="text-xs text-gray-400 mt-1">TODO: Implement meeting ID selector.</p>
                </div>
                <div className="mt-4 flex space-x-3">
                  <button onClick={handleSavePreset} className={primaryButtonClassName}>Save Preset</button>
                  <button onClick={() => setEditingPreset(null)} className={secondaryButtonClassName}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer for Save/Revert buttons */}
      <div className="mt-10 pt-6 border-t border-gray-700 flex items-center space-x-4">
        <button onClick={handleSave} disabled={!isDirty || saveStatus === "Saving..."} className={`${primaryButtonClassName} disabled:opacity-50`}>
          {saveStatus === "Saving..." ? "Saving..." : "Save Changes to Backend"}
        </button>
        <button onClick={handleRevert} disabled={!isDirty || saveStatus === "Saving..."} className={`${secondaryButtonClassName} disabled:opacity-50`}>
          Revert All Changes
        </button>
        {saveStatus && <p className={`text-sm ${error && saveStatus.startsWith("Error") ? 'text-red-400' : 'text-green-400'}`}>{saveStatus}</p>}
      </div>
    </div>
  );
}
export default BackendConfigPage;
