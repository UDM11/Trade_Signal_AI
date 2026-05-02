import redis
import json
import logging
import os
from functools import wraps

logger = logging.getLogger(__name__)

# Config
REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))
REDIS_PASSWORD = os.getenv("REDIS_PASSWORD", None)

class CacheService:
    def __init__(self):
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
            logger.warning(f"Redis not available, falling back to No-Cache: {e}")

    def get(self, key: str):
        if not self.enabled: return None
        try:
            data = self.client.get(key)
            return json.loads(data) if data else None
        except Exception:
            return None

    def set(self, key: str, value, expire=300):
        if not self.enabled: return
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
            if not cache.enabled:
                return await func(*args, **kwargs)
            
            # Create a unique key based on arguments (excluding Request object)
            from fastapi import Request
            key_args = [str(v) for v in kwargs.values() if not isinstance(v, Request)]
            arg_str = ":".join(key_args)
            cache_key = f"{key_prefix}:{arg_str}"
            
            cached_data = cache.get(cache_key)
            if cached_data:
                logger.debug(f"Cache Hit: {cache_key}")
                return cached_data
            
            result = await func(*args, **kwargs)
            # Only cache if result is a dictionary or list (serializable)
            if isinstance(result, (dict, list)):
                cache.set(cache_key, result, expire=expire)
            return result
        return wrapper
    return decorator
