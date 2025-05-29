# Local AI Meeting Copilot (v0.6)

## Overview

The Local AI Meeting Copilot is a self-hosted web application designed to transcribe live meetings, provide real-time AI-driven insights (such as summaries and question answering), and assist with managing meeting context. A key emphasis of the project is on local-first AI processing, aiming to provide users with greater control over their data and model choices.

**Key Technologies:**
*   **Backend:** Node.js with Express for API and Socket.IO for real-time communication.
*   **AI/ML Service:** Python for AI tasks, including interfaces for transcription, language models, OCR, and vector database operations.
*   **Frontend:** React (using Vite for build tooling) with Tailwind CSS for styling.

## Features (up to v0.6)

*   Real-time (simulated) audio stream capture via FFmpeg, configurable for RTMP or NDI sources.
*   (Simulated) Live transcription using Whisper (with `faster-whisper` as the target library).
*   (Simulated) AI-generated insights, including quick insights, summaries, and user question answering, using Large Language Models (LLMs). The LLM backend is configurable (Local HuggingFace models, OpenAI API, etc.).
*   (Simulated) Optical Character Recognition (OCR) for extracting text from presentation slides and capturing slide images.
*   Vector database integration (ChromaDB with Sentence Transformers) for creating a contextual memory from meeting transcripts and slide content.
*   A web-based interface providing a live feed of transcripts and AI outputs, settings management, and meeting context setup.
*   Detailed backend configuration page allowing users to manage AI models, API endpoints, scheduling parameters for automated insights, and context presets.
*   Per-meeting context setting, enabling users to define the LLM's role, the meeting's purpose, and include history from selected past meetings.
*   Hot-reloading of scheduling configurations in the Python ML service without a full restart.
*   Dark/Light theme toggle for the web interface.
*   **Note:** Many core AI functionalities (actual transcription, LLM generation, OCR processing, full vector DB utilization) are currently placeholders or simulated. Full integration is the next major phase.

## Directory Structure

```
/meeting-copilot
├── /backend         # Node.js Express server, Socket.IO, API routes, Python bridge.
├── /ml              # Python scripts for AI tasks (Whisper, LLM, OCR, VectorDB, FFmpeg).
├── /frontend        # React (Vite) single-page application.
├── /config          # Default configuration files (config.json, templates.json, schema.json).
├── /models          # (User-managed) Directory to place AI model files.
│   ├── /whisper/    # Subdirectories for different Whisper model sizes (e.g., base/, small/).
│   └── /llm/        # Subdirectories/files for different LLM models (e.g., mistral-7b-q4/).
├── /data            # (Auto-generated) Persistent data like VectorDB (e.g., ChromaDB files).
└── /frames          # (Auto-generated) Saved slide image captures.
```

## Setup Instructions

### Prerequisites

*   **Node.js:** Version 18+ recommended.
*   **Python:** Version 3.9+ recommended.
*   **`ffmpeg`:** Must be installed system-wide and accessible in the PATH.
    *   Ubuntu: `sudo apt update && sudo apt install ffmpeg`
    *   macOS (using Homebrew): `brew install ffmpeg`
*   **Tesseract OCR Engine:** Must be installed system-wide.
    *   Ubuntu: `sudo apt update && sudo apt install tesseract-ocr libtesseract-dev`
    *   macOS (using Homebrew): `brew install tesseract`
    *   Ensure `tesseract` is in your PATH, or you may need to configure `pytesseract.tesseract_cmd` in `ml/vision_analyzer.py` if it's not found automatically.

### Installation Steps

1.  **Clone the repository:**
    ```bash
    git clone <repository_url>
    cd meeting-copilot
    ```
2.  **Backend Setup:**
    ```bash
    cd backend
    npm install
    cd ..
    ```
3.  **ML/Python Environment Setup:**
    It is highly recommended to use a Python virtual environment.
    ```bash
    cd ml
    python -m venv .venv
    source .venv/bin/activate  # On Windows: .venv\Scripts\activate
    pip install -r requirements.txt
    cd ..
    ```
4.  **Frontend Setup:**
    ```bash
    cd frontend
    npm install
    cd ..
    ```

### Configuration

*   **Main Configuration:** Review and edit `meeting-copilot/config/config.json`.
    *   If `config.example.json` is provided, copy it to `config.json` first.
    *   **Key settings:**
        *   `stream.type`: Set to "RTMP" or "NDI".
        *   `stream.url`: Specify the URL for the FFmpeg stream source. For RTMP listen mode, this might be `rtmp://0.0.0.0/live/meeting`.
        *   `whisperModel`: Name of the Whisper model directory in `models/whisper/`.
        *   `llmModel`: Name of the LLM model file/directory in `models/llm/`.
        *   `llmBackend`: Choose "LOCAL", "OPENAI", etc.
        *   `llmEndpoints`: Configure API URLs and keys, especially if using "OPENAI" or other remote services. The first endpoint in the array is typically used by default for its respective backend type.
        *   `scheduling`: Adjust `quickIntervalSec` and `summaryIntervalSec` for automated AI insights.
