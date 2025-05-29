const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');

// GET /api/models - List available Whisper and LLM models
router.get('/models', async (req, res) => {
  try {
    const readModels = async (modelTypePath) => {
      try {
        const entries = await fs.readdir(modelTypePath, { withFileTypes: true });
        return entries.filter(entry => entry.isDirectory()).map(entry => entry.name);
      } catch (err) { // path does not exist or other error
        if (err.code === 'ENOENT') {
          console.warn(`Model directory not found: ${modelTypePath}`);
        } else {
          console.error(`Error reading model directory ${modelTypePath}:`, err);
        }
        return [];
      }
    };

    // Adjusted paths to be relative to the /app directory where the project is mounted
    const whisperModelsPath = path.join('/app/meeting-copilot/models/whisper');
    const llmModelsPath = path.join('/app/meeting-copilot/models/llm');

    const whisper = await readModels(whisperModelsPath);
    const llm = await readModels(llmModelsPath);

    res.json({ whisper, llm });
  } catch (error) {
    console.error("Error fetching models:", error);
    res.status(500).json({ error: "Failed to fetch models" });
  }
});

// GET /api/meetings - List past meetings (placeholder)
router.get('/meetings', async (req, res) => {
  // TODO: Implement dynamic retrieval of meeting list from VectorDB or other persistent storage.
  const placeholderMeetings = [
    { "id": "mtg_001_test", "title": "Project Alpha Review - Q3", "date": "2023-10-26T10:00:00Z" },
    { "id": "mtg_002_plan", "title": "Q4 Planning Session", "date": "2023-10-27T14:30:00Z" },
    { "id": "mtg_003_demo", "title": "Sprint 7 Demo Day", "date": "2023-11-02T11:00:00Z" }
  ];
  res.json(placeholderMeetings);
});

module.exports = router;
