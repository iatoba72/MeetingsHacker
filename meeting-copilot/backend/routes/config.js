// meeting-copilot/backend/routes/config.js
const express = require('express');
const router = express.Router();
const configStore = require('../configStore'); // Adjust path if configStore is elsewhere

// GET /api/config - Retrieve the current configuration
router.get('/', (req, res) => {
  try {
    const currentConfig = configStore.get();
    res.json(currentConfig);
  } catch (error) {
    // This might happen if configStore.get() could theoretically throw an error,
    // though the current implementation returns an empty object or loaded config.
    console.error("Error retrieving configuration:", error);
    res.status(500).json({ error: "Failed to retrieve configuration." });
  }
});

// PATCH /api/config - Update parts of the configuration
router.patch('/', async (req, res) => {
  try {
    const updatedConfig = await configStore.set(req.body);
    res.json(updatedConfig);
  } catch (error) {
    // configStore.set now throws an error if validation fails.
    console.error("Error updating configuration:", error.message, error.details || '');
    res.status(400).json({ 
      error: "Failed to update configuration. Invalid data provided.", 
      details: error.details || error.message // error.details is specific to AJV validation errors
    });
  }
});

module.exports = router;