*   **Prompt Templates:** Modify `meeting-copilot/config/templates.json` to customize the prompts used for generating insights and summaries.

### AI Models

*   **Whisper Models:**
    *   Download `faster-whisper` compatible model files (e.g., from Hugging Face Hub, look for models converted to `ctranslate2` format).
    *   Place them into appropriately named subdirectories within `meeting-copilot/models/whisper/`. For example, a "base" model's files should go into `models/whisper/base/`.
    *   The name used in `config.json` (e.g., "base") should match the subdirectory name.
*   **LLM Models (Local):**
    *   For local LLMs (e.g., GGUF format for llama.cpp based execution, or HuggingFace Transformers models), place the model files in `meeting-copilot/models/llm/`.
    *   You can use subdirectories for organization, e.g., `models/llm/mistral-7b-gguf/mistral-7b-instruct-v0.2.Q4_K_M.gguf`.
    *   The `llmModel` value in `config.json` should correspond to the model's identifier or path recognized by the LLM loading mechanism in `ml/assistant_llm.py`.
*   Ensure model names in `config.json` correctly reference the directories/files you've set up.

## Running the Application

1.  **Start Backend Server:**
    Open a terminal:
    ```bash
    cd meeting-copilot/backend
    npm start 
    # Or for development with nodemon: npm run dev
    ```
    The backend typically runs on `http://localhost:3001`.

2.  **Start ML Service (Python):**
    Open another terminal:
    ```bash
    cd meeting-copilot/ml
    source .venv/bin/activate  # Activate Python virtual environment
    python assistant_worker.py
    ```

3.  **Start Frontend Development Server:**
    Open a third terminal:
    ```bash
    cd meeting-copilot/frontend
    npm run dev
    ```
    The frontend is typically available at `http://localhost:5173` (for Vite).

4.  **Access the Application:**
    Open your web browser and navigate to the frontend URL (e.g., `http://localhost:5173`).

## Usage Guide

1.  **Start a Meeting / Set Context:**
    *   Upon first use or when no meeting is active, click "Start New Meeting" (or "Switch Context").
    *   A modal will appear allowing you to:
        *   Select a pre-defined **Context Preset** (optional).
        *   Define or override the **Role** for the AI assistant (e.g., "Technical Scribe").
        *   Specify the **Purpose** of the meeting (e.g., "Q4 Planning").
        *   Optionally select **Past Meetings** to include their content for richer contextual understanding by the AI.
        *   Assign a **Custom Meeting ID** (optional).
    *   Click "Start Meeting" to initialize the session.

2.  **Live Feed Page:**
    *   This is the main page where live transcripts (simulated for now), AI insights, summaries, and slide content will appear.
    *   A user input bar allows you to ask questions to the AI based on the ongoing meeting context.
    *   Theme can be toggled using the Light/Dark mode button in the navigation bar.

3.  **Backend Configuration Page (`/config`):**
    *   Navigate here to manage various backend settings:
        *   **Models:** Select different Whisper and LLM models, and configure OCR mode.
        *   **APIs & Backends:** Choose the LLM backend (Local, OpenAI, etc.) and manage API keys/endpoints.
        *   **Scheduling:** Adjust intervals for automatic quick insights and summaries. Changes here are hot-reloaded by the Python ML service.
        *   **Context Presets:** Define, edit, duplicate, or delete context presets for quick setup of future meetings.

## API Documentation (Simplified)

*   **Configuration:**
    *   `GET /api/config`: Returns current main configuration from `config.json`.
    *   `PATCH /api/config`: Updates main configuration. Request body should be a partial or full configuration object. Specific sections like `scheduling` or `contextPresets` can be updated by providing `{"section": "sectionName", "value": newSectionValue}`.
*   **Prompt Templates:**
    *   `GET /api/templates`: Returns all prompt templates from `templates.json`.
    *   `POST /api/templates`: Adds a new template. Body: `{ "name": "My Template", "quickPrompt": "...", "summaryPrompt": "..." }`. Returns the new template object with an assigned ID.
    *   `PUT /api/templates/:id`: Updates an existing template by its ID. Body: Partial or full template object.
    *   `DELETE /api/templates/:id`: Deletes a template by its ID.
*   **Information:**
    *   `GET /api/models`: Returns a list of available Whisper and LLM models found in the `models/` directory. Response: `{ "whisper": ["base", "small", ...], "llm": ["mistral-7b-q4", ...] }`.
    *   `GET /api/meetings`: Returns a (currently placeholder) list of indexed past meetings. Response: `[{ "id": "mtg_001", "title": "Meeting Title", "date": "YYYY-MM-DDTHH:mm:ssZ" }, ...]`.

## Data Flow Overview

