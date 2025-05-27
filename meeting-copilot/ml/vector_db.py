import sys # For printing errors if Chroma import fails
import pathlib
import uuid
# sentence-transformers will be imported conditionally after ChromaDB check

# --- Configuration ---
ROOT_DATA_DIR = pathlib.Path(__file__).resolve().parent.parent / "data" # Should resolve to meeting-copilot/data
CHROMA_PERSIST_DIR = str(ROOT_DATA_DIR / "vector_db_chroma")
EMBEDDING_MODEL_NAME = 'sentence-transformers/all-MiniLM-L6-v2' # Using a specific model from the org
COLLECTION_NAME = "meetings_v05" # Changed collection name slightly for clarity

# --- Global Variables ---
client = None
embedder = None
collection = None
chroma_available = False
in_memory_cache = [] # For fallback

try:
    import chromadb # type: ignore
    from sentence_transformers import SentenceTransformer # type: ignore
    
    print("[VectorDB] ChromaDB and SentenceTransformer imported successfully.", flush=True)
    
    ROOT_DATA_DIR.mkdir(exist_ok=True) # Create .../meeting-copilot/data/ if it doesn't exist
    # Note: For PersistentClient, the path should be to a directory where Chroma can store its files.
    client = chromadb.PersistentClient(path=CHROMA_PERSIST_DIR) # path expects a dir
    
    embedder = SentenceTransformer(EMBEDDING_MODEL_NAME)
    
    collection = client.get_or_create_collection(
        name=COLLECTION_NAME,
        # embedding_function=embedder # Not needed if we pass embeddings directly
        # metadata={"hnsw:space": "cosine"} # Optional: L2 is default
    )
    chroma_available = True
    print(f"[VectorDB] Initialized. ChromaDB will persist to: {CHROMA_PERSIST_DIR}", flush=True)
    print(f"[VectorDB] Using embedding model: {EMBEDDING_MODEL_NAME}", flush=True)
    print(f"[VectorDB] Collection '{COLLECTION_NAME}' loaded/created. Count: {collection.count()}", flush=True)

except ImportError as e:
    print(f"[VectorDB] WARNING: ChromaDB or SentenceTransformers import failed: {e}. Using in-memory fallback.", file=sys.stderr, flush=True)
    chroma_available = False
    # Try to load embedder even for fallback, if SentenceTransformer is available but chromadb is not
    if 'SentenceTransformer' not in globals() and 'embedder' not in globals(): # Check if ST loaded
        try:
            from sentence_transformers import SentenceTransformer # type: ignore
            embedder = SentenceTransformer(EMBEDDING_MODEL_NAME)
            print(f"[VectorDB] SentenceTransformer loaded for in-memory fallback.", flush=True)
        except ImportError:
            print(f"[VectorDB] CRITICAL: SentenceTransformer import failed. In-memory fallback will not have embeddings.", file=sys.stderr, flush=True)
            embedder = None # Ensure it's None
except Exception as e: # Catch other potential errors during ChromaDB client init
    print(f"[VectorDB] CRITICAL ERROR during ChromaDB client initialization: {e}. Using in-memory fallback.", file=sys.stderr, flush=True)
    chroma_available = False
    if 'embedder' not in globals() and 'SentenceTransformer' in globals() and embedder is None: # Re-check if ST loaded but client failed
         try:
            from sentence_transformers import SentenceTransformer # type: ignore
            embedder = SentenceTransformer(EMBEDDING_MODEL_NAME) # Attempt to load embedder for fallback
            print(f"[VectorDB] SentenceTransformer loaded for in-memory fallback after client error.", flush=True)
         except Exception as se:
            print(f"[VectorDB] CRITICAL: SentenceTransformer also failed for fallback: {se}", file=sys.stderr, flush=True)
            embedder = None


def add_chunk(text: str, meta: dict):
    global collection, embedder, chroma_available, in_memory_cache
    if not embedder:
        print("[VectorDB] Embedder not available. Cannot add chunk.", file=sys.stderr, flush=True)
        return None

    # print(f"[VectorDB] add_chunk called with text: '{text[:30]}...', meta: {meta}", flush=True)
    try:
        vec = embedder.encode([text])[0].tolist() # Get the first (and only) embedding, convert to list
    except Exception as e:
        print(f"[VectorDB] Error encoding text for add_chunk: {e}", file=sys.stderr, flush=True)
        return None

    doc_id = str(uuid.uuid4())

    if chroma_available and collection is not None:
        try:
            collection.add(ids=[doc_id], embeddings=[vec], documents=[text], metadatas=[meta])
            # client.persist() # Persist may not be needed for every add with PersistentClient, check ChromaDB docs
            # print(f"[VectorDB] Added to Chroma. ID: {doc_id}", flush=True)
        except Exception as e:
            print(f"[VectorDB] Error adding to ChromaDB: {e}", file=sys.stderr, flush=True)
            # Optionally, could still add to in-memory cache as a further fallback here
    else:
        in_memory_cache.append({"id": doc_id, "text": text, "embedding": vec, "meta": meta})
        # print(f"[VectorDB] Added to in-memory cache. ID: {doc_id}", flush=True)
    return doc_id

