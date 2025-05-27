# ml/assistant_worker.py - Main Python worker script for AI processing.
# Handles transcription, vision analysis, and LLM interaction.
# Communicates with Node.js backend via stdin/stdout using JSON messages.

import sys
import json
import threading
import time
import subprocess # Added for ffmpeg process management
import uuid # For current_meeting_id

# --- Configuration ---
SIMULATION_MODE = True 
SAMPLE_TRANSCRIPT_FILE = "sample_transcript.txt" 
current_config = {
    "stream": { "type": "RTMP", "url": "rtmp://localhost/live/stream" },
    "whisperModel": "base", 
    "llmModel": "dummy_llm", 
    "ocrMode": "OFF", 
    "llmBackend": "LOCAL",
    "llmEndpoints": [{"name": "local_llm", "url": "http://localhost:8080/completion", "key": ""}],
    "quickPrompt": "Provide a quick insight based on the latest transcript: {latestText}\nAdditional context if relevant: {vector_context}",
    "summaryPrompt": "Summarize the meeting so far... based on: {transcript}\nSlides: {slides}\nRelated Info: {vector_hits}",
    "templates": [] 
}

# --- Global State ---
transcription_active = False  
vision_active = False         
transcription_thread = None # Will be renamed to scheduler_thread
vision_thread = None          
ffmpeg_process = None
current_meeting_id = None # Will be set in initialize_components

transcriber_instance = None
vision_analyzer_instance = None
llm_instance = None
# vector_db_instance is removed, using direct function calls from vector_db module

# Buffers for context
transcript_buffer = [] # Stores (timestamp, text) tuples or similar
slide_text_buffer = [] # Stores (timestamp, text, image_path_optional) tuples

# Timers for scheduled tasks
last_insight_time = 0
last_summary_time = 0


# --- Communication with Node.js ---
def send_to_node(data_dict):
    """
    Sends data (Python dict) as a JSON string to Node.js via stdout,
    encoded in UTF-8 and terminated with a null character.
    """
    try:
        message_json = json.dumps(data_dict)
        message_bytes = message_json.encode('utf-8') + b'\0'
        sys.stdout.buffer.write(message_bytes)
        sys.stdout.buffer.flush()
    except TypeError as e:
        error_msg_obj = {"event": "error", "message": f"Python: Data serialization error: {str(e)}", "original_data_type": str(type(data_dict))}
        try:
            error_message_json = json.dumps(error_msg_obj)
            error_message_bytes = error_message_json.encode('utf-8') + b'\0'
            sys.stdout.buffer.write(error_message_bytes)
            sys.stdout.buffer.flush()
        except Exception as fallback_e:
            print(f"CRITICAL: Failed to send original data AND fallback error message to Node.js. Original Error: {e}, Fallback Error: {fallback_e}", file=sys.stderr, flush=True)
    except Exception as e:
        print(f"CRITICAL: Failed to send data to Node.js. Error: {e}", file=sys.stderr, flush=True)

