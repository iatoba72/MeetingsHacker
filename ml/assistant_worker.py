# ml/assistant_worker.py - Main Python worker script for AI processing.
# Handles transcription, vision analysis, and LLM interaction.
# Communicates with Node.js backend via stdin/stdout using JSON messages.

import sys
import json
import threading
import time

# --- Configuration ---
# Configuration Note: SIMULATION_MODE = True enables using placeholder data instead of actual model calls.
SIMULATION_MODE = True 
# Configuration Note: Path to the sample transcript file, used in simulation mode.
# Assumes it's in the same directory as this script.
SAMPLE_TRANSCRIPT_FILE = "sample_transcript.txt" 

# --- Module Imports & Fallbacks ---
# Attempt to import placeholder classes from other ml modules.
try:
    from transcriber import Transcriber
    from vision_analyzer import VisionAnalyzer
    from assistant_llm import AssistantLLM
except ImportError:
    # Fallback: If actual modules are not found (e.g., in a restricted environment),
    # define dummy classes to allow the script to run with basic functionality.
    # This is primarily for testing the core communication logic.
    startup_error_message = {"event": "critical", "message": "Failed to import utility modules (Transcriber, VisionAnalyzer, AssistantLLM). Using dummy fallbacks."}
    try:
        # send_to_node might not be defined yet if this is the first thing that fails.
        print(json.dumps(startup_error_message), flush=True) 
    except NameError:
        print(json.dumps(startup_error_message), flush=True)
    
    # Dummy Transcriber class
    class Transcriber:
        def __init__(self, model_name="dummy_transcriber", device="cpu"): self.model_name = model_name; self.idx = 0; send_to_node({"event": "warning", "message": "Using DUMMY Transcriber."})
        def transcribe_chunk(self, audio_chunk): self.idx += 1; time.sleep(0.1); return f"Dummy transcript segment {self.idx} from {self.model_name}"
        def set_model(self, model_name): self.model_name = model_name; return f"Dummy Transcriber model set to {model_name}."

    # Dummy VisionAnalyzer class
    class VisionAnalyzer:
        def __init__(self): self.count = 0; self.ocr_active = True; send_to_node({"event": "warning", "message": "Using DUMMY VisionAnalyzer."})
        def ocr_frame(self, frame): self.count += 1; return f"Dummy OCR text from frame {self.count}" if self.ocr_active else "Dummy OCR is disabled."
        def detect_speaker(self, frame): return f"Dummy_Speaker_{(self.count % 2) + 1}" # Simulate 2 speakers
        def set_ocr_active(self, active: bool): self.ocr_active = active; return f"Dummy Vision OCR set to {active}."

    # Dummy AssistantLLM class
    class AssistantLLM:
        def __init__(self, model_name="dummy_llm"): self.model_name = model_name; send_to_node({"event": "warning", "message": "Using DUMMY AssistantLLM."})
        def generate_response(self, context, user_question=None): 
            time.sleep(0.5)
            return f"Dummy answer to '{user_question}' using {self.model_name}" if user_question else f"Dummy insight on '{context[:30]}...' from {self.model_name}"
        def set_model(self, model_name): self.model_name = model_name; return f"Dummy LLM model set to {model_name}."

# --- Global State ---
transcription_active = False  # Flag to control the transcription loop.
vision_active = False         # Flag to control the vision analysis loop.
transcription_thread = None   # Thread object for the transcription loop.
vision_thread = None          # Thread object for the vision analysis loop.

# Placeholder instances for AI components. These are initialized by `initialize_components()`.
transcriber_instance = None
vision_analyzer_instance = None
llm_instance = None
# TODO: vector_db_client = None # Example: ChromaDB or FAISS client for context storage/retrieval.

