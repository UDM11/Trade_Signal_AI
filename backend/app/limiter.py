from slowapi import Limiter
from slowapi.util import get_remote_address

# Single shared limiter instance — imported by both main.py and api.py
limiter = Limiter(key_func=get_remote_address, default_limits=["60/minute"])