*   **Frontend (React) <-> Backend (Node.js):**
    *   **HTTP REST API (`/api/*`)**: Used for fetching and updating configurations, prompt templates, model lists, and meeting history.
    *   **Socket.IO (Port 3001)**: Handles real-time, bidirectional event-based communication.
        *   **Client -> Server Events:**
            *   `start_meeting (payload)`: Initiates a new meeting session with context. Payload: `{ meetingId?: string, context: { role: string, purpose: string, meetings_ids_for_context?: string[], presetId?: string } }`.
            *   `user_question (payload)`: Sends user's question. Payload: `{ prompt: string }`.
            *   (Note: Some settings updates might trigger specific socket events if immediate Python reaction is needed beyond the general config PATCH).
        *   **Server -> Client Events:**
            *   `config (fullConfigObject)`: Sent to a client upon initial connection.
            *   `config_updated (fullConfigObject)`: Sent when config is updated by another source.
            *   `meeting_started (data)`: Confirms meeting start. Data: `{ meetingId: string, context_received: object }`.
            *   `transcript (data)`: Sends live transcript segments. Data: `{ text: string, speaker: string, ts: number }`.
            *   `assistant (data)`: Sends AI-generated content. Data: `{ type: "insight"|"summary"|"slide_update"|"answer", message: string, media?: string, data?: object }`.
            *   `restart_required (data)`: Signals that a component in Python needs a restart. Data: `{ component: string, reason?: string }`.
            *   `python_status (data)`: Generic status or error messages from Python. Data: `{ event: string, message: string, ... }`.
            *   `ffmpeg_log (data)`: Logs from FFmpeg process. Data: `{ stream: "stderr"|"stdout", message: string }`.

*   **Backend (Node.js) <-> ML Service (Python):**
    *   Communication via **Inter-Process Communication (IPC)** using the Python child process's `stdin` and `stdout.buffer`.
    *   Messages are JSON strings, delimited by a null character (`\0`).
    *   **Node -> Python (Commands):**
        *   `{"command": "update_setting", "payload": object}`: Sends updated settings (can be full config or sectional).
        *   `{"command": "start_meeting", "payload": object}`: Contains meeting ID and context data.
        *   `{"command": "query_llm", "payload": { "prompt": string }}`: User question for LLM.
        *   `{"command": "start_transcription"}` / `{"command": "stop_transcription"}`: Controls transcription stream (may be deprecated in favor of `start_meeting`).
        *   `{"command": "start_vision"}` / `{"command": "stop_vision"}`: Controls vision processing.
    *   **Python -> Node (Events):**
        *   `{"event": "transcript", ...}`: Transcript segment.
        *   `{"event": "assistant", "type": "insight"|"summary"|"slide_update"|"answer", ...}`: AI generated content.
        *   `{"event": "restart_required", ...}`: Request for Python service restart.
        *   `{"event": "ffmpeg_log", ...}`: Log from FFmpeg.
        *   `{"event": "status", ...}`: General status messages.
        *   `{"event": "meeting_started", ...}`: Python confirms meeting start internally.

*   **Python Internal (Conceptual Flow):**
    *   `assistant_worker.py`: Main orchestration script.
    *   `ffmpeg` (external process): Captures audio/video stream, pipes raw audio to `assistant_worker.py`.
    *   Raw Audio Stream -> `transcriber.WhisperTranscriber` (placeholder for actual audio processing & transcription) -> Text segments.
    *   Text Segments & Slide OCR Text -> `vector_db.add_chunk` (placeholder for embedding generation & storage in ChromaDB).
    *   `Scheduler`: Periodically triggers `quick_insight` and `summary` functions.
    *   Prompts (augmented with context from `vector_db.query` - placeholder) -> `assistant_llm.LLMProcessor` (placeholder for actual LLM inference) -> AI responses.
    *   `VisionAnalyzer`: (Placeholder for actual frame processing & OCR via Tesseract) -> Slide text content & image paths.

## Current Status & Next Steps (TODOs)

This is **v0.6** of the Local AI Meeting Copilot. This version heavily focuses on establishing a robust application structure, advanced configuration options, meeting context management, and the data flow pipelines. The core AI model integrations are the primary focus for subsequent development.

**Key areas for future development:**
*   **Real AI Model Integration:**
    *   Implement actual audio data conversion and processing in `ml/transcriber.py` for `faster-whisper`.
    *   Integrate actual HuggingFace Transformers model loading and inference and/or OpenAI/other API calls in `ml/assistant_llm.py`.
    *   Implement real image processing and OCR operations using Tesseract (or other engines) in `ml/vision_analyzer.py`.
*   **Vector Database Enhancement:**
    *   Implement robust text chunking strategies for transcripts and slide content before adding to `vector_db.py`.
    *   Refine metadata schema and querying capabilities in `vector_db.py`.
    *   Implement dynamic `meeting_id` namespacing or filtering for VectorDB queries to ensure context is relevant to the specified (or current) meeting.
*   **UI/UX Refinements:**
    *   Improve multi-select UI for past meetings in the context modal.
    *   Add more granular error handling and user feedback throughout the application.
*   **Streaming and Real-time Processing:**
    *   Optimize FFmpeg stream handling and audio data piping to Python.
    *   Ensure smooth real-time updates on the frontend for transcripts and AI insights.

```
