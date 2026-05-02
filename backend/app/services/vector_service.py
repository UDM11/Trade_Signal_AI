import numpy as np
import pandas as pd
import logging
from typing import List, Dict, Optional
from datetime import datetime

logger = logging.getLogger(__name__)

class PatternSimilarityEngine:
    """
    Institutional Pattern Matching Engine.
    Fingerprints market conditions into 'Embeddings' (Vectors) and 
    finds historical analogues using Cosine Similarity.
    """
    
    def __init__(self):
        # In a production environment, this would connect to Pinecone or Milvus.
        # For our scale, we use a vectorized NumPy-based memory bank.
        self.pattern_bank = [] # List of {vector: np.array, meta: dict}
        self.initialized = False

    def create_embedding(self, df: pd.DataFrame, window=20) -> Optional[np.array]:
        """
        Creates a 'Market Fingerprint' vector from normalized indicators.
        Uses Price ROC, RSI, and Volatility to describe the 'shape' of the market.
        """
        if len(df) < window: return None
        
        subset = df.iloc[-window:].copy()
        
        # 1. Price Momentum (Normalized)
        prices = subset['Close'].values
        price_norm = (prices - np.min(prices)) / (np.max(prices) - np.min(prices) + 1e-9)
        
        # 2. RSI Shape
        if 'RSI' in subset.columns:
            rsi = subset['RSI'].values / 100.0 # Normalize to [0,1]
        else:
            rsi = np.zeros(window)
            
        # 3. Volatility Profile
        if 'High' in subset.columns and 'Low' in subset.columns:
            vol = (subset['High'] - subset['Low']).values / subset['Close'].values
            vol_norm = vol / (np.max(vol) + 1e-9)
        else:
            vol_norm = np.zeros(window)

        # Concatenate into a single feature vector
        vector = np.concatenate([price_norm, rsi, vol_norm])
        return vector

    def find_historical_match(self, current_vector: np.array) -> Dict:
        """
        Performs a vector search to find the most similar historical pattern.
        """
        if not self.pattern_bank:
            return {"similarity": 0, "date": "N/A", "event": "No History Indexed"}

        similarities = []
        for entry in self.pattern_bank:
            # Cosine Similarity: (A dot B) / (||A|| * ||B||)
            vec = entry['vector']
            sim = np.dot(current_vector, vec) / (np.linalg.norm(current_vector) * np.linalg.norm(vec) + 1e-9)
            similarities.append(sim)

        best_idx = np.argmax(similarities)
        score = float(similarities[best_idx])
        match = self.pattern_bank[best_idx]['meta']
        
        return {
            "similarity": round(score * 100, 1),
            "date": match.get('date', 'Unknown'),
            "event": match.get('label', 'Historical Analogue'),
            "description": f"{round(score*100)}% match to {match.get('label')}"
        }

    def seed_historical_patterns(self):
        """
        Seeds the bank with known historical NEPSE patterns (e.g., 2021 Bull Run).
        In a real app, this would be a bulk-load from the database.
        """
        # Mocking a few critical NEPSE historical vectors for demonstration
        # Date: Aug 2021 (Start of Peak)
        self.pattern_bank.append({
            "vector": np.random.rand(60), # In reality, pre-calculated from 2021 data
            "meta": {"date": "Aug 2021", "label": "NEPSE All-Time High Peak"}
        })
        self.pattern_bank.append({
            "vector": np.random.rand(60),
            "meta": {"date": "Jan 2023", "label": "Early Recovery Phase"}
        })
        self.pattern_bank.append({
            "vector": np.random.rand(60),
            "meta": {"date": "Jun 2020", "label": "Post-Lockdown Bull Start"}
        })
        self.initialized = True
        logger.info(f"Vector Similarity Bank seeded with {len(self.pattern_bank)} patterns")

# Singleton
similarity_engine = PatternSimilarityEngine()
similarity_engine.seed_historical_patterns()
