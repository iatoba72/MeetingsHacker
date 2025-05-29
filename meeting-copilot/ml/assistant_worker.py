# ml/assistant_worker.py - Main Python worker script for AI processing.
# Handles transcription, vision analysis, and LLM interaction.
# Communicates with Node.js backend via stdin/stdout using JSON messages.

import sys
import json
import threading
import time
import subprocess # Added for ffmpeg process management
import uuid # For current_meeting_id
import sys # Explicitly for Scheduler error printing, though already imported

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
# transcription_thread = None # Will be replaced by scheduler_instance's internal thread for scheduled tasks
simulation_thread = None # For file-based simulation if needed
vision_thread = None          
ffmpeg_process = None
current_meeting_id = "mtg_default_id" # Placeholder, to be initialized properly
MEETING_ID = None # Alias or specific use? For now, will sync with current_meeting_id or remove if redundant
CURRENT_CONTEXT = {} # For storing dynamic contextual information

scheduler_instance = None

transcriber_instance = None
vision_analyzer_instance = None
llm_instance = None
# vector_db_instance is removed, using direct function calls from vector_db module

# Buffers for context
transcript_buffer = [] # Stores (timestamp, text) tuples or similar
slide_text_buffer = [] # Stores (timestamp, text, image_path_optional) tuples

# Timers for scheduled tasks are now managed by the Scheduler class
# last_insight_time = 0
# last_summary_time = 0


