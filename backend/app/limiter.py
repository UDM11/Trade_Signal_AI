from slowapi import Limiter
from slowapi.util import get_remote_address
from fastapi import Request

def custom_key_func(request: Request):
    """
    Returns the user's IP for rate limiting, but returns None for static assets
    to ensure the website's styles/scripts are never blocked by the limiter.
    """
    path = request.url.path.lower()
    # Exempt common static file extensions and the assets folder
    if any(path.endswith(ext) for ext in ['.js', '.css', '.png', '.jpg', '.svg', '.ico', '.woff', '.woff2']):
        return None
    if path.startswith("/assets/"):
        return None
        
    return get_remote_address(request)

# Single shared limiter instance
# Default limit of 60/min applies only to API and page loads, not static files.
limiter = Limiter(key_func=custom_key_func, default_limits=["60/minute"])
