import os
import sys
import asyncio
import logging
from dotenv import load_dotenv

# Setup Python paths and Environment variables
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.append(os.path.join(BASE_DIR, "backend"))

dotenv_path = os.path.join(BASE_DIR, "backend", ".env")
load_dotenv(dotenv_path=dotenv_path)

# Disable verbose logging so progress is clean
logging.basicConfig(level=logging.WARNING)
logger = logging.getLogger("sync_all_history")
logger.setLevel(logging.INFO)

async def main():
    print("=== TRADE SIGNAL AI - FULL HISTORY SYNC ===")
    print("This script will fetch and save up to 6 years of historical OHLCV data")
    print("for all active NEPSE stock symbols into Supabase.")
    print("===========================================\n")
    
    # 1. Initialize Supabase
    from app.services.supabase_client import get_supabase
    supabase = get_supabase()
    if not supabase:
        print("Error: Supabase client could not be initialized. Check backend/.env credentials.")
        return

    # 2. Pre-populate NEPSE Security ID cache
    from app.services.nepse_service import get_live_data, _symbol_id_cache
    print("Initializing NEPSE client and fetching Security IDs...")
    try:
        await get_live_data(force_refresh=True)
        print(f"Successfully cached {len(_symbol_id_cache)} Security IDs from NEPSE.")
    except Exception as e:
        print(f"Warning: Failed to fetch live market data for ID caching: {e}")

    # 3. Fetch all symbols
    from app.services.scheduler import _fetch_all_nepse_symbols_direct
    print("Resolving active stock symbols...")
    symbols = await _fetch_all_nepse_symbols_direct()
    
    if not symbols:
        print("Error: No symbols found.")
        return
        
    print(f"Found {len(symbols)} symbols to sync.\n")
    print("Starting sync (with 0.5s delay between stocks to prevent API rate-limiting)...")
    
    from app.services.nepse_service import get_stock_chart
    
    success = 0
    failed = 0
    skipped = 0
    
    for idx, sym in enumerate(symbols, 1):
        sym = sym.strip().upper()
        if sym == "NEPSE":
            skipped += 1
            continue
            
        print(f"[{idx}/{len(symbols)}] Syncing {sym}...", end="", flush=True)
        try:
            # get_stock_chart will check DB, fetch from NEPSE and write-through cache to Supabase
            result = await get_stock_chart(sym)
            if "error" in result:
                print(f" FAILED: {result['error']}")
                failed += 1
            else:
                count = result.get("count", 0)
                print(f" SUCCESS! Synced {count} days of history.")
                success += 1
        except Exception as e:
            print(f" ERROR: {e}")
            failed += 1
            
        # 0.5 seconds sleep between each stock to respect NEPSE API limits
        await asyncio.sleep(0.5)
        
    print("\n=== SYNC COMPLETE ===")
    print(f"Successful: {success}")
    print(f"Failed:     {failed}")
    print(f"Skipped:    {skipped}")
    print("=====================")

if __name__ == "__main__":
    asyncio.run(main())