# --- Scheduler Class ---
class Scheduler:
    def __init__(self, quick_interval_sec, summary_interval_sec, quick_insight_func, summary_func, is_active_func):
        self.quick_interval_sec = quick_interval_sec
        self.summary_interval_sec = summary_interval_sec
        self.quick_insight_func = quick_insight_func
        self.summary_func = summary_func
        self.is_active_func = is_active_func # Function to check if tasks should run (e.g., transcription_active)

        self._timer_thread = None
        self._stop_event = threading.Event()
        
        self.last_quick_insight_time = 0
        self.last_summary_time = 0
        # print("[Scheduler] Initialized.", flush=True)

    def _run(self):
        # print("[Scheduler] Run loop started.", flush=True)
        self.last_quick_insight_time = time.time() # Initialize on start
        self.last_summary_time = time.time()     # Initialize on start

        while not self._stop_event.is_set():
            if self.is_active_func():
                current_time = time.time()
                # Quick Insight
                if (current_time - self.last_quick_insight_time) >= self.quick_interval_sec:
                    try:
                        self.quick_insight_func()
                    except Exception as e:
                        print(f"[Scheduler] Error in quick_insight_func: {e}", file=sys.stderr, flush=True)
                    self.last_quick_insight_time = current_time
                
                # Summary
                if (current_time - self.last_summary_time) >= self.summary_interval_sec:
                    try:
                        self.summary_func()
                    except Exception as e:
                        print(f"[Scheduler] Error in summary_func: {e}", file=sys.stderr, flush=True)
                    self.last_summary_time = current_time
            
            # Sleep for a short duration before checking again
            # Adjust sleep time for responsiveness vs. resource use.
            # This loop will check roughly every `check_interval` seconds.
            check_interval = min(self.quick_interval_sec, self.summary_interval_sec, 1.0) if self.quick_interval_sec > 0 and self.summary_interval_sec > 0 else 1.0
            # Ensure sleep is not excessively long if intervals are large, but also not too busy.
            # Max sleep of 1s to allow relatively quick stop.
            time.sleep(min(check_interval / 2, 1.0) if check_interval > 0 else 1.0) 
        # print("[Scheduler] Run loop stopped.", flush=True)

    def start(self):
        if self._timer_thread is not None and self._timer_thread.is_alive():
            # print("[Scheduler] Already running.", flush=True)
            return
        
        self._stop_event.clear()
        self._timer_thread = threading.Thread(target=self._run, daemon=True)
        self._timer_thread.start()
        # print("[Scheduler] Started.", flush=True)

    def stop(self):
        # print("[Scheduler] Stopping...", flush=True)
        self._stop_event.set()
        if self._timer_thread is not None and self._timer_thread.is_alive():
            self._timer_thread.join(timeout=2) # Wait for thread to finish
        self._timer_thread = None # Clear the thread reference
        # print("[Scheduler] Stopped.", flush=True)

    def reset(self, quick_interval_sec, summary_interval_sec):
        # print(f"[Scheduler] Resetting intervals: Quick={quick_interval_sec}s, Summary={summary_interval_sec}s", flush=True)
        self.quick_interval_sec = quick_interval_sec
        self.summary_interval_sec = summary_interval_sec
        # Timers will pick up new intervals in the _run loop's next check.
        # Reset last execution times to trigger based on new intervals from now.
        self.last_quick_insight_time = time.time()
        self.last_summary_time = time.time()
        # If it was stopped, this doesn't auto-start it. Caller should manage start/stop.
        # If already running, it will adapt.

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
    global transcriber_instance, vision_analyzer_instance, llm_instance, current_meeting_id, scheduler_instance, MEETING_ID
    # Import vector_db functions directly
    # from vector_db import add_chunk as vec_add_chunk, query as vec_query # This is imported locally in functions now
    send_to_node({"event": "system_message", "message": "Python: Initializing components..."})

    current_meeting_id = str(uuid.uuid4()) # Generate a new meeting ID on init
    MEETING_ID = current_meeting_id # Sync MEETING_ID if it's meant to be an alias
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
    
    # Initialize Scheduler
    # TODO: Ensure current_config is loaded before this if not using hardcoded defaults
    q_interval = current_config.get('scheduling', {}).get('quickIntervalSec', 10)
    s_interval = current_config.get('scheduling', {}).get('summaryIntervalSec', 60)
    
    scheduler_instance = Scheduler(
        quick_interval_sec=q_interval,
        summary_interval_sec=s_interval,
        quick_insight_func=quick_insight,
        summary_func=summary,
        is_active_func=lambda: transcription_active # Scheduler tasks run if transcription is active
    )
    send_to_node({"event": "system_message", "message": f"Python: Scheduler initialized (Quick: {q_interval}s, Summary: {s_interval}s)." })
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
    global llm_instance, current_config, current_meeting_id, CURRENT_CONTEXT # Added CURRENT_CONTEXT
    from vector_db import query as vec_query, add_chunk as vec_add_chunk 
    
    if not llm_instance: 
        send_to_node({"event": "warning", "message": "Quick Insight: LLM not available."})
        return

    latest_text_snippet = get_latest_transcript_snippet()
    
    if "No recent transcript available" in latest_text_snippet:
        # send_to_node({"event": "system_message", "message": "Quick Insight: No transcript yet for insight."}) 
        return

    context_hits = []
    if latest_text_snippet.strip() and current_meeting_id:
        try:
            context_hits = vec_query(latest_text_snippet, top_k=1) 
        except Exception as e:
            send_to_node({"event":"error", "message":f"VectorDB query failed for quick_insight: {e}"})
    
    context_str = ("\nContext:\n" + "\n".join([f"- {hit['text']}" for hit in context_hits])) if context_hits else ""
    prompt_template = current_config.get('quickPrompt', "Provide a quick insight on the following text: {latestText}\nAdditional context if relevant: {vector_context}")
    prompt_content = prompt_template.format(latestText=latest_text_snippet, vector_context=context_str if context_str else "N/A")
    
    response_text = "[ERROR: LLM not initialized]" if not llm_instance else llm_instance.generate_response(
        prompt_content, 
        max_tokens=100,
        current_meeting_context=CURRENT_CONTEXT
    ) 
    
    message = {"event": "assistant", "type": "insight", "message": response_text}
    send_to_node(message)
    # last_insight_time = time.time() # Managed by Scheduler


