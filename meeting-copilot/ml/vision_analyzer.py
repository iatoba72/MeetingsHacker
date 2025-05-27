# ml/vision_analyzer.py
import time
import os
import sys
import pytesseract # type: ignore
from PIL import Image # type: ignore

FRAMES_DIR = os.path.join(os.path.dirname(__file__), '..', 'frames')

class VisionAnalyzer:
    def __init__(self):
        self.frame_count = 0
        self.ocr_active = True 
        self.last_slide_text = "" 
        try:
            if not os.path.exists(FRAMES_DIR):
                os.makedirs(FRAMES_DIR)
        except Exception as e:
            print(f"[VisionAnalyzer Error] Failed to create frames directory at {FRAMES_DIR}: {e}", file=sys.stderr, flush=True)
        
        # Check for Tesseract installation (optional, provides early warning)
        try:
            pytesseract.get_tesseract_version()
            print("[VisionAnalyzer] Tesseract OCR is available.", flush=True)
        except Exception as e:
            print(f"[VisionAnalyzer Warning] Tesseract OCR not found or not configured correctly: {e}. OCR will likely fail.", file=sys.stderr, flush=True)
            print("[VisionAnalyzer Tip] Install Tesseract OCR and ensure it's in PATH, or set pytesseract.tesseract_cmd.", file=sys.stderr, flush=True)


    def ocr_frame(self, frame_data):
        """
        Performs OCR on a given video frame (or image path for now).
        Parameters:
            frame_data: Path to an image file or actual frame data (TODO).
        Returns:
            str: Extracted text.
        """
        if not self.ocr_active:
            return "OCR is currently disabled by setting."
        
        # TODO: Replace this with actual frame data processing from ffmpeg stream
        if frame_data is None: # Use dummy image if no frame_data is provided
            frame_data = os.path.join(os.path.dirname(__file__), 'dummy_slide_for_ocr.png')

        try:
            if not os.path.exists(frame_data):
                return f"Error: Image path not found for OCR: {frame_data}"
            
            ocr_text = pytesseract.image_to_string(Image.open(frame_data)).strip()
            self.frame_count += 1
            if not ocr_text: # If OCR result is empty
                return f"[No text detected in frame {self.frame_count}]"
            return ocr_text
        except Exception as e:
            # Log the full error for debugging but return a simpler message
            print(f"[VisionAnalyzer Error] OCR processing failed for {frame_data}: {e}", file=sys.stderr, flush=True)
            return f"[ERROR: OCR failed on frame {self.frame_count}]"


    def process_frame_for_slides(self, frame_data_placeholder):
        """
        Processes a frame (currently a dummy image path) to detect slide changes via OCR.
        If a change is detected, "saves" a dummy frame and returns slide metadata.
        """
        # TODO: This function should eventually receive actual frame data from the video stream,
        # not a placeholder. The frame data would then be passed to self.ocr_frame().
        
        if not self.ocr_active:
            # To prevent constant "OCR disabled" messages if vision_loop calls this,
            # only proceed if OCR is active. The vision_loop in assistant_worker
            # should ideally check current_config['ocrMode'] before calling.
            return None 

        # Use the ocr_frame method with the dummy image path for now
        # In a real scenario, frame_data_placeholder would be the actual frame bytes/array
        ocr_text_from_dummy = self.ocr_frame(None) # Passing None uses the dummy image by default

        # Check for common OCR error/placeholder messages to avoid treating them as slide content
        if "[ERROR: OCR failed" in ocr_text_from_dummy or \
           "Error: Image path not found" in ocr_text_from_dummy or \
           "[No text detected" in ocr_text_from_dummy or \
           "OCR is currently disabled" in ocr_text_from_dummy:
            
            # If OCR failed or returned no meaningful text, consider it as "no change" or log as needed.
            # We don't want to update last_slide_text with error messages.
            # Optionally send a status to Node if this is persistent.
            # print(f"[VisionAnalyzer] OCR on dummy image returned: {ocr_text_from_dummy}", file=sys.stderr, flush=True)
            return None


        if ocr_text_from_dummy != self.last_slide_text and len(ocr_text_from_dummy) > 3: # Min length for "significant" change
            self.last_slide_text = ocr_text_from_dummy
            timestamp = int(time.time())
            filename = f"frame_{timestamp}.jpg" # Still use .jpg, even if content is text
            filepath = os.path.join(FRAMES_DIR, filename)
            
            try:
                # Save the OCR text into the dummy .jpg file for simulation
                with open(filepath, 'w', encoding='utf-8') as f:
                    f.write(f"--- OCR Text for Frame {filename} ---\n")
                    f.write(f"Timestamp: {timestamp}\n")
                    f.write(f"Source: dummy_slide_for_ocr.png (via pytesseract)\n\n")
                    f.write(ocr_text_from_dummy)
                
                return {
                    "event_type": "new_slide",
                    "image_path": f"/frames/{filename}", 
                    "ocr_text": ocr_text_from_dummy,
                    "timestamp": timestamp
                }
            except Exception as e:
                print(f"[VisionAnalyzer Error] Failed to save frame to {filepath}: {e}", file=sys.stderr, flush=True)
                return None
        return None

    def detect_speaker(self, frame_data):
        """
        Detects or identifies the current speaker based on visual cues from a video frame.
        This is a placeholder and simulates speaker detection.
        Parameters:
            frame_data (bytes, np.array, or path): The video frame data.
                                                 Placeholder: This parameter is currently not used.
        Returns:
            str: The identifier of the detected speaker (e.g., "Speaker_1").
        """
        # TODO: Implement actual speaker detection/diarization logic:
        # - This could involve face detection, then face recognition against known participants.
        # - Or, it could be active speaker detection based on mouth movement or audio-visual correlation
        #   (though the latter might belong partly in the audio processing pipeline).
        # - If simpler, it might just identify a region of activity.
        
        # Simulate cycling through a few speakers based on frame count.
        # Return Value: A simulated speaker ID.
        return f"SimSpeaker_{(self.frame_count % 2) + 1}" # Cycle through 2 speakers for simulation consistency.

    def set_ocr_active(self, active: bool):
        """
        Enables or disables OCR processing.
        Parameters:
            active (bool): True to enable OCR, False to disable.
        Returns:
            str: A confirmation message.
        """
        self.ocr_active = active
        # Return Value: Confirmation of OCR status change.
        return f"Vision Analyzer OCR set to {'active' if active else 'inactive'}."

    def get_status(self):
        """
        Returns the current status of the VisionAnalyzer.
        Returns:
            dict: A dictionary containing the OCR active status and type.
        """
        return {"ocr_active": self.ocr_active, "type": "placeholder"}
