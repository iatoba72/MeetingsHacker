// meeting-copilot/backend/configStore.js
// Manages loading, validating, and saving the application configuration.
// Uses AJV for JSON schema validation.

const fs = require('fs/promises');
const Ajv = require('ajv');
// Path Check: `../config/schema.json` - Correct, as this file is in `backend/` and schema is in `config/`.
const schema = require('../config/schema.json'); 
const ajv = new Ajv({ useDefaults: true }); // `useDefaults: true` can fill in default values from the schema if properties are missing.
const validate = ajv.compile(schema);

let cfg; // In-memory store for the configuration.

/**
 * Loads configuration from `../config/config.json`.
 * Validates against the schema. If invalid or loading fails, falls back to schema defaults.
 * @async
 */
async function load() {
  try {
    // Path Check: `../config/config.json` - Correct.
    const rawConfig = await fs.readFile('../config/config.json', 'utf8');
    cfg = JSON.parse(rawConfig);
    if (!validate(cfg)) {
      console.error("Loaded configuration is invalid according to schema. Errors:", validate.errors);
      // TODO: Consider a more robust strategy for handling invalid config,
      // e.g., notifying admin, attempting self-correction, or stopping service.
      // For now, it will proceed with the invalid config, which might be risky.
      // Alternative: Apply defaults from schema to a new object if validation fails.
      // cfg = {}; validate(cfg); // This would apply schema defaults to an empty object.
      console.warn("Proceeding with potentially invalid configuration. Applying schema defaults might be safer.");
    } else {
      console.log("Configuration loaded and validated successfully from config.json.");
    }
  } catch (error) {
    console.error("Failed to load configuration from config.json:", error);
    // Fallback: If file doesn't exist or is unparsable, create a new config based on schema defaults.
    cfg = {}; // Create an empty object
    validate(cfg); // Apply schema defaults to `cfg`. This populates `cfg` with default values defined in schema.
    console.warn("Falling back to configuration based on schema defaults. Saving this default config.");
    // TODO: Consider if saving immediately after fallback is desired, or if it should only happen on explicit `set`.
    // For now, let's save it to ensure `config.json` exists and reflects the running config.
    await save(); 
  }
}

/**
 * Saves the current in-memory configuration to `../config/config.json`.
 * @async
 */
async function save() {
  if (!cfg) {
    console.error("Cannot save, configuration not loaded or initialized.");
    // TODO: Maybe throw an error here or attempt to load/initialize first.
    return;
  }
  // Note: Validation is done in `set()` before updating `cfg`.
  // Re-validating here could be redundant but safe if `cfg` could be modified elsewhere.
  // For now, assume `cfg` is valid if it passed through `set()` or initial `load()`.
  try {
    // Path Check: `../config/config.json` - Correct.
    await fs.writeFile('../config/config.json', JSON.stringify(cfg, null, 2)); // Pretty print JSON
    // console.log("Configuration saved successfully to config.json."); // Can be noisy, enable for debugging.
  } catch (error) {
    console.error("Failed to save configuration to config.json:", error);
    // TODO: Implement more robust error handling for save failures (e.g., retry, backup).
  }
}

/**
 * Updates parts of the configuration.
 * The new configuration part is merged with the existing config.
 * The merged config is then validated against the schema. If invalid, an error is thrown.
 * If valid, the in-memory config is updated and saved to file.
 * @param {object} newConfigPart - An object containing keys/values to update in the config.
 * @returns {Promise<object>} A copy of the updated and validated configuration.
 * @throws {Error} If the updated configuration is invalid against the schema.
 * @async
 */
async function set(newConfigPart) {
  if (!cfg) {
    // Attempt to load if cfg is not yet initialized. This can happen if `set` is called before `load`.
    console.warn("Configuration not yet loaded. Attempting to load before setting...");
    await load(); 
  }
  
  // Create a new object for the potential update to avoid mutating `cfg` before validation.
  // Deep merge for nested objects like 'stream' or individual 'llmEndpoints' if needed.
  // For now, simple spread merge. If `newConfigPart` has `templates` or `llmEndpoints`, it replaces the whole array.
  // TODO: Implement more granular updates for arrays (e.g., add/update/delete specific template/endpoint)
  // if direct array replacement is not desired for all `set` operations on these keys.
  const updatedCfg = { ...cfg, ...newConfigPart }; 

  if (!validate(updatedCfg)) {
    const errorMsg = "Configuration update is invalid according to schema.";
    console.error(errorMsg, validate.errors);
    // Provide detailed validation errors back to the caller.
    throw { message: errorMsg, details: validate.errors, name: "ValidationError" };
  }
  
  cfg = updatedCfg; // Assign the validated, updated configuration to in-memory store.
  await save(); // Persist changes.
  return { ...cfg }; // Return a copy.
}

/**
 * Retrieves a copy of the current in-memory configuration.
 * If config is not loaded, it attempts to load it first.
 * @returns {Promise<object>} A copy of the configuration.
 * @async - Made async to allow for initial load if needed.
 */
async function get() {
  if (!cfg) {
    // This ensures that `get` always returns a loaded configuration.
    console.warn("Configuration not yet loaded. Attempting to load now...");
    await load();
  }
  // Return a copy to prevent direct modification of the in-memory `cfg` object.
  return { ...cfg }; 
}

// Initial load when the module is first required.
// This makes `get` synchronous after module load, but `load` itself is async.
// To ensure `cfg` is available immediately after require, an IIFE can be used,
// but it's generally better to explicitly call and await `load()` at application startup.
// For now, `get()` and `set()` will handle lazy loading if `cfg` is not present.

module.exports = { get, set, load, save };