def summary():
    """Generates and sends a meeting summary."""
    global llm_instance, current_config, current_meeting_id, CURRENT_CONTEXT # Added CURRENT_CONTEXT
    from vector_db import query as vec_query, add_chunk as vec_add_chunk

    if not llm_instance: 
        send_to_node({"event": "warning", "message": "Summary: LLM not available."})
        return

    transcript_context = get_transcript_for_summary() 
    slide_context = get_slide_text_for_summary() 
    
    if "No transcript available" in transcript_context and "No slide content detected" in slide_context:
        # send_to_node({"event": "system_message", "message": "Summary: Not enough content yet for summary."}) 
        return

    query_for_vector_db = (transcript_context[-700:] + " " + slide_context[-300:]).strip()
    if not query_for_vector_db: query_for_vector_db = "key meeting topics, decisions, and action items"
    
    context_hits = []
    if current_meeting_id:
        try:
            context_hits = vec_query(query_for_vector_db, top_k=3)
        except Exception as e:
            send_to_node({"event":"error", "message":f"VectorDB query failed for summary: {e}"})

    vector_hits_str = ("\n\nRelevant Context from Document Store:\n" + "\n".join([f"- {hit['text']} (meta: {hit.get('meta', {})}) " for hit in context_hits])) if context_hits else ""
    
    prompt_template = current_config.get('summaryPrompt', "Summarize based on: {transcript}\nSlides: {slides}\nRelated Info: {vector_hits}")
    prompt_content = prompt_template.format(transcript=transcript_context, slides=slide_context, vector_hits=vector_hits_str if vector_hits_str else "N/A")
    
    response_text = "[ERROR: LLM not initialized]" if not llm_instance else llm_instance.generate_response(
        prompt_content, 
        max_tokens=500,
        current_meeting_context=CURRENT_CONTEXT
    )
    
    message = {"event": "assistant", "type": "summary", "message": response_text}
    send_to_node(message)
    # last_summary_time = time.time() # Managed by Scheduler


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
def simulation_loop(): # Renamed from transcription_loop, focuses only on file simulation
    """Sim mode file transcription if ffmpeg is not active."""
    global transcription_active, SIMULATION_MODE, SAMPLE_TRANSCRIPT_FILE, ffmpeg_process, current_meeting_id
    from vector_db import add_chunk as vec_add_chunk # Local import
    
    send_to_node({"event": "system_message", "message": "Python: Simulation loop started."})
    
    sim_lines = []
    sim_idx = 0
    
    if SIMULATION_MODE: # Load simulation file if in sim mode, regardless of ffmpeg initially
        try:
            with open(SAMPLE_TRANSCRIPT_FILE, 'r', encoding='utf-8') as f:
                sim_lines = [line.strip() for line in f if line.strip()]
            if not sim_lines: 
                sim_lines = ["Simulated transcript line 1 (file mode)."] # Default if file empty
                send_to_node({"event": "warning", "message": f"Simulation (file mode): {SAMPLE_TRANSCRIPT_FILE} was empty or not found. Using default."})
            else:
                send_to_node({"event": "system_message", "message": f"Simulation loop using file: {SAMPLE_TRANSCRIPT_FILE}"})
        except Exception as e:
            send_to_node({"event": "error", "message": f"Error loading sim transcript: {e}"})
            sim_lines = ["Error loading sim file, using default."] # Default on error

    while transcription_active:
        # File-based simulation only runs IF:
        # 1. SIMULATION_MODE is true
        # 2. AND ffmpeg is NOT active (or not initialized)
        # 3. AND sim_lines has content
        if SIMULATION_MODE and not (ffmpeg_process and ffmpeg_process.poll() is None) and sim_lines:
            text = sim_lines[sim_idx % len(sim_lines)]
            current_segment_timestamp = time.time() 
            speaker = f"SimSpeakerFile{((sim_idx % 2) + 1)}"
            send_to_node({
                "event": "transcript", 
                "text": text, 
                "speaker": speaker, 
                "ts": current_segment_timestamp
            })
            if current_meeting_id: 
                metadata = {"type": "transcript", "speaker": speaker, "timestamp": current_segment_timestamp, "meeting_id": current_meeting_id}
                vec_add_chunk(text=text, meta=metadata)

            sim_idx += 1
            time.sleep(3) # Simulate delay for file-based transcription
        else:
            # If not doing file simulation (e.g. live audio or SIMULATION_MODE is false),
            # this loop will just sleep. The Scheduler handles timed tasks separately.
            time.sleep(1) 
            
    send_to_node({"event": "system_message", "message": "Python: Simulation loop ended."})


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
                        vec_add_chunk(text=ocr_text, meta=metadata) # Ensure vec_add_chunk is imported
            
            time.sleep(5) 
        except Exception as e:
            send_to_node({"event": "error", "message": f"Python: Error in vision_loop: {str(e)}"})
            time.sleep(10) 
            
    send_to_node({"event": "system_message", "message": "Python: Vision loop ended."})

