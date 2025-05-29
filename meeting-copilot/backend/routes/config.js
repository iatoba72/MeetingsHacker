// meeting-copilot/backend/routes/config.js
// API routes for managing the application configuration.
// Provides endpoints to GET the current configuration and PATCH to update it.

const express = require('express');
// Path Check: `../configStore` - Correct, as this file is in `routes/` and configStore is in `backend/`.
const configStore = require('../configStore'); 

module.exports = function(io) {
  const router = express.Router();

  /**
   * GET /api/config
   * Retrieves the current application configuration.
   * Returns:
   *  - 200 OK with the configuration object.
   *  - 500 Internal Server Error if fetching configuration fails.
   */
  router.get('/', async (req, res) => { // Made async to align with configStore.get()
    try {
      // Data Flow: Calls configStore.get() to retrieve the current config.
      const currentConfig = await configStore.get(); // configStore.get is now async
      res.json(currentConfig);
    } catch (error) {
      // Error Handling: Catches errors from configStore.get() (e.g., if initial load failed critically).
      console.error("Error retrieving configuration via API:", error);
      res.status(500).json({ error: "Failed to retrieve configuration." });
    }
  });

  /**
   * PATCH /api/config
   * Updates parts of the application configuration.
   * Expects a JSON body with the configuration keys and new values to update.
   * Returns:
   *  - 200 OK with the updated configuration object if successful.
   *  - 400 Bad Request if the update fails schema validation.
   *  - 500 Internal Server Error for other failures.
   */
  router.patch('/', async (req, res) => {
    try {
      // Store the config before update to compare later (optional, req.body check is simpler)
      // const previousConfig = await configStore.get(); 

      // Data Flow: Passes the request body (partial config) to configStore.set().
      // configStore.set() handles validation, merging, and saving.
      const updatedConfig = await configStore.set(req.body);

      // Emit Socket.IO events if specific sections were updated
      if (req.body.hasOwnProperty('scheduling')) {
        io.emit('settings_update', { section: "scheduling", value: updatedConfig.scheduling });
        console.log("Emitted settings_update for scheduling:", updatedConfig.scheduling);
      }
      if (req.body.hasOwnProperty('contextPresets')) {
        io.emit('settings_update', { section: "contextPresets", value: updatedConfig.contextPresets });
        console.log("Emitted settings_update for contextPresets:", updatedConfig.contextPresets);
      }
      // For other settings, Python might rely on the 'settings_update' sent from the frontend 
      // or a general config refresh if needed. The prompt for pythonBridge's 'update_setting' 
      // seems to handle individual settings passed by name.

      res.json(updatedConfig); // Send back the full, updated configuration.
    } catch (error) {
      // Error Handling: Catches validation errors from configStore.set() or other save errors.
      console.error("Error updating configuration via API:", error.message, error.details || '');
      if (error.name === "ValidationError") { // Check if it's a validation error from configStore
        res.status(400).json({ 
          error: "Failed to update configuration. Invalid data provided.", 
          details: error.details // AJV validation errors
        });
      } else {
        res.status(500).json({ error: "Failed to update configuration due to an internal error." });
      }
    }
  });

  return router;
};
