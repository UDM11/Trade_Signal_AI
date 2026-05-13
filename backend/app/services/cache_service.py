import redis
import json
import logging
import os
import time
from functools import wraps

logger = logging.getLogger(__name__)

# Config
REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))
REDIS_PASSWORD = os.getenv("REDIS_PASSWORD", None)

class CacheService:
    def __init__(self):
        self._mem_cache = {}
        self._mem_expiry = {}
        try:
            self.client = redis.Redis(
                host=REDIS_HOST,
                port=REDIS_PORT,
                password=REDIS_PASSWORD,
                decode_responses=True,
                socket_timeout=2
            )
            self.client.ping()
            self.enabled = True
            logger.info(f"Redis Cache initialized at {REDIS_HOST}:{REDIS_PORT}")
        except Exception as e:
            self.enabled = False
            logger.warning(f"Redis not available, falling back to In-Memory Cache: {e}")

    def get(self, key: str):
        # 1. Try Redis first if enabled
        if self.enabled:
            try:
                data = self.client.get(key)
                if data: return json.loads(data)
            except Exception: pass
            
        # 2. Fallback to Memory Cache (Instant response)
        if key in self._mem_cache:
            if time.time() < self._mem_expiry.get(key, 0):
                return self._mem_cache[key]
            else:
                # Cleanup expired
                del self._mem_cache[key]
                del self._mem_expiry[key]
        return None

    def set(self, key: str, value, expire=300):
        # 1. Store in Memory for maximum speed (~0.1ms)
        self._mem_cache[key] = value
        self._mem_expiry[key] = time.time() + expire
        
        # 2. Store in Redis for persistence across restarts
        if self.enabled:
            try:
                self.client.set(key, json.dumps(value), ex=expire)
            except Exception as e:
                logger.error(f"Redis SET failed: {e}")

    def cache_signal(self, symbol: str, data: dict):
        key = f"signal:{symbol}"
        self.set(key, data, expire=300) # 5 Minute Cache

    def get_signal(self, symbol: str):
        return self.get(f"signal:{symbol}")

# Singleton
cache = CacheService()

def cached_api_response(key_prefix: str, expire=300):
    """
    Decorator for FastAPI endpoints to automatically cache responses.
    """
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # Create a unique key based on arguments (excluding Request object)
            from fastapi import Request
            key_args = [str(v) for v in kwargs.values() if not isinstance(v, Request)]
            arg_str = ":".join(key_args)
            cache_key = f"{key_prefix}:{arg_str}"
            
            cached_data = cache.get(cache_key)
            if cached_data:
                return cached_data
            
            result = await func(*args, **kwargs)
            # Only cache if result is a dictionary or list (serializable)
            if isinstance(result, (dict, list)):
                cache.set(cache_key, result, expire=expire)
            return result
        return wrapper
    return decorator