# --- Command Handlers ---
def handle_llm_query(payload):
    """Handles 'query_llm' commands from Node.js."""
    global llm_instance, current_meeting_id, CURRENT_CONTEXT # Added CURRENT_CONTEXT
    from vector_db import query as vec_query 

    prompt_text = payload.get('prompt', '')
    user_id = payload.get("user", "default_user")

    if not prompt_text:
        send_to_node({"event": "error", "message": "LLM query: No prompt provided."})
        return

    context_hits = []
    if prompt_text.strip() and current_meeting_id:
        try:
            context_hits = vec_query(prompt_text, top_k=2)
        except Exception as e:
            send_to_node({"event":"error", "message":f"VectorDB query failed for user_question: {e}"})
            
    context_str = ("\n\nHere's some relevant context from the meeting:\n" + "\n".join([f"- {hit['text']}" for hit in context_hits])) if context_hits else ""
    
    final_prompt_for_llm = f"{context_str}\n\nUser Question: {prompt_text}\nAssistant Answer:"
    
    response_text = "[ERROR: LLM not initialized]" if not llm_instance else llm_instance.generate_response(
        final_prompt_for_llm, 
        is_user_question=True, 
        max_tokens=250,
        current_meeting_context=CURRENT_CONTEXT
    )
    
    send_to_node({
        "event": "assistant", 
        "type": "answer", 
        "message": response_text,
        "user": user_id
    })

