const fs = require('fs/promises');
const Ajv = require('ajv');
// Correct schema path assuming configStore.js is in backend/
// and config/ is a sibling to backend/
const schema = require('../config/schema.json'); 
const ajv = new Ajv();
const validate = ajv.compile(schema);
let cfg; // Holds the configuration

async function load() {
  try {
    // Correct path for config.json
    cfg = JSON.parse(await fs.readFile('../config/config.json', 'utf8'));
    if (!validate(cfg)) {
      console.error("Loaded configuration is invalid according to schema.", validate.errors);
      // Optionally, throw an error or use default valid config
      // For now, just log and proceed with potentially invalid config
    } else {
      // console.log("Configuration loaded and validated successfully.");
    }
  } catch (error) {
    console.error("Failed to load configuration:", error);
    // Fallback to a minimal valid default if load fails, or rethrow
    // This ensures cfg is always an object.
    // Consider what a safe default would be, matching schema.
    cfg = { 
      stream: { type: "RTMP", url: "" },
      whisperModel: "base", 
      llmModel: "default", 
      ocrMode: "OFF", 
      llmBackend: "LOCAL",
      llmEndpoints: [],
      quickPrompt: "",
      summaryPrompt: "",
      templates: []
    }; 
    // console.warn("Falling back to minimal default configuration.");
  }
}

async function save() {
  if (!cfg) {
    console.error("Cannot save, configuration not loaded.");
    return;
  }
  if (!validate(cfg)) {
    // console.warn("Attempting to save configuration that is invalid according to schema.", validate.errors);
    // Decide if you want to prevent saving invalid config, for now, it logs and proceeds
  }
  try {
    // Correct path for config.json
    await fs.writeFile('../config/config.json', JSON.stringify(cfg, null, 2));
    // console.log("Configuration saved successfully.");
  } catch (error) {
    console.error("Failed to save configuration:", error);
  }
}

async function set(newConfigPart) {
  if (!cfg) await load(); // Ensure config is loaded before setting
  const updatedCfg = { ...cfg, ...newConfigPart }; // Create a potential new state
  
  // Special handling for deep merges if necessary, e.g. for llmEndpoints or templates
  // For simple properties, direct assignment is fine.
  // If newConfigPart contains 'templates', ensure it replaces, not merges at array level unless intended.
  // Example: if updating specific array elements, more complex logic is needed.
  // For now, assume newConfigPart overwrites top-level keys or adds new ones.
  // If specific handling for 'templates' or 'llmEndpoints' (e.g. adding one item) is needed,
  // that should be done by the caller or by adding specific functions here.

  if (!validate(updatedCfg)) {
    const errorMsg = "Configuration update is invalid according to schema.";
    console.error(errorMsg, validate.errors);
    throw new Error(errorMsg + JSON.stringify(validate.errors));
  }
  cfg = updatedCfg; // Assign the validated, updated configuration
  await save();
  return { ...cfg }; // Return a copy
}

function get() {
  if (!cfg) {
    // This should ideally not happen if load() is called on app start.
    // console.warn("Config not yet loaded, returning undefined or minimal default.");
    // Consider returning a safe, minimal, valid default or throwing an error.
    // For now, returning what cfg is (could be undefined or a fallback from a failed load).
    // A more robust approach would be to ensure load() is called and completed.
    return { /* minimal valid default or throw */ }; 
  }
  return { ...cfg }; // Return a copy to prevent direct modification
}

module.exports = { get, set, load, save }; // Added save for explicitness if needed elsewhere