def query(text: str, top_k: int = 3):
    global collection, embedder, chroma_available, in_memory_cache
    if not embedder:
        print("[VectorDB] Embedder not available. Cannot query.", file=sys.stderr, flush=True)
        return [{"text": "[ERROR: Embedder not available]", "meta": {}, "score": 0.0}]
    
    # print(f"[VectorDB] query called with text: '{text[:30]}...', top_k: {top_k}", flush=True)
    try:
        query_vec = embedder.encode([text])[0] # Keep as numpy array for L2 calc if fallback
    except Exception as e:
        print(f"[VectorDB] Error encoding text for query: {e}", file=sys.stderr, flush=True)
        return [{"text": f"[ERROR: Query encoding failed: {e}]", "meta": {}, "score": 0.0}]


    hits = []
    if chroma_available and collection is not None:
        try:
            res = collection.query(query_embeddings=[query_vec.tolist()], n_results=top_k) # Query expects list of lists for embeddings
            # print(f"[VectorDB] Chroma query results: {res}", flush=True)
            if res and res.get("documents") and res.get("metadatas") and res.get("distances"):
                for doc, meta, dist in zip(res["documents"][0], res["metadatas"][0], res["distances"][0]):
                    hits.append({"text": doc, "meta": meta, "score": 1.0 - dist if dist is not None else 0.0}) # Assuming cosine distance, closer to 0 is better. Convert to similarity.
        except Exception as e:
            print(f"[VectorDB] Error querying ChromaDB: {e}", file=sys.stderr, flush=True)
            # Optionally, could query in-memory cache as fallback here
    else:
        # In-memory fallback: crude L2 distance and sort
        # Requires numpy for dot product and norm if not already available via SentenceTransformer's encode output
        import numpy as np # Local import for fallback math
        
        # Sort cache by L2 distance (closer to 0 is better)
        # Ensure all embeddings in cache are numpy arrays for this math
        # This part might fail if embedder itself failed earlier.
        try:
            # Convert all stored embeddings to numpy arrays if they aren't already
            # This is a bit inefficient to do on every query for the fallback.
            # A better fallback would store them as np.array from the start.
            # For now, assume they are stored as list and convert.
            
            # This sorting key will fail if any item[1] is not a compatible vector (e.g. None)
            # Add checks or ensure embedder always works if ST is available.
            
            # Ensure query_vec is numpy array
            if not isinstance(query_vec, np.ndarray): query_vec = np.array(query_vec)

            # Filter out entries where embedding might be None if embedder failed for some items
            valid_cache_entries = [item for item in in_memory_cache if item.get("embedding") is not None]
            
            # Calculate L2 distances
            distances = []
            for item in valid_cache_entries:
                item_embedding_np = np.array(item["embedding"])
                # Basic L2 distance: sqrt(sum((vec1-vec2)^2)). Or (vec1-vec2) @ (vec1-vec2) for squared L2
                # For simplicity with dot products if normalized: dist = 1 - dot(q,v)
                # Simpler: sum of squared differences
                dist = np.sum((item_embedding_np - query_vec)**2)
                distances.append((dist, item))

            distances.sort(key=lambda x: x[0]) # Sort by distance, ascending

            for i in range(min(top_k, len(distances))):
                dist, item = distances[i]
                # For L2, smaller is better. Score could be 1 / (1 + dist) or similar.
                # For now, just use negative distance to show it's a rank.
                hits.append({"text": item["text"], "meta": item["meta"], "score": -dist }) 
            # print(f"[VectorDB] In-memory query returned {len(hits)} hits.", flush=True)

        except Exception as e:
            print(f"[VectorDB] Error during in-memory query: {e}", file=sys.stderr, flush=True)
            hits.append({"text": f"[ERROR: In-memory query failed: {e}]", "meta": {}, "score": 0.0})
        
    return hits

# Test calls (optional, can be removed or put under if __name__ == "__main__":)
# if __name__ == "__main__":
#    print("Running VectorDB self-test...")
#    if not embedder:
#        print("Embedder not loaded, cannot run self-test.")
#    else:
#        test_meta = {"meeting_id": "test_meeting", "ts": time.time(), "type": "test"}
#        add_chunk("This is a test sentence for the vector DB.", test_meta)
#        add_chunk("Another test sentence, exploring different topics.", test_meta)
#        add_chunk("Let's talk about budgets and timelines.", test_meta)
#        
#        results = query("What about the budget?", top_k=2)
#        print("
Query results for 'What about the budget?':")
#        for hit in results:
#            print(f"  Text: {hit['text']}, Score: {hit['score']:.4f}, Meta: {hit['meta']}")
#
#        results_timeline = query("Timeline discussion", top_k=1)
#        print("
Query results for 'Timeline discussion':")
#        for hit in results_timeline:
#            print(f"  Text: {hit['text']}, Score: {hit['score']:.4f}, Meta: {hit['meta']}")
#
#        if not chroma_available:
#            print(f"
In-memory cache has {len(in_memory_cache)} items.")
