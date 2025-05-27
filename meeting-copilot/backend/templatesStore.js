// meeting-copilot/backend/templatesStore.js
const fs = require('fs/promises');
const path = require('path');

// Path Check: `../config/templates.json` is correct as this file is in `backend/`
const templatesFilePath = path.join(__dirname, '../config/templates.json');

/**
 * Loads templates from the templates.json file.
 * @async
 * @returns {Promise<Array>} An array of template objects. Returns empty array on error or if file doesn't exist.
 */
async function loadTemplates() {
  try {
    const data = await fs.readFile(templatesFilePath, 'utf8');
    if (!data) { // Handle empty file case
      return [];
    }
    const templates = JSON.parse(data);
    return Array.isArray(templates) ? templates : []; // Ensure it's an array
  } catch (error) {
    // If file doesn't exist (ENOENT) or is invalid JSON, return empty array.
    if (error.code === 'ENOENT') {
      // console.log('templates.json not found, returning empty array.');
      return [];
    }
    console.error("Error loading templates:", error);
    return []; // Fallback to empty array on other errors.
  }
}

/**
 * Saves an array of templates to the templates.json file.
 * @async
 * @param {Array<object>} templatesArray - The array of template objects to save.
 * @returns {Promise<void>}
 */
async function saveTemplates(templatesArray) {
  if (!Array.isArray(templatesArray)) {
    console.error("Error saving templates: input is not an array.");
    // Optionally throw an error or handle as appropriate
    return; 
  }
  try {
    await fs.writeFile(templatesFilePath, JSON.stringify(templatesArray, null, 2));
    // console.log("Templates saved successfully.");
  } catch (error) {
    console.error("Error saving templates:", error);
    // Optionally rethrow or handle as appropriate
  }
}

module.exports = { loadTemplates, saveTemplates };