# --- Communication with Node.js ---
def send_to_node(data):
    """
    Sends data (Python dict) as a JSON string to Node.js via stdout.
    Ensures the message is flushed to stdout for immediate processing by Node.js.
    Parameters:
        data (dict): The Python dictionary to send.
    """
    try:
        print(json.dumps(data), flush=True)
    except TypeError as e:
        # Fallback for data that can't be serialized directly (e.g., complex objects).
        error_msg = {"event": "error", "message": f"Python: Data serialization error: {str(e)}", "original_data_type": str(type(data))}
        print(json.dumps(error_msg), flush=True)
    except Exception as e:
        error_msg = {"event": "error", "message": f"Python: Failed to send data to Node: {str(e)}"}
        print(json.dumps(error_msg), flush=True)

# --- Component Initialization ---
def initialize_components():
    """
    Initializes the AI components (Transcriber, VisionAnalyzer, AssistantLLM).
    In SIMULATION_MODE, this might use dummy versions or specific simulation configurations.
    """
    global transcriber_instance, vision_analyzer_instance, llm_instance
    
    send_to_node({"event": "system_message", "message": f"Python worker initializing components... (Simulation: {SIMULATION_MODE})"})
    
    try:
        # TODO: Replace with actual model loading and configuration.
        # Configuration Note: Model names ('base', 'default_llm') are placeholders.
        transcriber_instance = Transcriber(model_name="base") 
        send_to_node({"event": "system_message", "message": "Transcriber initialized."})
    except Exception as e:
        send_to_node({"event": "error", "message": f"Failed to initialize Transcriber: {str(e)}"})

    try:
        # TODO: Replace with actual vision system initialization (e.g., OpenCV, Tesseract).
        vision_analyzer_instance = VisionAnalyzer()
        send_to_node({"event": "system_message", "message": "VisionAnalyzer initialized."})
    except Exception as e:
        send_to_node({"event": "error", "message": f"Failed to initialize VisionAnalyzer: {str(e)}"})

    try:
        # TODO: Replace with actual LLM loading (e.g., from HuggingFace Transformers).
        llm_instance = AssistantLLM(model_name="default_llm") 
        send_to_node({"event": "system_message", "message": "AssistantLLM initialized."})
    except Exception as e:
        send_to_node({"event": "error", "message": f"Failed to initialize AssistantLLM: {str(e)}"})
    
    # TODO: Initialize vector DB client here if used.
    # Example: vector_db_client = chromadb.Client()

    send_to_node({"event": "system_message", "message": "Python worker components initialized."})

