import os
import logging
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

_SUPABASE_URL = os.getenv("SUPABASE_URL", "").strip()
_SUPABASE_KEY = os.getenv("SUPABASE_KEY", "").strip()

_client: Client | None = None

def get_supabase() -> Client | None:
    global _client
    if not _SUPABASE_URL or not _SUPABASE_KEY or _SUPABASE_URL == "your_supabase_url_here":
        return None
    if _client is None:
        try:
            _client = create_client(_SUPABASE_URL, _SUPABASE_KEY)
        except Exception as e:
            logger.error("Failed to initialize Supabase client: %s", e)
            return None
    return _client
