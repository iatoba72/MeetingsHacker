// meeting-copilot/frontend/src/components/TemplateManager.jsx
import React, { useState } from 'react';

function TemplateManager({ currentTemplates = [], onUpdateTemplates }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null); // null for new, or template object for edit
  const [formState, setFormState] = useState({ id: '', name: '', quickPrompt: '', summaryPrompt: '' });
  const [error, setError] = useState('');

  const handleAddNew = () => {
    setEditingTemplate(null);
    setFormState({ id: '', name: '', quickPrompt: '', summaryPrompt: '' });
    setIsEditing(true);
    setError('');
  };

  const handleEdit = (template) => {
    setEditingTemplate(template);
    setFormState({ ...template });
    setIsEditing(true);
    setError('');
  };

  const handleDelete = async (templateId) => {
    setError('');
    try {
      const response = await fetch(`/api/templates/${templateId}`, { method: 'DELETE' });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Failed to delete template.');
      }
      // Update parent state by providing the new list of templates
      onUpdateTemplates(currentTemplates.filter(t => t.id !== templateId));
    } catch (e) {
      console.error("Error deleting template:", e);
      setError(e.message);
    }
  };

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setFormState(prev => ({ ...prev, [name]: value }));
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!formState.name.trim()) {
      setError("Template name cannot be empty.");
      return;
    }

    const url = editingTemplate ? `/api/templates/${editingTemplate.id}` : '/api/templates';
    const method = editingTemplate ? 'PUT' : 'POST';

    try {
      const response = await fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: formState.name, quickPrompt: formState.quickPrompt, summaryPrompt: formState.summaryPrompt }),
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || `Failed to ${editingTemplate ? 'update' : 'create'} template.`);
      }
      const savedTemplate = await response.json();
      
      let updatedTemplates;
      if (editingTemplate) {
        updatedTemplates = currentTemplates.map(t => (t.id === savedTemplate.id ? savedTemplate : t));
      } else {
        updatedTemplates = [...currentTemplates, savedTemplate];
      }
      onUpdateTemplates(updatedTemplates);
      setIsEditing(false);
      setEditingTemplate(null);
    } catch (e) {
      console.error(`Error ${editingTemplate ? 'updating' : 'creating'} template:`, e);
      setError(e.message);
    }
  };

  return (
    <div className="bg-gray-800 p-6 rounded-lg shadow-md mt-8">
      <h2 className="text-2xl font-semibold text-white mb-4 border-b border-gray-700 pb-3">Prompt Templates</h2>
      
      {error && <div className="bg-red-500 text-white p-3 rounded mb-4">{error}</div>}

      {!isEditing ? (
        <>
          <button
            onClick={handleAddNew}
            className="mb-4 bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-4 rounded-md transition duration-150"
          >
            Add New Template
          </button>
          {currentTemplates.length === 0 && <p className="text-gray-400">No templates created yet.</p>}
          <ul className="space-y-3">
            {currentTemplates.map(template => (
              <li key={template.id} className="bg-gray-700 p-4 rounded-md flex justify-between items-center shadow">
                <div>
                  <h3 className="text-lg font-semibold text-blue-300">{template.name}</h3>
                  {template.quickPrompt && <p className="text-sm text-gray-300 mt-1"><strong>Quick:</strong> {template.quickPrompt.substring(0,50)}...</p>}
                  {template.summaryPrompt && <p className="text-sm text-gray-300 mt-1"><strong>Summary:</strong> {template.summaryPrompt.substring(0,50)}...</p>}
                </div>
                <div className="space-x-2 flex-shrink-0">
                  <button onClick={() => handleEdit(template)} className="bg-blue-500 hover:bg-blue-600 text-white py-1 px-3 rounded-md text-sm">Edit</button>
                  <button onClick={() => handleDelete(template.id)} className="bg-red-500 hover:bg-red-600 text-white py-1 px-3 rounded-md text-sm">Delete</button>
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <form onSubmit={handleFormSubmit} className="space-y-4">
          <h3 className="text-xl font-semibold text-white">{editingTemplate ? 'Edit Template' : 'Create New Template'}</h3>
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-300 mb-1">Template Name</label>
            <input type="text" name="name" id="name" value={formState.name} onChange={handleFormChange} required className="w-full p-2 bg-gray-700 border border-gray-600 rounded-md text-white"/>
          </div>
          <div>
            <label htmlFor="quickPrompt" className="block text-sm font-medium text-gray-300 mb-1">Quick Prompt</label>
            <textarea name="quickPrompt" id="quickPrompt" value={formState.quickPrompt} onChange={handleFormChange} rows="3" className="w-full p-2 bg-gray-700 border border-gray-600 rounded-md text-white" placeholder="e.g., Provide a quick insight... {transcript}"></textarea>
          </div>
          <div>
            <label htmlFor="summaryPrompt" className="block text-sm font-medium text-gray-300 mb-1">Summary Prompt</label>
            <textarea name="summaryPrompt" id="summaryPrompt" value={formState.summaryPrompt} onChange={handleFormChange} rows="4" className="w-full p-2 bg-gray-700 border border-gray-600 rounded-md text-white" placeholder="e.g., Summarize the meeting... {transcript} and {slides}"></textarea>
          </div>
          <div className="flex space-x-3">
            <button type="submit" className="bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-4 rounded-md">
              {editingTemplate ? 'Save Changes' : 'Create Template'}
            </button>
            <button type="button" onClick={() => setIsEditing(false)} className="bg-gray-600 hover:bg-gray-500 text-white font-semibold py-2 px-4 rounded-md">
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export default TemplateManager;
