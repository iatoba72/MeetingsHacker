// meeting-copilot/backend/routes/templates.js
const express = require('express');
const router = express.Router();
const configStore = require('../configStore');
const { v4: uuidv4 } = require('uuid');

// GET /api/templates - Retrieve all templates
router.get('/', (req, res) => {
  try {
    const templates = configStore.get().templates || [];
    res.json(templates);
  } catch (error) {
    console.error("Error retrieving templates:", error);
    res.status(500).json({ error: "Failed to retrieve templates." });
  }
});

// POST /api/templates - Create a new template
router.post('/', async (req, res) => {
  try {
    const currentConfig = configStore.get();
    const newTemplate = { 
      id: uuidv4(), 
      name: req.body.name, 
      quickPrompt: req.body.quickPrompt || "", // Default to empty string if not provided
      summaryPrompt: req.body.summaryPrompt || "" // Default to empty string
    };

    if (!newTemplate.name) {
      return res.status(400).json({ error: "Template 'name' is required." });
    }

    const updatedTemplates = [...(currentConfig.templates || []), newTemplate];
    await configStore.set({ templates: updatedTemplates });
    res.status(201).json(newTemplate);
  } catch (error) {
    console.error("Error creating template:", error);
    // Check if the error is due to validation (from configStore.set)
    if (error.message.includes("invalid according to schema")) {
        res.status(400).json({ error: "Failed to create template. Invalid data.", details: error.details || error.message });
    } else {
        res.status(500).json({ error: "Failed to create template." });
    }
  }
});

// PUT /api/templates/:id - Update an existing template
router.put('/:id', async (req, res) => {
  try {
    const templateId = req.params.id;
    const currentConfig = configStore.get();
    const templates = currentConfig.templates || [];
    const templateIndex = templates.findIndex(t => t.id === templateId);

    if (templateIndex === -1) {
      return res.status(404).json({ error: "Template not found." });
    }

    // Create the updated template, merging existing with new, only updating provided fields
    const updatedTemplate = { 
      ...templates[templateIndex], 
      name: req.body.name !== undefined ? req.body.name : templates[templateIndex].name,
      quickPrompt: req.body.quickPrompt !== undefined ? req.body.quickPrompt : templates[templateIndex].quickPrompt,
      summaryPrompt: req.body.summaryPrompt !== undefined ? req.body.summaryPrompt : templates[templateIndex].summaryPrompt,
    };
    
    if (!updatedTemplate.name) { // Name is essential
        return res.status(400).json({ error: "Template 'name' cannot be empty." });
    }

    const updatedTemplates = [...templates];
    updatedTemplates[templateIndex] = updatedTemplate;

    await configStore.set({ templates: updatedTemplates });
    res.json(updatedTemplate);
  } catch (error) {
    console.error("Error updating template:", error);
    if (error.message.includes("invalid according to schema")) {
        res.status(400).json({ error: "Failed to update template. Invalid data.", details: error.details || error.message });
    } else {
        res.status(500).json({ error: "Failed to update template." });
    }
  }
});

// DELETE /api/templates/:id - Delete a template
router.delete('/:id', async (req, res) => {
  try {
    const templateId = req.params.id;
    const currentConfig = configStore.get();
    const templates = currentConfig.templates || [];
    const filteredTemplates = templates.filter(t => t.id !== templateId);

    if (templates.length === filteredTemplates.length) {
      return res.status(404).json({ error: "Template not found." });
    }

    await configStore.set({ templates: filteredTemplates });
    res.status(204).send(); // No content
  } catch (error) {
    console.error("Error deleting template:", error);
     if (error.message.includes("invalid according to schema")) {
        res.status(400).json({ error: "Failed to delete template due to schema validation issue post-delete (should be rare).", details: error.details || error.message });
    } else {
        res.status(500).json({ error: "Failed to delete template." });
    }
  }
});

module.exports = router;