# --- Core Processing Loops (Transcription & Vision) ---
def transcription_loop():
    """
    Continuously processes audio for transcription when `transcription_active` is True.
    In SIMULATION_MODE, reads from `SAMPLE_TRANSCRIPT_FILE`.
    Otherwise, calls `transcriber_instance.transcribe_chunk()`.
    Sends 'transcript' events to Node.js.
    """
    global transcription_active, transcriber_instance
    sim_transcript_lines = []
    sim_line_idx = 0

    if SIMULATION_MODE:
        try:
            # Load sample transcript for simulation.
            with open(SAMPLE_TRANSCRIPT_FILE, 'r', encoding='utf-8') as f:
                sim_transcript_lines = [line.strip() for line in f if line.strip()]
            if not sim_transcript_lines:
                sim_transcript_lines = ["Default simulated transcript line 1.", "Default simulated transcript line 2."]
                send_to_node({"event": "warning", "message": f"Simulation: {SAMPLE_TRANSCRIPT_FILE} was empty. Using default lines."})
        except FileNotFoundError:
            send_to_node({"event": "error", "message": f"Simulation: {SAMPLE_TRANSCRIPT_FILE} not found. Using default error line."})
            sim_transcript_lines = ["Error: Sample transcript file not found."]
        except Exception as e:
            send_to_node({"event": "error", "message": f"Simulation: Error loading {SAMPLE_TRANSCRIPT_FILE}: {str(e)}. Using default."})
            sim_transcript_lines = [f"Error loading sample transcript: {str(e)}"]
        send_to_node({"event": "system_message", "message": f"Transcription loop started (Simulation: {len(sim_transcript_lines)} lines)." })
    else:
        send_to_node({"event": "system_message", "message": "Transcription loop started (Live Mode)."})
        # TODO: Add setup for live audio input stream if not in simulation.
        
    while transcription_active:
        try:
            text = ""
            # Simulate speaker detection or use actual if available.
            speaker_id = f"SimSpeaker{((sim_line_idx % 2) + 1)}" 

            if SIMULATION_MODE:
                if not sim_transcript_lines:
                    text = "No simulation data loaded for transcript."
                    time.sleep(3) # Prevent tight loop on error.
                else:
                    text = sim_transcript_lines[sim_line_idx % len(sim_transcript_lines)]
                    sim_line_idx += 1
            elif transcriber_instance:
                # TODO: Replace `None` with actual audio chunk from an audio input stream.
                # This audio_chunk would likely be received from Node.js or a direct audio capture library.
                text = transcriber_instance.transcribe_chunk(audio_chunk=None) 
                if vision_analyzer_instance: 
                    # TODO: Pass relevant frame/data for speaker diarization.
                    speaker_id = vision_analyzer_instance.detect_speaker(frame_data=None) 
                else:
                    speaker_id = "UnknownSpeaker" # Default if no vision-based speaker detection.
            else:
                text = "Transcription service not available (instance missing)."
                send_to_node({"event": "warning", "message": "Transcriber not available for actual transcription."})
                time.sleep(1) 

            if text: 
                # Data Flow: Send transcript data to Node.js.
                send_to_node({
                    "event": "transcript", 
                    "text": text, 
                    "speaker": speaker_id, 
                    "ts": time.time() # Timestamp of the transcript segment.
                })
            
            # Configuration Note: Adjust sleep time to control transcription frequency.
            time.sleep(3 if SIMULATION_MODE else 1) # Shorter delay for "live" mode simulation.
        except Exception as e:
            send_to_node({"event": "error", "message": f"Error in transcription loop: {str(e)}"})
            time.sleep(5) 
    send_to_node({"event": "system_message", "message": "Transcription loop ended."})

def vision_loop():
    """
    Continuously processes video frames for visual information (OCR, speaker detection) 
    when `vision_active` is True.
    In SIMULATION_MODE, cycles through predefined slide texts.
    Otherwise, calls `vision_analyzer_instance` methods.
    Sends 'slide_text' events to Node.js.
    """
    global vision_active, vision_analyzer_instance
    # Predefined slide texts for simulation.
    sim_slide_texts = [
        "Slide 1: Project Overview - AI Copilot Initiative",
        "Slide 2: Q1 Goals - Transcription Accuracy & LLM Integration",
        "Slide 3: System Architecture - Node.js, Python, Socket.IO",
        "Slide 4: Demo - Live Transcription and Q&A",
        "Slide 5: Next Steps - Vision features and Contextual Memory"
    ]
    sim_slide_idx = 0

    if SIMULATION_MODE:
        send_to_node({"event": "system_message", "message": f"Vision loop started (Simulation: {len(sim_slide_texts)} slides)." })
    else:
        send_to_node({"event": "system_message", "message": "Vision loop started (Live Mode)."})
        # TODO: Add setup for live video input stream if not in simulation.

    while vision_active:
        try:
            slide_text = ""
            if SIMULATION_MODE:
                slide_text = sim_slide_texts[sim_slide_idx % len(sim_slide_texts)]
                sim_slide_idx +=1
            elif vision_analyzer_instance:
                # TODO: Replace `None` with actual video frame data.
                # This frame_data would likely be received from Node.js or a direct video capture library.
                slide_text = vision_analyzer_instance.ocr_frame(frame_data=None)
                # TODO: Consider if speaker detection from vision is also done here or separately.
            else:
                slide_text = "Vision analysis service not available (instance missing)."
                send_to_node({"event": "warning", "message": "Vision analyzer not available for actual OCR."})
                time.sleep(1)

            if slide_text: 
                # Data Flow: Send OCR text from slides to Node.js.
                 send_to_node({"event": "slide_text", "text": slide_text, "ts": time.time()})
            
            # Configuration Note: Adjust sleep time for vision processing frequency.
            time.sleep(10) # OCR can be less frequent than transcription.
        except Exception as e:
            send_to_node({"event": "error", "message": f"Error in vision loop: {str(e)}"})
            time.sleep(10) 
    send_to_node({"event": "system_message", "message": "Vision loop ended."})

