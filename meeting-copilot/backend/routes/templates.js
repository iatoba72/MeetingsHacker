// meeting-copilot/backend/routes/templates.js
// API routes for managing prompt templates.
// Supports CRUD operations for templates, stored in a dedicated templates.json file.

const express = require('express');
const router = express.Router();
// Path Check: `../templatesStore` is correct as this file is in `routes/`
const templatesStore = require('../templatesStore'); 
const { v4: uuidv4 } = require('uuid');

/**
 * GET /api/templates
 * Retrieves all prompt templates.
 */
router.get('/', async (req, res) => {
  try {
    const templates = await templatesStore.loadTemplates();
    res.json(templates);
  } catch (error) {
    console.error("Error retrieving templates via API:", error);
    res.status(500).json({ error: "Failed to retrieve templates." });
  }
});

/**
 * POST /api/templates
 * Creates a new prompt template.
 * Expects JSON body with `name`, and optional `quickPrompt`, `summaryPrompt`.
 */
router.post('/', async (req, res) => {
  try {
    let templates = await templatesStore.loadTemplates();
    const newTemplate = { 
      id: uuidv4(), 
      name: req.body.name, 
      quickPrompt: req.body.quickPrompt || "", 
      summaryPrompt: req.body.summaryPrompt || "" 
    };

    if (!newTemplate.name || newTemplate.name.trim() === "") {
      return res.status(400).json({ error: "Template 'name' is required and cannot be empty." });
    }

    templates.push(newTemplate);
    await templatesStore.saveTemplates(templates);
    res.status(201).json(newTemplate);
  } catch (error) {
    console.error("Error creating template via API:", error);
    res.status(500).json({ error: "Failed to create template due to an internal error." });
  }
});

/**
 * PUT /api/templates/:id
 * Updates an existing prompt template identified by `id`.
 */
router.put('/:id', async (req, res) => {
  try {
    const templateId = req.params.id;
    let templates = await templatesStore.loadTemplates();
    const templateIndex = templates.findIndex(t => t.id === templateId);

    if (templateIndex === -1) {
      return res.status(404).json({ error: "Template not found." });
    }

    const updatedTemplate = { 
      ...templates[templateIndex], 
      name: req.body.name !== undefined ? req.body.name.trim() : templates[templateIndex].name,
      quickPrompt: req.body.quickPrompt !== undefined ? req.body.quickPrompt : templates[templateIndex].quickPrompt,
      summaryPrompt: req.body.summaryPrompt !== undefined ? req.body.summaryPrompt : templates[templateIndex].summaryPrompt,
    };
    
    if (!updatedTemplate.name || updatedTemplate.name.trim() === "") { 
        return res.status(400).json({ error: "Template 'name' cannot be empty." });
    }

    templates[templateIndex] = updatedTemplate;
    await templatesStore.saveTemplates(templates);
    res.json(updatedTemplate);
  } catch (error) {
    console.error("Error updating template via API:", error);
    res.status(500).json({ error: "Failed to update template due to an internal error." });
  }
});

/**
 * DELETE /api/templates/:id
 * Deletes a prompt template identified by `id`.
 */
router.delete('/:id', async (req, res) => {
  try {
    const templateId = req.params.id;
    let templates = await templatesStore.loadTemplates();
    const filteredTemplates = templates.filter(t => t.id !== templateId);

    if (templates.length === filteredTemplates.length) {
      return res.status(404).json({ error: "Template not found." });
    }

    await templatesStore.saveTemplates(filteredTemplates);
    res.status(204).send(); 
  } catch (error) {
    console.error("Error deleting template via API:", error);
    res.status(500).json({ error: "Failed to delete template due to an internal error." });
  }
});

module.exports = router;
