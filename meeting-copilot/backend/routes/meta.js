// meeting-copilot/backend/routes/meta.js
const express = require('express');
const fs = require('fs').promises; // Use promise-based fs
const path = require('path');
const router = express.Router();

const modelsBasePath = path.join(__dirname, '..', '..', 'models'); // Points to meeting-copilot/models

// GET /api/models - List available Whisper and LLM models
router.get('/models', async (req, res) => {
  const whisperModelsPath = path.join(modelsBasePath, 'whisper');
  const llmModelsPath = path.join(modelsBasePath, 'llm');
  
  let whisperFiles = [];
  let llmFiles = [];

  try {
    const whisperDirEntries = await fs.readdir(whisperModelsPath, { withFileTypes: true });
    whisperFiles = whisperDirEntries
      .filter(dirent => dirent.isFile() && !dirent.name.startsWith('.')) // Ignore hidden files
      .map(dirent => dirent.name);
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.warn(`[API/models] Whisper models directory not found: ${whisperModelsPath}`);
    } else {
      console.error(`[API/models] Error reading Whisper models directory: ${error}`);
    }
    // Return empty array for this type if directory doesn't exist or other error
  }

  try {
    const llmDirEntries = await fs.readdir(llmModelsPath, { withFileTypes: true });
    llmFiles = llmDirEntries
      .filter(dirent => dirent.isFile() && !dirent.name.startsWith('.')) // Ignore hidden files
      .map(dirent => dirent.name);
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.warn(`[API/models] LLM models directory not found: ${llmModelsPath}`);
    } else {
      console.error(`[API/models] Error reading LLM models directory: ${error}`);
    }
    // Return empty array for this type if directory doesn't exist or other error
  }

  res.json({
    whisper: whisperFiles,
    llm: llmFiles,
  });
});

module.exports = router;