# --- Component Initialization ---
def initialize_components():
    """Initializes AI components."""
    global transcriber_instance, vision_analyzer_instance, llm_instance, current_meeting_id
    # Import vector_db functions directly
    from vector_db import add_chunk as vec_add_chunk, query as vec_query 
    send_to_node({"event": "system_message", "message": "Python: Initializing components..."})

    current_meeting_id = str(uuid.uuid4())
    send_to_node({"event": "status", "message_type":"info", "content": f"New meeting session ID: {current_meeting_id}"})
    
    # Using actual classes if available, otherwise dummy ones will be used due to import fallbacks
    try:
        from transcriber import WhisperTranscriber # Updated import
        whisper_model_name = current_config.get('whisperModel', 'base')
        whisper_device = current_config.get('whisperDevice', 'cpu') 
        whisper_compute_type = current_config.get('whisperComputeType', 'default')
        
        transcriber_instance = WhisperTranscriber(
            model_name=whisper_model_name, 
            device=whisper_device, 
            compute_type=whisper_compute_type
        )
        if transcriber_instance.model:
            send_to_node({"event": "system_message", "message": f"WhisperTranscriber initialized: {whisper_model_name} on {whisper_device} ({whisper_compute_type})."})
        else:
            send_to_node({"event": "status", "message_type": "error", "component": "Whisper", "content": f"WhisperTranscriber failed to load model {whisper_model_name}."})

    except ImportError:
        send_to_node({"event": "error_critical", "component":"Transcriber", "message": "Failed to import WhisperTranscriber. Check transcriber.py."})
        class DummyTranscriber: 
            def __init__(self, model_name, **kwargs): send_to_node({"event":"warning", "message":"Using DUMMY Transcriber due to import error."})
            def set_model(self, name, **kwargs): pass
            def transcribe_audio_chunk(self, bytes_data): yield "[Dummy Transcriber: No audio processing]"
        transcriber_instance = DummyTranscriber(model_name=current_config.get("whisperModel", "base"))
    except Exception as e:
        send_to_node({"event": "error_critical", "component": "Transcriber", "message": f"Failed to initialize Transcriber with WhisperTranscriber: {str(e)}"})
        if not transcriber_instance: 
            class DummyTranscriber:
                def __init__(self, model_name, **kwargs): send_to_node({"event":"warning", "message":"Using DUMMY Transcriber after init exception."})
                def set_model(self, name, **kwargs): pass
                def transcribe_audio_chunk(self, bytes_data): yield "[Dummy Transcriber: No audio processing]"
            transcriber_instance = DummyTranscriber(model_name=current_config.get("whisperModel", "base"))


    try:
        from vision_analyzer import VisionAnalyzer
        vision_analyzer_instance = VisionAnalyzer()
        ocr_mode = current_config.get("ocrMode", "OFF")
        if hasattr(vision_analyzer_instance, 'set_ocr_active'):
            vision_analyzer_instance.set_ocr_active(ocr_mode != "OFF")
        send_to_node({"event": "system_message", "message": f"VisionAnalyzer initialized (OCR Mode: {ocr_mode})."})
    except Exception as e:
        send_to_node({"event": "error", "message": f"Failed to initialize VisionAnalyzer: {str(e)}"})
        class DummyVisionAnalyzer:
            def __init__(self, **kwargs): send_to_node({"event":"warning", "message":"Using DUMMY VisionAnalyzer after init fail."})
            def set_ocr_active(self, active): pass
            def process_frame_for_slides(self, frame_data): return None
        vision_analyzer_instance = DummyVisionAnalyzer()


    try:
        from assistant_llm import LLMProcessor 
        llm_instance = LLMProcessor(config=current_config) 
        if llm_instance.llm_backend == "NONE" or not llm_instance.model:
            send_to_node({"event": "status", "message_type": "error", "component": "LLM", "content": "Initial LLM loading failed or no backend configured."})
        else:
            send_to_node({"event": "system_message", "message": f"LLMProcessor initialized. Backend: {llm_instance.llm_backend}, Model: {llm_instance.model_name_or_path}."})
    except ImportError:
        send_to_node({"event": "error_critical", "component":"LLM", "message": "Failed to import LLMProcessor. Check assistant_llm.py."})
        class DummyLLM:
            def __init__(self, **kwargs): send_to_node({"event":"warning", "message":"Using DUMMY LLM due to import error."})
            def generate_response(self, prompt, **kwargs): return "[Dummy LLM: No response capability]"
            def set_config(self, cfg): pass
        llm_instance = DummyLLM()
    except Exception as e:
        send_to_node({"event": "error_critical", "component": "LLM", "message": f"Failed to initialize LLMProcessor: {str(e)}"})
        if not llm_instance: 
            class DummyLLM:
                def __init__(self, **kwargs): send_to_node({"event":"warning", "message":"Using DUMMY LLM after init exception."})
                def generate_response(self, prompt, **kwargs): return "[Dummy LLM: No response capability]"
                def set_config(self, cfg): pass
            llm_instance = DummyLLM()

    # VectorDB functions are used directly, no instance needed.
    send_to_node({"event": "system_message", "message": "Python: Components initialization attempt finished."})


