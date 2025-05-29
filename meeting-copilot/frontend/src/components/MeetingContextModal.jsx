import React, { useState, useEffect } from 'react';

function MeetingContextModal({ show, onClose, onStartMeeting, contextPresets = [], availableMeetings = [] }) {
  const [selectedPresetId, setSelectedPresetId] = useState('');
  const [role, setRole] = useState('');
  const [purpose, setPurpose] = useState('');
  const [selectedMeetingIds, setSelectedMeetingIds] = useState([]);
  const [customMeetingId, setCustomMeetingId] = useState(''); // Optional

  useEffect(() => {
    if (selectedPresetId) {
      const preset = contextPresets.find(p => p.id === selectedPresetId);
      if (preset) {
        setRole(preset.role || '');
        setPurpose(preset.purpose || '');
        setSelectedMeetingIds(preset.defaultMeetings || []);
      }
    } else {
      // Clear if no preset selected, or set to some global default
      setRole(''); 
      setPurpose('');
      setSelectedMeetingIds([]);
    }
  }, [selectedPresetId, contextPresets]);

  // Effect to clear customMeetingId when modal is closed/reopened, if desired
  useEffect(() => {
    if (show) {
        setCustomMeetingId(''); // Reset on show, or manage externally
    }
  }, [show]);

  const handleMeetingSelection = (meetingId) => {
    setSelectedMeetingIds(prev => 
      prev.includes(meetingId) ? prev.filter(id => id !== meetingId) : [...prev, meetingId]
    );
  };

  const handleStart = () => {
    onStartMeeting({
      role,
      purpose,
      meetings_for_context: selectedMeetingIds, // Renamed to match typical Python/backend var names
      presetId: selectedPresetId,
      meetingId: customMeetingId.trim() || undefined // User-defined ID for the new meeting
    });
    onClose(); // Close modal after starting
  };

  if (!show) {
    return null;
  }

  // Styling constants (can be moved to a shared location if used elsewhere)
  const inputClassName = "w-full p-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:ring-blue-500 focus:border-blue-500";
  const labelClassName = "block text-sm font-medium text-gray-300 mb-1";
  const buttonBaseClassName = "px-4 py-2 text-sm font-medium rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2";
  const primaryButtonClassName = `${buttonBaseClassName} text-white bg-blue-600 hover:bg-blue-700 focus:ring-blue-500`;
  const secondaryButtonClassName = `${buttonBaseClassName} text-gray-300 bg-gray-600 hover:bg-gray-500 focus:ring-gray-500`;


  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50">
      <div className="bg-gray-800 p-6 rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-white">Start New Meeting / Set Context</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">&times;</button>
        </div>

        {/* Preset Selector */}
        <div className="mb-4">
          <label htmlFor="contextPreset" className={labelClassName}>Context Preset (Optional)</label>
          <select
            id="contextPreset"
            value={selectedPresetId}
            onChange={(e) => setSelectedPresetId(e.target.value)}
            className={inputClassName}
          >
            <option value="">-- Select a Preset or Define Manually --</option>
            {contextPresets.map(preset => (
              <option key={preset.id} value={preset.id}>{preset.name}</option>
            ))}
          </select>
        </div>

        {/* Role */}
        <div className="mb-4">
          <label htmlFor="role" className={labelClassName}>Your Role / LLM Persona</label>
          <textarea
            id="role"
            rows="2"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            placeholder="e.g., Technical Lead, Project Manager, Note Taker"
            className={inputClassName}
          />
        </div>

        {/* Purpose */}
        <div className="mb-4">
          <label htmlFor="purpose" className={labelClassName}>Meeting Purpose / Objectives</label>
          <textarea
            id="purpose"
            rows="2"
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            placeholder="e.g., Sprint planning for next cycle, Q3 budget review"
            className={inputClassName}
          />
        </div>
        
        {/* Custom Meeting ID (Optional) */}
        <div className="mb-4">
          <label htmlFor="customMeetingId" className={labelClassName}>Custom Meeting ID (Optional)</label>
          <input
            type="text"
            id="customMeetingId"
            value={customMeetingId}
            onChange={(e) => setCustomMeetingId(e.target.value)}
            placeholder="e.g., project-alpha-kickoff"
            className={inputClassName}
          />
        </div>

        {/* Past Meetings for Context */}
        <div className="mb-6"> {/* Increased bottom margin */}
          <h3 className="text-md font-medium text-gray-300 mb-1">Include Context from Past Meetings (Optional)</h3>
          <div className="max-h-48 overflow-y-auto bg-gray-700 p-3 rounded-md border border-gray-600 space-y-2"> {/* Added space-y-2 */}
            {availableMeetings.length === 0 && <p className="text-sm text-gray-400">No past meetings available to select.</p>}
            {availableMeetings.map(meeting => (
              <div key={meeting.id} className="flex items-center">
                <input
                  type="checkbox"
                  id={`meeting-${meeting.id}`}
                  checked={selectedMeetingIds.includes(meeting.id)}
                  onChange={() => handleMeetingSelection(meeting.id)}
                  className="h-4 w-4 text-blue-500 bg-gray-600 border-gray-500 rounded focus:ring-blue-500 focus:ring-offset-gray-800"
                />
                <label htmlFor={`meeting-${meeting.id}`} className="ml-3 text-sm text-gray-200 cursor-pointer"> {/* Increased margin, added cursor-pointer */}
                  {meeting.title} <span className="text-xs text-gray-400">({new Date(meeting.date).toLocaleDateString()})</span>
                </label>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-1">TODO: Implement richer multi-select UI with search/filter.</p>
        </div>

        {/* Action Buttons */}
        <div className="mt-6 flex justify-end space-x-3">
          <button
            type="button"
            onClick={onClose}
            className={secondaryButtonClassName}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleStart}
            className={primaryButtonClassName}
          >
            Start Meeting
          </button>
        </div>
      </div>
    </div>
  );
}

export default MeetingContextModal;