# --- Command Handlers ---
def handle_llm_query(payload):
    """
    Handles 'query_llm' commands from Node.js.
    Generates a response using `llm_instance`.
    Sends 'assistant' event (answer or insight) back to Node.js.
    Parameters:
        payload (dict): Data associated with the command, typically includes "prompt" or "user_question".
    """
    global llm_instance
    try:
        prompt_text = payload.get("prompt", "")
        user_question = payload.get("user_question", prompt_text) # Use "prompt" if "user_question" not explicit.
        
        # TODO: Enhance context for LLM. Currently uses only the direct prompt.
        # Future context could include: recent transcripts, current slide text, conversation history.
        # Example: context = f"Transcript: {last_n_transcripts}\nSlide: {current_slide_text}\nQuestion: {user_question}"
        
        if llm_instance:
            response_text = llm_instance.generate_response(context=prompt_text, user_question=user_question)
            # Data Flow: Send LLM response to Node.js.
            send_to_node({
                "event": "assistant", 
                "type": "answer" if user_question else "insight", # Differentiate reply type.
                "message": response_text,
                "user": payload.get("user", "default_user") # Optional: track user if provided.
            })
        else:
            send_to_node({"event": "error", "message": "LLM not available for query (instance missing)." })
    except Exception as e:
        send_to_node({"event": "error", "message": f"Error handling LLM query: {str(e)}"})

def handle_settings_update(payload):
    """
    Handles 'update_setting' commands from Node.js.
    Updates relevant component settings (e.g., model names, OCR active state).
    Parameters:
        payload (dict): Dictionary of settings to update, e.g., {"transcriber_model": "small"}.
    """
    global transcriber_instance, llm_instance, vision_analyzer_instance, SIMULATION_MODE
    send_to_node({"event": "system_message", "message": f"Python: Received settings update: {payload}"})
    try:
        for key, value in payload.items():
            if key == "transcriber_model" and transcriber_instance:
                result = transcriber_instance.set_model(value)
                send_to_node({"event": "system_message", "message": f"Transcriber setting '{key}' updated: {result}"})
            elif key == "llm_model" and llm_instance:
                result = llm_instance.set_model(value)
                send_to_node({"event": "system_message", "message": f"LLM setting '{key}' updated: {result}"})
            elif key == "ocr_active" and vision_analyzer_instance:
                result = vision_analyzer_instance.set_ocr_active(bool(value)) # Ensure boolean
                send_to_node({"event": "system_message", "message": f"Vision setting '{key}' updated: {result}"})
            elif key == "simulation_mode": 
                new_sim_mode = bool(value)
                if SIMULATION_MODE != new_sim_mode:
                    SIMULATION_MODE = new_sim_mode
                    send_to_node({"event": "system_message", "message": f"Simulation mode set to: {SIMULATION_MODE}. Restart active loops (transcription/vision) to apply fully."})
                else:
                    send_to_node({"event": "system_message", "message": f"Simulation mode already {SIMULATION_MODE}."})
            # TODO: Add more setting handlers as components evolve (e.g., vector DB settings).
            else:
                send_to_node({"event": "warning", "message": f"Python: Unknown or unhandled setting: {key}={value}"})
    except Exception as e:
        send_to_node({"event": "error", "message": f"Error updating settings: {str(e)}"})

