# API and Socket Event Documentation

This document details the REST API endpoints provided by the backend server and the Socket.IO events used for real-time communication.

## Backend REST API

The backend server runs on `http://localhost:3001` by default. All API endpoints are prefixed with `/api`.

### Configuration Management

*   **`GET /api/config`**
    *   **Description:** Retrieves the current application configuration.
    *   **Response Body:** JSON object representing the entire content of `config.json`.
    *   **Example Response:**
        ```json
        {
          "stream": { "type": "RTMP", "url": "rtmp://localhost/live/stream" },
          "whisperModel": "base",
          "llmModel": "Mistral7B-Instruct-v0.2-GGUF",
          "ocrMode": "OFF",
          "llmBackend": "LOCAL",
          "llmEndpoints": [{ "name": "local_llm", "url": "http://localhost:8080/completion", "key": "" }],
          "quickPrompt": "Provide a quick insight...",
          "summaryPrompt": "Summarize the meeting...",
          // ... other config fields ...
        }
        ```

*   **`PATCH /api/config`**
    *   **Description:** Updates parts of the application configuration. The request body should contain only the keys to be updated. The backend validates the updated configuration against `schema.json`.
    *   **Request Body:** JSON object with configuration fields to update.
    *   **Response Body:** The full, updated configuration object if successful. An error object if validation fails or an error occurs.
    *   **Example Request:**
        ```json
        {
          "whisperModel": "medium",
          "stream": { "type": "NDI", "url": "MyNDISource" }
        }
        ```

### Prompt Template Management

*   **`GET /api/templates`**
    *   **Description:** Retrieves the list of all prompt templates.
    *   **Response Body:** JSON array of template objects from `templates.json`.
    *   **Example Response:**
        ```json
        [
          { "id": "uuid-123", "name": "Default Insight", "quickPrompt": "Insight: {transcript}", "summaryPrompt": "Summary: {transcript}" }
        ]
        ```

*   **`POST /api/templates`**
    *   **Description:** Creates a new prompt template. An `id` will be auto-generated.
    *   **Request Body:** JSON object for the new template (e.g., `{ "name": "New Template", "quickPrompt": "...", "summaryPrompt": "..." }`).
    *   **Response Body:** The newly created template object, including its assigned `id`. Status `201 Created`.

*   **`PUT /api/templates/:id`**
    *   **Description:** Updates an existing prompt template identified by `id`.
    *   **URL Parameters:** `id` (string) - The ID of the template to update.
    *   **Request Body:** JSON object with fields to update in the template.
    *   **Response Body:** The updated template object.

*   **`DELETE /api/templates/:id`**
    *   **Description:** Deletes a prompt template identified by `id`.
    *   **URL Parameters:** `id` (string) - The ID of the template to delete.
    *   **Response Body:** Empty response with status `204 No Content` on success.

### Utility Endpoints

*   **`GET /health`**
    *   **Description:** A simple health check endpoint.
    *   **Response Body:**
        ```json
        { "status": "OK", "message": "Node.js server is running." }
        ```

*   **`POST /upload`** (Placeholder)
    *   **Description:** Intended for uploading VTT files for indexing or processing. Currently a placeholder.
    *   **Response Body:** Placeholder message.

### Static File Serving

*   **`GET /frames/:filename`**
    *   **Description:** Serves static image files (e.g., captured slide frames) from the `meeting-copilot/frames/` directory.
    *   **URL Parameters:** `filename` (string) - The name of the image file.

## Socket.IO Events

Socket.IO is used for real-time bidirectional communication between the frontend and the backend server.

### Server -> Client Events

*   **`connect`**
    *   **Description:** Emitted when a client successfully connects to the Socket.IO server.
*   **`disconnect`**
    *   **Description:** Emitted when a client disconnects.
*   **`config`**
    *   **Description:** Emitted to a client immediately after it connects. Provides the current full application configuration.
    *   **Payload:** Full `config.json` object.
*   **`transcript`**
    *   **Description:** Sends a new transcript segment from the Python backend.
    *   **Payload:** `{"text": "...", "speaker": "...", "ts": 1678886400.123}`
*   **`assistant`**
    *   **Description:** Sends messages from the AI assistant (insights, summaries, answers to questions, slide updates).
    *   **Payload Examples:**
        *   Insight: `{"type": "insight", "message": "This is an AI insight."}`
        *   Summary: `{"type": "summary", "message": "This is a meeting summary."}`
        *   Answer: `{"type": "answer", "message": "This is an answer to your question."}`
        *   Slide Update: `{"type": "slide_update", "message": "OCR text from slide...", "media": "/frames/frame_123.jpg", "data": {"ocr_text": "...", "timestamp": ...}}`
*   **`restart_required`**
    *   **Description:** Sent by the server if a configuration change in Python requires a restart of the Python worker to take full effect.
    *   **Payload:** `{"component": "LLM_MODEL", "message": "LLM model changed, restart may be needed."}`
*   **`python_status` / `ffmpeg_log` / `error_message`** (General Status/Error Events)
    *   **Description:** Used for various status updates, logs (especially from FFmpeg), or error messages originating from the Python backend or its subprocesses.
    *   **Payload:** Typically `{"event": "event_name", "message_type": "info|error|status", "component": "component_name", "content": "Detailed message"}` or similar structured data.

### Client -> Server Events

*   **`user_question`**
    *   **Description:** Sent by the client when the user submits a question for the LLM.
    *   **Payload:** `{"prompt": "User's question text here"}`
*   **`start_transcription`**
    *   **Description:** Command to start the transcription process (which may involve starting FFmpeg).
    *   **Payload:** None, or optional settings if refined later.
*   **`stop_transcription`**
    *   **Description:** Command to stop the transcription process.
    *   **Payload:** None.
*   **`settings_update`** (Usage Note)
    *   **Description:** This event was previously used for more direct settings changes. With the introduction of `PATCH /api/config`, its primary use might be for settings that need immediate, specific handling by Python not covered by the general config update (e.g., live toggles if any are re-introduced). For most configuration, `PATCH /api/config` is preferred. Python's `update_setting` command (sent via IPC from Node) handles config changes relayed from the API.
    *   **Payload:** Varies, e.g., `{"whisperModel": "medium"}`.

```