# --- Context & Scheduled Task Helpers ---
def get_latest_transcript_snippet(char_limit=200):
    """Retrieves the most recent transcript snippets from the buffer."""
    global transcript_buffer
    if not transcript_buffer:
        return "No recent transcript available."
    snippet = ""
    for entry in reversed(transcript_buffer[-5:]): 
        next_part = f"{entry['speaker']}: {entry['text']}\n"
        if len(snippet) + len(next_part) > char_limit:
            break
        snippet = next_part + snippet
    return snippet.strip() if snippet else "No recent transcript available."

def get_transcript_for_summary(duration_minutes=5, char_limit=2000):
    """Retrieves transcript history for summary generation from the buffer."""
    global transcript_buffer
    if not transcript_buffer:
        return "No transcript available for summary."
    
    full_transcript_text = ""
    for entry in reversed(transcript_buffer):
        next_part = f"{entry['speaker']}: {entry['text']}\n"
        if len(full_transcript_text) + len(next_part) > char_limit:
            break
        full_transcript_text = next_part + full_transcript_text
    return full_transcript_text.strip() if full_transcript_text else "No transcript available for summary."

def get_slide_text_for_summary(max_slides=3):
    """Retrieves slide text history for summary generation from the buffer."""
    global slide_text_buffer
    if not slide_text_buffer:
        return "No slide content detected yet."
    
    relevant_slides = slide_text_buffer[-max_slides:] 
    formatted_slides = []
    for slide in relevant_slides:
        try:
            formatted_time = time.strftime('%H:%M:%S', time.localtime(slide['ts']))
            formatted_slides.append(f"[Slide @ {formatted_time} - {slide['image_path']}]: {slide['text']}")
        except Exception: 
            formatted_slides.append(f"[Slide]: {slide.get('text', 'N/A')}")
            
    return "\n".join(formatted_slides) if formatted_slides else "No recent slide content."


def quick_insight():
    """Generates and sends a quick insight based on recent context."""
    global llm_instance, current_config, last_insight_time, current_meeting_id
    from vector_db import query as vec_query # Import here to avoid top-level if vector_db fails
    
    if not llm_instance: 
        send_to_node({"event": "warning", "message": "Quick Insight: LLM not available."})
        return

    latest_text_snippet = get_latest_transcript_snippet()
    
    if "No recent transcript available" in latest_text_snippet:
        send_to_node({"event": "system_message", "message": "Quick Insight: No transcript yet for insight."})
        return

    context_hits = []
    if latest_text_snippet.strip() and current_meeting_id:
        # print(f"[AssistantWorker] Querying VectorDB for quick_insight with: '{latest_text_snippet[:50]}...'", file=sys.stderr, flush=True)
        try:
            context_hits = vec_query(latest_text_snippet, top_k=1) 
        except Exception as e:
            send_to_node({"event":"error", "message":f"VectorDB query failed for quick_insight: {e}"})
    
    context_str = ("\nContext:\n" + "\n".join([f"- {hit['text']}" for hit in context_hits])) if context_hits else ""
    prompt_template = current_config.get('quickPrompt', "Provide a quick insight on the following text: {latestText}\nAdditional context if relevant: {vector_context}")
    prompt = prompt_template.format(latestText=latest_text_snippet, vector_context=context_str if context_str else "N/A")
    
    response_text = "[ERROR: LLM not initialized]" if not llm_instance else llm_instance.generate_response(prompt, max_tokens=100) # Increased tokens slightly
    
    message = {"event": "assistant", "type": "insight", "message": response_text}
    send_to_node(message)
    last_insight_time = time.time()