# --- Main Application Logic ---
if __name__ == "__main__":
    # Initialization
    initialize_components()
    send_to_node({"event": "system_message", "message": "Python worker is ready and listening for commands."})

    # Main command processing loop.
    # Reads newline-terminated JSON commands from stdin (sent by Node.js).
    try:
        for line_bytes in sys.stdin.buffer: # Read raw bytes to handle potential encoding issues.
            line_str = line_bytes.decode('utf-8', errors='replace').strip() # Decode and strip whitespace.
            if not line_str: # Skip empty lines.
                continue

            try:
                command_data = json.loads(line_str)
                command = command_data.get("command")
                payload = command_data.get("payload", {}) # Payload is optional.

                # Data Flow: Process commands from Node.js.
                if command == "start_transcription":
                    if not transcription_active:
                        transcription_active = True
                        transcription_thread = threading.Thread(target=transcription_loop, daemon=True)
                        transcription_thread.start()
                        # Status message is sent from within the loop's start.
                    else:
                        send_to_node({"event": "system_message", "message": "Transcription already active."})
                
                elif command == "stop_transcription":
                    if transcription_active:
                        transcription_active = False
                        if transcription_thread and transcription_thread.is_alive():
                            transcription_thread.join(timeout=5) # Wait for thread to finish.
                        # Status message is sent from within the loop's end.
                    else:
                        send_to_node({"event": "system_message", "message": "Transcription not active."})

                elif command == "start_vision":
                    if not vision_active:
                        vision_active = True
                        vision_thread = threading.Thread(target=vision_loop, daemon=True)
                        vision_thread.start()
                    else:
                        send_to_node({"event": "system_message", "message": "Vision analysis already active."})

                elif command == "stop_vision":
                    if vision_active:
                        vision_active = False
                        if vision_thread and vision_thread.is_alive():
                            vision_thread.join(timeout=5)
                    else:
                        send_to_node({"event": "system_message", "message": "Vision analysis not active."})
                
                elif command == "query_llm":
                    handle_llm_query(payload)
                
                elif command == "update_setting":
                    handle_settings_update(payload)

                elif command == "stop_application": # Command to gracefully shut down the Python worker.
                    send_to_node({"event": "system_message", "message": "Python worker received stop_application command. Shutting down."})
                    transcription_active = False
                    vision_active = False
                    if transcription_thread and transcription_thread.is_alive():
                        transcription_thread.join(timeout=5)
                    if vision_thread and vision_thread.is_alive():
                        vision_thread.join(timeout=5)
                    break # Exit main loop.

                else:
                    send_to_node({"event": "warning", "message": f"Unknown command received: {command}"})

            except json.JSONDecodeError:
                send_to_node({"event": "error", "message": f"Invalid JSON received from Node.js: {line_str}"})
            except Exception as e:
                # Try to get command name for better error reporting.
                command_name = command_data.get("command", "unknown") if isinstance(command_data, dict) else "unknown JSON structure"
                send_to_node({"event": "error", "message": f"Error processing command '{command_name}': {str(e)}"})
                
    except KeyboardInterrupt:
        # Handle Ctrl+C if running manually or process receives SIGINT.
        send_to_node({"event": "system_message", "message": "Python worker interrupted (KeyboardInterrupt). Shutting down."})
    except Exception as e:
        # Catch-all for critical errors in the main loop.
        send_to_node({"event": "critical", "message": f"Critical error in Python worker main loop: {str(e)}"})
    finally:
        # Cleanup: Ensure threads are stopped on exit.
        transcription_active = False
        vision_active = False
        if transcription_thread and transcription_thread.is_alive():
            transcription_thread.join(timeout=2)
        if vision_thread and vision_thread.is_alive():
            vision_thread.join(timeout=2)
        send_to_node({"event": "system_message", "message": "Python worker exited."})
        sys.exit(0) # Ensure a clean exit status.