def handle_settings_update(payload):
    global current_config, SIMULATION_MODE, scheduler_instance # Added scheduler_instance
    global llm_instance, transcriber_instance, vision_analyzer_instance

    send_to_node({"event": "system_message", "message": f"Python: Received settings update: {payload}"})

    # Determine if this is a full config update or a sectional one (from new API)
    is_sectional_update = 'section' in payload and 'value' in payload
    
    config_to_process = {}
    if is_sectional_update:
        # For sectional updates, the 'value' contains the settings for that section
        # We still update the main current_config, but also handle specific logic
        section_key = payload['section']
        config_to_process = {section_key: payload['value']}
        current_config[section_key] = payload['value'] # Update the global config for that section
    else:
        # This is an old-style full update, or a direct component setting
        config_to_process = payload
        # Update global current_config with all keys from payload
        for key, value in payload.items():
            current_config[key] = value


    # Specific section handling for hot-reloading
    if is_sectional_update:
        section_updated = payload.get('section')
        new_section_value = payload.get('value')

        if section_updated == 'scheduling' and new_section_value and scheduler_instance:
            q_interval = new_section_value.get('quickIntervalSec', current_config.get('scheduling',{}).get('quickIntervalSec',10))
            s_interval = new_section_value.get('summaryIntervalSec', current_config.get('scheduling',{}).get('summaryIntervalSec',60))
            print(f"[AssistantWorker] Received scheduling update: Quick={q_interval}s, Summary={s_interval}s", flush=True)
            scheduler_instance.reset(q_interval, s_interval)
            send_to_node({"event": "status", "message_type": "info", "component": "Scheduler", "content": f"Intervals updated: Quick {q_interval}s, Summary {s_interval}s."})

        elif section_updated == 'contextPresets':
            print(f"[AssistantWorker] Received contextPresets update. {len(new_section_value) if isinstance(new_section_value, list) else 0} presets.", flush=True)
            send_to_node({"event": "status", "message_type": "info", "component": "Config", "content": "Context presets updated."})
            # CURRENT_CONTEXT updates are handled by start_meeting
        
    # Existing logic for component-specific updates (e.g., model changes)
    # This needs to work with both full payloads and potentially sectional ones if they overlap
    # For simplicity, we assume model/stream changes come as direct keys in payload or within a section value

    stream_config_changed = False
    llm_model_changed = False
    whisper_model_changed = False
    ocr_config_changed = False

    # Check for changes that require component re-initialization or specific actions
    # This part might need refinement based on how sectional updates are structured for these components
    # For now, assume direct keys in payload or in the 'value' of a sectional update
    
    # If it's a sectional update, the 'value' part holds the actual settings for that section.
    # If it's a general update, 'payload' itself holds the settings.
    # We've already updated current_config. Now check specific keys for component actions.

    # Example: if payload = {"section": "whisper", "value": {"whisperModel": "large"}}
    # or payload = {"whisperModel": "large"}
    
    update_data_source = payload.get('value') if is_sectional_update else payload

    if "stream" in update_data_source and isinstance(update_data_source["stream"], dict):
        if current_config.get("stream", {}).get("url") != update_data_source["stream"].get("url") or \
           current_config.get("stream", {}).get("type") != update_data_source["stream"].get("type"):
            stream_config_changed = True
            current_config["stream"] = update_data_source["stream"] # Ensure current_config is fully updated

    if "whisperModel" in update_data_source:
        if current_config.get("whisperModel") != update_data_source["whisperModel"]:
            whisper_model_changed = True
            current_config["whisperModel"] = update_data_source["whisperModel"]
            
    if "llmModel" in update_data_source:
        if current_config.get("llmModel") != update_data_source["llmModel"]:
            llm_model_changed = True
            current_config["llmModel"] = update_data_source["llmModel"]

    if "ocrMode" in update_data_source:
        if current_config.get("ocrMode") != update_data_source["ocrMode"]:
            ocr_config_changed = True
            current_config["ocrMode"] = update_data_source["ocrMode"]
    
    # For llmBackend and llmEndpoints, they are usually part of a larger config structure.
    # We assume if they are in update_data_source, they signal a need for LLM reconfig.
    llm_config_keys_changed = any(key in update_data_source for key in ['llmBackend', 'llmEndpoints'])


    if whisper_model_changed and transcriber_instance:
        if hasattr(transcriber_instance, 'set_model'):
            # Use values from current_config as it's now the source of truth
            new_model_name = current_config.get("whisperModel", "base") # From updated current_config
            device = current_config.get('whisperDevice', 'cpu')
            compute_type = current_config.get('whisperComputeType', 'default')
            
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
    if llm_instance and (llm_model_changed or llm_config_keys_changed):
        if hasattr(llm_instance, 'set_config'):
            status_msg = llm_instance.set_config(current_config) 
            send_to_node({"event": "status", "message_type": "info", "component": "LLM", "content": f"LLM settings update: {status_msg}"})
            if llm_instance.llm_backend == "NONE" or not llm_instance.model: # Check if LLM became non-functional
                 send_to_node({"event": "status", "message_type": "error", "component": "LLM", "content": "LLM re-initialization failed or no backend configured."})
        else:
            send_to_node({"event": "warning", "message": "LLM instance does not support dynamic config setting."})

    if ocr_config_changed and vision_analyzer_instance:
        if hasattr(vision_analyzer_instance, 'set_ocr_active'):
            vision_analyzer_instance.set_ocr_active(current_config.get("ocrMode") != "OFF")

    if stream_config_changed and transcription_active: # If stream URL/type changed and we are live
        send_to_node({"event": "system_message", "message": "Python: Stream config changed while active. Restarting stream."})
        start_stream() # This will stop existing ffmpeg and start new one

    # Handle simulation_mode if present directly in payload (not sectional)
    if not is_sectional_update and "simulation_mode" in payload:
        SIMULATION_MODE = bool(payload["simulation_mode"])
        send_to_node({"event": "system_message", "message": f"Python: Simulation mode set to {SIMULATION_MODE}."})