def summary():
    """Generates and sends a meeting summary."""
    global llm_instance, current_config, last_summary_time, current_meeting_id
    from vector_db import query as vec_query # Import here

    if not llm_instance: 
        send_to_node({"event": "warning", "message": "Summary: LLM not available."})
        return

    transcript_context = get_transcript_for_summary() 
    slide_context = get_slide_text_for_summary() 
    
    if "No transcript available" in transcript_context and "No slide content detected" in slide_context:
        send_to_node({"event": "system_message", "message": "Summary: Not enough content yet for summary."})
        return

    query_for_vector_db = (transcript_context[-700:] + " " + slide_context[-300:]).strip()
    if not query_for_vector_db: query_for_vector_db = "key meeting topics, decisions, and action items"
    
    context_hits = []
    if current_meeting_id:
        # print(f"[AssistantWorker] Querying VectorDB for summary with: '{query_for_vector_db[:50]}...'", file=sys.stderr, flush=True)
        try:
            context_hits = vec_query(query_for_vector_db, top_k=3)
        except Exception as e:
            send_to_node({"event":"error", "message":f"VectorDB query failed for summary: {e}"})

    vector_hits_str = ("\n\nRelevant Context from Document Store:\n" + "\n".join([f"- {hit['text']} (meta: {hit.get('meta', {})}) " for hit in context_hits])) if context_hits else ""
    
    prompt_template = current_config.get('summaryPrompt', "Summarize based on: {transcript}\nSlides: {slides}\nRelated Info: {vector_hits}")
    prompt = prompt_template.format(transcript=transcript_context, slides=slide_context, vector_hits=vector_hits_str if vector_hits_str else "N/A")
    
    response_text = "[ERROR: LLM not initialized]" if not llm_instance else llm_instance.generate_response(prompt, max_tokens=500) # Increased tokens
    
    message = {"event": "assistant", "type": "summary", "message": response_text}
    send_to_node(message)
    last_summary_time = time.time()


