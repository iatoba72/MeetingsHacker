import sys
import time
# For Local LLMs (HuggingFace) - uncomment when implementing
# from transformers import AutoModelForCausalLM, AutoTokenizer # type: ignore
# import torch # type: ignore

# For OpenAI - uncomment when implementing
# from openai import OpenAI # type: ignore

from vector_db import query as vec_query, initialized_successfully as vdb_initialized_successfully # Vector DB integration

SYSTEM_PROMPT = "You are a helpful meeting assistant. Analyze the provided context and user question to provide concise and relevant answers or summaries."

class LLMProcessor:
    def __init__(self, config=None):
        self.config = config if config else {}
        self.llm_backend = self.config.get('llmBackend', 'LOCAL')
        self.model_name_or_path = self.config.get('llmModel', 'distilgpt2') # Default local
        self.llm_endpoints = self.config.get('llmEndpoints', [])
        
        self.client = None # For OpenAI
        self.model = None # For Local / or to indicate readiness for API backends
        self.tokenizer = None # For Local
        
        self._load_model()

    def _load_model(self):
        print(f"[LLMProcessor] Initializing LLM. Backend: {self.llm_backend}, Model: {self.model_name_or_path}", flush=True)
        self._reset_llm_state() # Clear previous state before loading
        try:
            if self.llm_backend == "LOCAL":
                # TODO: Implement actual local HuggingFace model loading
                # self.tokenizer = AutoTokenizer.from_pretrained(self.model_name_or_path)
                # self.model = AutoModelForCausalLM.from_pretrained(self.model_name_or_path)
                # Consider: device_map="auto", torch_dtype=torch.float16, load_in_8bit=True / load_in_4bit=True
                print(f"[LLMProcessor] LOCAL model '{self.model_name_or_path}' loading (Simulated - TODO).", flush=True)
                self.model = object() # Simulate successful load
                self.tokenizer = object() # Simulate successful load
            elif self.llm_backend == "OPENAI":
                openai_cfg = next((ep for ep in self.llm_endpoints if ep.get("name") == "openai"), None)
                if openai_cfg and openai_cfg.get("key"):
                    # TODO: Implement OpenAI client initialization
                    # self.client = OpenAI(api_key=openai_cfg.get("key"))
                    self.model = object() # Indicate OpenAI is ready (client would be self.client)
                    print("[LLMProcessor] OpenAI client configured (Simulated - TODO).", flush=True)
                else:
                    print("[LLMProcessor] ERROR: OpenAI config/key not found in llmEndpoints.", file=sys.stderr, flush=True)
                    self.llm_backend = "NONE" # Fallback if essential config missing
            elif self.llm_backend == "GROK": # Example of another backend
                print("[LLMProcessor] GROK backend not implemented (Simulated - TODO).", flush=True)
                self.llm_backend = "NONE" # Mark as unusable or not implemented
            # Add other backends like ANTHROPIC, OLLAMA, CUSTOM_API similarly
            # For OLLAMA or CUSTOM_API, self.model might represent a requests session or similar
            elif self.llm_backend in ["ANTHROPIC", "OLLAMA", "CUSTOM_API"]:
                 print(f"[LLMProcessor] {self.llm_backend} backend not fully implemented (Simulated - TODO).", flush=True)
                 # Potentially check for endpoint URL here
                 endpoint_cfg = next((ep for ep in self.llm_endpoints if ep.get("name") == self.llm_backend.lower()), None)
                 if endpoint_cfg and endpoint_cfg.get("url"):
                     self.model = object() # Indicates ready to make API calls
                     print(f"[LLMProcessor] {self.llm_backend} client configured with URL (Simulated - TODO).", flush=True)
                 else:
                     print(f"[LLMProcessor] ERROR: {self.llm_backend} URL not found in llmEndpoints.", file=sys.stderr, flush=True)
                     self.llm_backend = "NONE"
            else:
                print(f"[LLMProcessor] Unknown LLM backend: {self.llm_backend}. No LLM.", file=sys.stderr, flush=True)
                self.llm_backend = "NONE"
        except Exception as e:
            print(f"[LLMProcessor] CRITICAL ERROR loading LLM ({self.llm_backend} - {self.model_name_or_path}): {e}", file=sys.stderr, flush=True)
            self._reset_llm_state() # Ensure clean state on error
            self.llm_backend = "NONE" # Mark as unusable

    def _reset_llm_state(self):
        self.model = None
        self.tokenizer = None
        self.client = None

    def generate_response(self, prompt, is_user_question=False, max_tokens=150):
        """
        Generates a response from the LLM based on the provided prompt.
        Parameters:
            prompt (str): The input prompt for the LLM.
            is_user_question (bool): Flag indicating if this is a direct user question (might influence formatting or specific API calls).
            max_tokens (int): The maximum number of tokens to generate.
        Returns:
            str: The LLM's generated response, or an error message if not available.
        """
        if self.llm_backend == "NONE" or not self.model:
            return "[ERROR: LLM not available or not loaded properly]"

        # Context Retrieval from VectorDB
        context_str = "[No context retrieved from VectorDB]"
        if vdb_initialized_successfully:
            query_for_vdb = prompt 
            if len(prompt) > 256: # Optional: Truncate very long prompts
                query_for_vdb = prompt[:256]
            
            if query_for_vdb.strip():
                context_items = vec_query(query_for_vdb, top_k=3)
                if context_items and isinstance(context_items, list) and not any("[ERROR:" in str(s) for s in context_items):
                    valid_texts = [item.get('text', str(item)) for item in context_items if isinstance(item, dict) and item.get('text')]
                    if not valid_texts:
                         valid_texts = [str(item) for item in context_items if isinstance(item, str) and not "[ERROR:" in item]
                    if valid_texts:
                        context_str = "\n".join([f"> {text_item}" for text_item in valid_texts])
                    else:
                        context_str = "[No relevant text found in VectorDB for this query]"
            else:
                context_str = "[VectorDB query was empty or invalid]"
        
        final_prompt = f"{SYSTEM_PROMPT}\n\n# Relevant Context from Meeting History:\n{context_str}\n\n# User's Request:\n{prompt}\n\n# Answer:"

        # Simulate processing delay
        time.sleep(0.1) 

        # TODO: Implement actual generation logic using final_prompt for LOCAL (HuggingFace)
        if self.llm_backend == "LOCAL":
            # input_ids = self.tokenizer.encode(final_prompt, return_tensors="pt")
            # output_sequences = self.model.generate(input_ids, max_length=max_tokens)
            # response_text = self.tokenizer.decode(output_sequences[0], skip_special_tokens=True)
            # return response_text
            return f"[Simulated LOCAL LLM ({self.model_name_or_path}) response to: {final_prompt[:150]}... Max tokens: {max_tokens}]"

        # TODO: Implement actual generation logic using final_prompt for OpenAI
        elif self.llm_backend == "OPENAI":
            # if self.client:
            #     try:
            #         completion = self.client.chat.completions.create(
            #             model=self.model_name_or_path, 
            #             messages=[{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": f"# Relevant Context:\n{context_str}\n\n# User's Request:\n{prompt}"}],
            #             max_tokens=max_tokens
            #         )
            #         return completion.choices[0].message.content
            #     except Exception as e:
            #         print(f"[LLMProcessor] OpenAI API error: {e}", file=sys.stderr, flush=True)
            #         return "[ERROR: OpenAI API call failed]"
            return f"[Simulated OPENAI LLM ({self.model_name_or_path}) response to: {final_prompt[:150]}... Max tokens: {max_tokens}]"
        
        # Add placeholders for other backends
        elif self.llm_backend in ["ANTHROPIC", "OLLAMA", "CUSTOM_API", "GROK"]:
             return f"[Simulated {self.llm_backend} response to: {final_prompt[:150]}... Max tokens: {max_tokens} (Not Implemented)]"

        return "[ERROR: LLM backend not recognized for generation]"


    def set_config(self, new_config_dict):
        """
        Updates the LLM processor's configuration and reloads the model if necessary.
        Parameters:
            new_config_dict (dict): The new configuration dictionary.
        Returns:
            str: A status message indicating the outcome of the configuration update.
        """
        needs_reload = False
        
        new_backend = new_config_dict.get('llmBackend')
        if new_backend and self.llm_backend != new_backend:
            self.llm_backend = new_backend
            needs_reload = True

        new_model_name = new_config_dict.get('llmModel')
        if new_model_name and self.model_name_or_path != new_model_name:
            self.model_name_or_path = new_model_name
            # For LOCAL, model name change always means reload. For API, it depends on client re-init.
            if self.llm_backend == "LOCAL" or self.llm_backend == "OPENAI": # OpenAI model name is part of API call, but client might need re-check for settings
                 needs_reload = True 
        
        new_endpoints = new_config_dict.get('llmEndpoints')
        if new_endpoints and self.llm_endpoints != new_endpoints:
             self.llm_endpoints = new_endpoints
             # Reload if current backend relies on endpoints (OpenAI, Anthropic, Custom etc.)
             if self.llm_backend in ["OPENAI", "ANTHROPIC", "OLLAMA", "CUSTOM_API"]:
                 needs_reload = True
        
        self.config = new_config_dict # Update the internal config
        
        if needs_reload:
            print(f"[LLMProcessor] Configuration changed, attempting to reload model/client.", flush=True)
            self._load_model()
        
        status_msg = f"LLM config updated. Current Backend: {self.llm_backend}, Model/Path: {self.model_name_or_path}."
        if needs_reload:
            status_msg += " Model/client re-evaluation attempted."
        if self.llm_backend != "NONE" and not self.model: # self.model is a simple object() for API readiness
            status_msg += " CURRENTLY NOT LOADED/FAILED."
        elif self.llm_backend != "NONE" and self.model:
             status_msg += " Model/Client appears ready."
        else: # Backend is NONE
            status_msg += " LLM backend is set to NONE."
            
        return status_msg