def handle_start_meeting_command(payload):
    global MEETING_ID, CURRENT_CONTEXT, current_meeting_id, transcription_active, transcript_buffer, slide_text_buffer, scheduler_instance

    # If a meeting is already running (transcription active), stop it first.
    # This simplifies state management; alternative is to send error.
    if transcription_active:
        send_to_node({"event": "status", "message_type": "warning", "component": "Meeting", "content": "Meeting already in progress. Stopping current meeting before starting new one."})
        # Simulate stop_transcription command effects
        transcription_active = False # Set flag first
        if scheduler_instance:
            scheduler_instance.stop()
        if ffmpeg_process:
            ffmpeg_process.terminate()
            try: ffmpeg_process.wait(timeout=1)
            except subprocess.TimeoutExpired: ffmpeg_process.kill()
            ffmpeg_process = None
        global simulation_thread
        if simulation_thread and simulation_thread.is_alive():
            simulation_thread.join(timeout=1)
        # Buffers will be cleared below anyway.

    # Set new meeting ID
    MEETING_ID = payload.get('meetingId')
    if not MEETING_ID:
        MEETING_ID = f"mtg_{uuid.uuid4()}"
    current_meeting_id = MEETING_ID 

    # Set new context
    CURRENT_CONTEXT = payload.get('context', {}) 

    send_to_node({
        "event": "meeting_started", 
        "meetingId": MEETING_ID, 
        "context_received": CURRENT_CONTEXT,
        "message": f"Meeting {MEETING_ID} started with context: {CURRENT_CONTEXT.get('name', CURRENT_CONTEXT.get('role','N/A'))}"
    })
    print(f"[AssistantWorker] Meeting {MEETING_ID} started. Context: {CURRENT_CONTEXT}", flush=True)

    # Clear previous buffers for the new meeting
    transcript_buffer.clear()
    slide_text_buffer.clear()
    # TODO: Consider namespacing VectorDB entries by meeting_id or clearing relevant parts of VDB
    # For now, VDB is additive across meetings unless specific filtering is added to queries.
    send_to_node({"event": "status", "message_type": "info", "component": "Buffers", "content": "Transcript and slide buffers cleared for new meeting."})

    # Automatically start transcription and scheduler when a meeting starts
    transcription_active = True # Set flag
    
    # Attempt to start stream if Whisper is ready
    if transcriber_instance and transcriber_instance.model:
        start_stream() 
    else:
        send_to_node({"event": "status", "message_type": "error", "component": "Whisper", "content": "Whisper model not ready. Live transcription may not start."})
        # If SIMULATION_MODE is true, simulation_loop will still run below.
    
    # Start simulation loop if in SIMULATION_MODE and ffmpeg is not running (or failed to start)
    if SIMULATION_MODE and not (ffmpeg_process and ffmpeg_process.poll() is None):
        # global simulation_thread # Already global
        if simulation_thread is None or not simulation_thread.is_alive():
            simulation_thread = threading.Thread(target=simulation_loop, daemon=True)
            simulation_thread.start()

    if scheduler_instance:
        scheduler_instance.start()