# --- FFMPEG Stream Handling ---
def start_stream():
    """Manages the ffmpeg subprocess for capturing RTMP or NDI streams."""
    global ffmpeg_process, current_config
    send_to_node({"event": "system_message", "message": "Python: Attempting to start media stream..."})

    if ffmpeg_process:
        try:
            send_to_node({"event": "system_message", "message": "Python: Terminating existing ffmpeg process..."})
            ffmpeg_process.terminate()
            ffmpeg_process.wait(timeout=5) 
        except subprocess.TimeoutExpired:
            send_to_node({"event": "warning", "message": "Python: ffmpeg process did not terminate in time, killing."})
            ffmpeg_process.kill()
            ffmpeg_process.wait()
        except Exception as e:
            send_to_node({"event": "error", "message": f"Python: Error terminating existing ffmpeg process: {str(e)}"})
        ffmpeg_process = None

    stream_config = current_config.get('stream', {})
    stream_url = stream_config.get('url')

    if not stream_url:
        send_to_node({"event": "error", "message": f"Python: No stream URL configured. Cannot start stream."})
        return
    
    ffmpeg_command = []
    if stream_type == 'RTMP':
        # Ensure 'rtmp://0.0.0.0/live/meeting' is used if URL is empty, common for listen mode.
        effective_url = stream_url if stream_url else 'rtmp://0.0.0.0/live/meeting'
        ffmpeg_command = ['ffmpeg', '-listen', '1', '-i', effective_url, 
                          '-f', 's16le', '-ac', '1', '-ar', '16000', '-vn', 'pipe:1']
        send_to_node({"event": "system_message", "message": f"Python: Preparing RTMP stream from: {effective_url}"})
    elif stream_type == 'NDI':
        # Ensure a default NDI source name if URL is empty
        effective_url = stream_url if stream_url else 'DefaultNDISource'
        send_to_node({"event": "system_message", 
                      "message": f"Python: Preparing NDI stream from source: {effective_url}. Requires NDI SDK."})
        ffmpeg_command = ['ffmpeg', '-f', 'libndi_newtek', '-i', effective_url,
                          '-f', 's16le', '-ac', '1', '-ar', '16000', '-vn', 'pipe:1']
    else:
        send_to_node({"event": "error", "message": f"Python: Unsupported stream type: {stream_type}"})
        return

    try:
        send_to_node({"event": "status", "message": f"Python: Starting ffmpeg with command: {' '.join(ffmpeg_command)}"})
        ffmpeg_process = subprocess.Popen(ffmpeg_command, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        send_to_node({"event": "system_message", "message": f"Python: ffmpeg process started. PID: {ffmpeg_process.pid}"})
        
        # Start threads to process audio and log stderr
        audio_thread = threading.Thread(target=process_audio_stream, args=(ffmpeg_process.stdout,), daemon=True)
        audio_thread.start()
        
        stderr_thread = threading.Thread(target=log_ffmpeg_stderr, args=(ffmpeg_process.stderr,), daemon=True)
        stderr_thread.start()

    except FileNotFoundError:
        send_to_node({"event": "critical", "message": "Python: ffmpeg command not found. Please ensure ffmpeg is installed and in PATH."})
        ffmpeg_process = None # Ensure it's None if Popen fails
    except Exception as e:
        send_to_node({"event": "critical", "message": f"Python: Failed to start ffmpeg process: {str(e)}"})
        ffmpeg_process = None


# --- Core Processing Loops ---
def transcription_loop():
    """Scheduled tasks loop / Sim mode file transcription if ffmpeg is not active."""
    """Scheduled tasks loop / Sim mode file transcription if ffmpeg is not active."""
    global transcription_active, SIMULATION_MODE, SAMPLE_TRANSCRIPT_FILE, ffmpeg_process
    global last_insight_time, last_summary_time # Ensure these are accessible
    
    send_to_node({"event": "system_message", "message": "Python: Scheduler & Simulation loop started."})
    
    sim_lines = []
    sim_idx = 0
    
    # Load simulation file only if truly in file simulation mode
    # (SIMULATION_MODE true AND ffmpeg not active)
    if SIMULATION_MODE and not (ffmpeg_process and ffmpeg_process.poll() is None):
        try:
            with open(SAMPLE_TRANSCRIPT_FILE, 'r', encoding='utf-8') as f:
                sim_lines = [line.strip() for line in f if line.strip()]
            if not sim_lines: 
                sim_lines = ["Simulated transcript line 1 (file mode)."]
                send_to_node({"event": "warning", "message": f"Simulation (file mode): {SAMPLE_TRANSCRIPT_FILE} was empty. Using default."})
            send_to_node({"event": "system_message", "message": f"Transcription loop using file: {SAMPLE_TRANSCRIPT_FILE}"})
        except Exception as e:
            send_to_node({"event": "error", "message": f"Error loading sim transcript: {e}"})
            sim_lines = ["Error loading sim file."]

    while transcription_active:
        # File-based simulation only if ffmpeg isn't providing audio
        if SIMULATION_MODE and not (ffmpeg_process and ffmpeg_process.poll() is None) and sim_lines:
            text = sim_lines[sim_idx % len(sim_lines)]
            current_segment_timestamp = time.time() # Use a consistent timestamp for the segment
            send_to_node({
                "event": "transcript", 
                "text": text, 
                "speaker": f"SimSpeakerFile{((sim_idx % 2) + 1)}", 
                "ts": current_segment_timestamp
            })
            if current_meeting_id: # Add to vector DB
                metadata = {"type": "transcript", "speaker": f"SimSpeakerFile{((sim_idx % 2) + 1)}", "timestamp": current_segment_timestamp, "meeting_id": current_meeting_id}
                vec_add_chunk(text=text, meta=metadata)

            sim_idx += 1
            time.sleep(3) # Simulate delay for file-based transcription
            continue # Skip scheduled tasks if we just simulated to avoid immediate insight on the same text

        # Scheduled tasks part
        if (current_time - last_insight_time) >= 10: # 10 seconds for insights
            quick_insight()
            # last_insight_time updated within quick_insight
        
        if (current_time - last_summary_time) >= 60: # 60 seconds for summaries
            summary()
            # last_summary_time updated within summary
            
        time.sleep(1) # General loop interval
            
    send_to_node({"event": "system_message", "message": "Python: Scheduler & Simulation loop ended."})

def vision_loop():
    """Handles vision-related tasks, including slide change detection and OCR."""
    global vision_active, vision_analyzer_instance, slide_text_buffer, current_meeting_id
    from vector_db import add_chunk as vec_add_chunk # Import here
    send_to_node({"event": "system_message", "message": "Python: Vision loop started."})

    while vision_active:
        try:
            if vision_analyzer_instance and hasattr(vision_analyzer_instance, 'process_frame_for_slides'):
                slide_event_data = vision_analyzer_instance.process_frame_for_slides(None) 

                if slide_event_data and slide_event_data.get("event_type") == "new_slide":
                    ocr_text = slide_event_data.get('ocr_text', '').strip()
                    current_slide_timestamp = slide_event_data['timestamp']
                    
                    message_to_node = {
                        "event": "assistant", 
                        "type": "slide_update", 
                        "message": f"New slide: {ocr_text}", 
                        "media": slide_event_data['image_path'], 
                        "data": slide_event_data 
                    }
                    send_to_node(message_to_node)
                    
                    slide_info = {
                        "ts": current_slide_timestamp, 
                        "text": ocr_text,
                        "image_path": slide_event_data['image_path']
                    }
                    slide_text_buffer.append(slide_info)
                    if len(slide_text_buffer) > 10: 
                        slide_text_buffer.pop(0)

                    if ocr_text and current_meeting_id:
                        metadata = {"type": "slide", "image_path": slide_event_data['image_path'], "timestamp": current_slide_timestamp, "meeting_id": current_meeting_id}
                        # print(f"[AssistantWorker] Adding slide OCR chunk to VectorDB: '{ocr_text[:30]}...'", file=sys.stderr, flush=True)
                        vec_add_chunk(text=ocr_text, meta=metadata)
            
            time.sleep(5) 
        except Exception as e:
            send_to_node({"event": "error", "message": f"Python: Error in vision_loop: {str(e)}"})
            time.sleep(10) 
            
    send_to_node({"event": "system_message", "message": "Python: Vision loop ended."})

# --- Command Handlers ---
def handle_llm_query(payload):
    """Handles 'query_llm' commands from Node.js."""
    global llm_instance, current_meeting_id
    from vector_db import query as vec_query # Import here

    prompt_text = payload.get('prompt', '')
    user_id = payload.get("user", "default_user")

    if not prompt_text:
        send_to_node({"event": "error", "message": "LLM query: No prompt provided."})
        return

    context_hits = []
    if prompt_text.strip() and current_meeting_id:
        # print(f"[AssistantWorker] Querying VectorDB for user_question with: '{prompt_text[:50]}...'", file=sys.stderr, flush=True)
        try:
            context_hits = vec_query(prompt_text, top_k=2)
        except Exception as e:
            send_to_node({"event":"error", "message":f"VectorDB query failed for user_question: {e}"})
            
    context_str = ("\n\nHere's some relevant context from the meeting:\n" + "\n".join([f"- {hit['text']}" for hit in context_hits])) if context_hits else ""
    
    final_prompt_for_llm = f"{context_str}\n\nUser Question: {prompt_text}\nAssistant Answer:"
    
    response_text = "[ERROR: LLM not initialized]" if not llm_instance else llm_instance.generate_response(final_prompt_for_llm, is_user_question=True, max_tokens=250)
    
    send_to_node({
        "event": "assistant", 
        "type": "answer", 
        "message": response_text,
        "user": user_id
    })

def handle_settings_update(payload):
    global current_config, SIMULATION_MODE
    global llm_instance, transcriber_instance, vision_analyzer_instance

    send_to_node({"event": "system_message", "message": f"Python: Received settings update: {payload}"})

    stream_config_changed = False
    llm_model_changed = False
    whisper_model_changed = False
    ocr_config_changed = False

    for key, value in payload.items():
        if key in current_config:
            if current_config[key] != value:
                if key == "stream":
                    if current_config.get("stream", {}).get("url") != value.get("url") or \
                       current_config.get("stream", {}).get("type") != value.get("type"):
                        stream_config_changed = True
                elif key == "llmModel":
                    llm_model_changed = True
                elif key == "whisperModel":
                    whisper_model_changed = True
                elif key == "ocrMode":
                    ocr_config_changed = True
        current_config[key] = value
        # send_to_node({"event": "system_message", "message": f"Python Config: '{key}' updated to '{value}'."}) # Can be verbose

    if whisper_model_changed and transcriber_instance:
        if hasattr(transcriber_instance, 'set_model'):
            # Pass new config values for device and compute_type if they exist in payload, else use current or defaults
            new_model_name = current_config.get("whisperModel", "base")
            device = payload.get('whisperDevice', current_config.get('whisperDevice', 'cpu'))
            compute_type = payload.get('whisperComputeType', current_config.get('whisperComputeType', 'default'))
            current_config['whisperDevice'] = device # Ensure current_config is updated
            current_config['whisperComputeType'] = compute_type # Ensure current_config is updated

            status_msg = transcriber_instance.set_model(
                model_name=new_model_name, 
                device=device, 
                compute_type=compute_type
            )
            send_to_node({"event": "status", "message_type": "info", "component": "Transcriber", "content": f"Whisper model update: {status_msg}"})
            if not transcriber_instance.model:
                 send_to_node({"event": "status", "message_type": "error", "component": "Transcriber", "content": f"Failed to load new Whisper model: {new_model_name}"})
        else:
            send_to_node({"event": "warning", "message": "Transcriber instance does not support dynamic model setting."})

    # LLM settings update
    if llm_instance and (llm_model_changed or any(key in payload for key in ['llmBackend', 'llmEndpoints'])):
        if hasattr(llm_instance, 'set_config'):
            status_msg = llm_instance.set_config(current_config) # Pass the entire updated current_config
            send_to_node({"event": "status", "message_type": "info", "component": "LLM", "content": f"LLM settings update: {status_msg}"})
            if llm_instance.llm_backend == "NONE" or not llm_instance.model:
                 send_to_node({"event": "status", "message_type": "error", "component": "LLM", "content": "Failed to initialize/reload LLM with new settings."})
        else:
            send_to_node({"event": "warning", "message": "LLM instance does not support dynamic config setting."})


    if ocr_config_changed and vision_analyzer_instance:
        if hasattr(vision_analyzer_instance, 'set_ocr_active'):
            vision_analyzer_instance.set_ocr_active(current_config["ocrMode"] != "OFF")

    if stream_config_changed and transcription_active:
        send_to_node({"event": "system_message", "message": "Python: Stream config changed while active. Restarting stream."})
        start_stream() 

    if "simulation_mode" in payload:
        SIMULATION_MODE = bool(payload["simulation_mode"])
        send_to_node({"event": "system_message", "message": f"Python: Simulation mode set to {SIMULATION_MODE}."})


# --- Main Application Logic ---
if __name__ == "__main__":
    initialize_components()
    send_to_node({"event": "system_message", "message": "Python worker is ready and listening for commands."})

    data_buffer = b""
    try:
        while True:
            chunk = sys.stdin.buffer.read(1) # Read one byte at a time, non-blocking would be better for graceful shutdown
            if not chunk: # End of stream
                send_to_node({"event": "system_message", "message": "Python: stdin stream closed."})
                break 
            
            data_buffer += chunk
            
            # Process messages separated by null characters
            while b'\0' in data_buffer:
                message_str, data_buffer = data_buffer.split(b'\0', 1)
                if not message_str: # Empty message before a delimiter
                    continue
                
                try:
                    command_data_str = message_str.decode('utf-8')
                    command_data = json.loads(command_data_str)
                    command = command_data.get("command")
                    payload = command_data.get("payload", {})

                    if command == "start_transcription":
                        if not transcription_active:
                            transcription_active = True
                            start_stream() 
                            transcription_thread = threading.Thread(target=transcription_loop, daemon=True)
                            transcription_thread.start()
                            send_to_node({"event": "system_message", "message": "Python: Transcription started."})
                        else:
                            send_to_node({"event": "system_message", "message": "Python: Transcription already active."})
                    
                    elif command == "stop_transcription":
                        if transcription_active:
                            transcription_active = False
                            if ffmpeg_process:
                                send_to_node({"event": "system_message", "message": "Python: Stopping ffmpeg process..."})
                                ffmpeg_process.terminate()
                                ffmpeg_process = None
                            if transcription_thread and transcription_thread.is_alive():
                                transcription_thread.join(timeout=2) 
                            send_to_node({"event": "system_message", "message": "Python: Transcription stopped."})
                        else:
                            send_to_node({"event": "system_message", "message": "Python: Transcription not active."})

                    elif command == "start_vision":
                        if not vision_active:
                            vision_active = True
                            vision_thread = threading.Thread(target=vision_loop, daemon=True)
                            vision_thread.start()
                        else:
                            send_to_node({"event": "system_message", "message": "Python: Vision analysis already active."})

                    elif command == "stop_vision":
                        if vision_active:
                            vision_active = False
                            if vision_thread and vision_thread.is_alive():
                                vision_thread.join(timeout=2)
                        else:
                            send_to_node({"event": "system_message", "message": "Python: Vision analysis not active."})
                    
                    elif command == "query_llm":
                        handle_llm_query(payload)
                    
                    elif command == "update_setting":
                        handle_settings_update(payload)

                    elif command == "stop_application": 
                        send_to_node({"event": "system_message", "message": "Python: Received stop_application. Shutting down."})
                        transcription_active = False
                        vision_active = False
                        if ffmpeg_process: ffmpeg_process.terminate()
                        if transcription_thread and transcription_thread.is_alive(): transcription_thread.join(timeout=2)
                        if vision_thread and vision_thread.is_alive(): vision_thread.join(timeout=2)
                        sys.exit(0) # Clean exit after stop_application

                    else:
                        send_to_node({"event": "warning", "message": f"Python: Unknown command received: {command}"})

                except json.JSONDecodeError:
                    send_to_node({"event": "error", "message": f"Python: Invalid JSON: {message_str.decode('utf-8', errors='replace')}"})
                except Exception as e:
                    send_to_node({"event": "error", "message": f"Python: Error processing command: {str(e)}"})
            
            # Small sleep to prevent tight loop if stdin is spammed without delimiters
            if not chunk: time.sleep(0.01)

    except KeyboardInterrupt:
        send_to_node({"event": "system_message", "message": "Python: Interrupted. Shutting down."})
    except Exception as e:
        send_to_node({"event": "critical", "message": f"Python: Critical error in main loop: {str(e)}"})
    finally:
        transcription_active = False
        vision_active = False
        if ffmpeg_process: ffmpeg_process.terminate()
        if transcription_thread and transcription_thread.is_alive(): transcription_thread.join(timeout=1)
        if vision_thread and vision_thread.is_alive(): vision_thread.join(timeout=1)
        send_to_node({"event": "system_message", "message": "Python: Exited."})
        sys.exit(0)