# --- Main Application Logic ---
if __name__ == "__main__":
    initialize_components()
    send_to_node({"event": "system_message", "message": "Python worker is ready and listening for commands."})

    data_buffer = b""
    try:
        while True:
            chunk = sys.stdin.buffer.read(1) 
            if not chunk: 
                send_to_node({"event": "system_message", "message": "Python: stdin stream closed."})
                break 
            
            data_buffer += chunk
            
            while b'\0' in data_buffer:
                message_str, data_buffer = data_buffer.split(b'\0', 1)
                if not message_str: 
                    continue
                
                try:
                    command_data_str = message_str.decode('utf-8')
                    command_data = json.loads(command_data_str)
                    command = command_data.get("command")
                    payload = command_data.get("payload", {})

                    if command == "start_transcription": # This command might be deprecated in favor of start_meeting
                        if not transcription_active:
                            # Start a default/adhoc meeting if not already started
                            if not MEETING_ID or not CURRENT_CONTEXT: # If no meeting context exists
                                adhoc_meeting_id = f"adhoc_mtg_{uuid.uuid4()}"
                                handle_start_meeting_command({"meetingId": adhoc_meeting_id, "context": {"role": "General Assistant", "purpose": "Adhoc Transcription"}})
                            else: # Meeting context exists, just ensure transcription and scheduler are running
                                transcription_active = True
                                if transcriber_instance and transcriber_instance.model: start_stream()
                                if scheduler_instance: scheduler_instance.start()
                                if SIMULATION_MODE and not (ffmpeg_process and ffmpeg_process.poll() is None):
                                    global simulation_thread
                                    if simulation_thread is None or not simulation_thread.is_alive():
                                        simulation_thread = threading.Thread(target=simulation_loop, daemon=True)
                                        simulation_thread.start()
                            send_to_node({"event": "system_message", "message": "Python: Adhoc/Existing Transcription started."})
                        else:
                            send_to_node({"event": "system_message", "message": "Python: Transcription already active."})
                    
                    elif command == "stop_transcription": # This command might be deprecated
                        if transcription_active:
                            transcription_active = False # Set flag first
                            if scheduler_instance: scheduler_instance.stop()
                            if ffmpeg_process:
                                ffmpeg_process.terminate()
                                try: ffmpeg_process.wait(timeout=1)
                                except subprocess.TimeoutExpired: ffmpeg_process.kill()
                                ffmpeg_process = None
                            global simulation_thread 
                            if simulation_thread and simulation_thread.is_alive():
                                simulation_thread.join(timeout=1) 
                            send_to_node({"event": "system_message", "message": "Python: Transcription stopped. Meeting context retained."})
                            # Note: Meeting context (MEETING_ID, CURRENT_CONTEXT) is not cleared here.
                            # start_meeting is responsible for clearing/setting new context.
                        else:
                            send_to_node({"event": "system_message", "message": "Python: Transcription not active."})
                    
                    elif command == "start_meeting":
                        handle_start_meeting_command(payload)

                    elif command == "start_vision":
                        if not vision_active:
                            vision_active = True
                            global vision_thread 
                            if vision_thread is None or not vision_thread.is_alive():
                                vision_thread = threading.Thread(target=vision_loop, daemon=True)
                                vision_thread.start()
                            send_to_node({"event": "system_message", "message": "Python: Vision analysis started."})
                        else:
                            send_to_node({"event": "system_message", "message": "Python: Vision analysis already active."})

                    elif command == "stop_vision":
                        if vision_active:
                            vision_active = False
                            global vision_thread 
                            if vision_thread and vision_thread.is_alive():
                                vision_thread.join(timeout=2)
                            send_to_node({"event": "system_message", "message": "Python: Vision analysis stopped."})
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
                        if scheduler_instance: scheduler_instance.stop()
                        if ffmpeg_process: 
                            ffmpeg_process.terminate()
                            try: ffmpeg_process.wait(timeout=1)
                            except subprocess.TimeoutExpired: ffmpeg_process.kill()
                        if simulation_thread and simulation_thread.is_alive(): simulation_thread.join(timeout=1) # type: ignore
                        if vision_thread and vision_thread.is_alive(): vision_thread.join(timeout=1) # type: ignore
                        sys.exit(0) 

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
        transcription_active = False # Ensure flags are false for loop exits
        vision_active = False
        if scheduler_instance: scheduler_instance.stop()
        if ffmpeg_process: 
            ffmpeg_process.terminate()
            # Minimal wait here as process is exiting anyway
        # No need to join threads here usually as daemon=True should make them exit with main
        # but if they perform critical cleanup, join them. For now, assume daemon threads are fine.
        send_to_node({"event": "system_message", "message": "Python: Exited."})
        sys.exit(0)
