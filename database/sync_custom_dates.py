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
logger = logging.getLogger("sync_custom_dates")
logger.setLevel(logging.INFO)

# Helper function to extract numeric values from candidate keys
def _g(d: dict, *keys, t=float, default=0):
    for k in keys:
        v = d.get(k)
        if v not in (None, "", "N/A", "null", 0, 0.0, "0", "0.0", "-"):
            try:
                r = t(v)
                if r != 0:
                    return r
            except Exception:
                continue
    return default

async def main():
    print("=== TRADE SIGNAL AI - CUSTOM DATES SYNC ===")
    print("This script will fetch and save OHLCV data for all active NEPSE stocks")
    print("into Supabase for specified dates.")
    print("===========================================\n")
    
    # 1. Generate a continuous range of target dates (inclusive, skipping Saturdays & Sundays)
    import datetime
    start_date = datetime.date(2026, 6, 21)
    end_date = datetime.date(2026, 7, 1)
    
    target_dates = []
    curr = start_date
    while curr <= end_date:
        # NEPSE is closed on Saturday (5) and Sunday (6)
        if curr.weekday() not in (5, 6):
            target_dates.append(curr.strftime("%Y-%m-%d"))
        curr += datetime.timedelta(days=1)
        
    print(f"Target Sync Dates ({len(target_dates)} trading days): {', '.join(target_dates)}")

    # 2. Initialize Supabase
    from app.services.supabase_client import get_supabase
    supabase = get_supabase()
    if not supabase:
        print("Error: Supabase client could not be initialized. Check backend/.env credentials.")
        return

    # 3. Get existing stocks from DB to map symbol -> ID
    print("Fetching active stock symbols from Supabase...")
    db_stocks = supabase.table("stocks").select("id, symbol").execute()
    if not db_stocks.data:
        print("Error: No stocks found in the database. Please sync/run model first.")
        return
    stock_map = {r["symbol"].upper().strip(): r["id"] for r in db_stocks.data}
    print(f"Loaded {len(stock_map)} symbols from Supabase stocks table.\n")

    # 4. Initialize NEPSE client
    from app.services.nepse_service import _client, _to_list
    nepse = await _client()

    for target_date in target_dates:
        print(f"Fetching OHLCV data from NEPSE for: {target_date}...", end="", flush=True)
        try:
            # getPriceVolumeHistory returns all stocks' data for a specific date in a single request
            raw_data = await nepse.getPriceVolumeHistory(business_date=target_date)
            rows = _to_list(raw_data)
            if not rows:
                print(f" FAILED (No data returned from NEPSE API for this date).")
                continue
            
            print(f" SUCCESS! Received {len(rows)} stock rows.")
            
            payloads = []
            new_stocks_to_insert = set()
            
            # First pass: identify any symbols not yet in the DB
            for row in rows:
                if not isinstance(row, dict):
                    continue
                sym = (row.get("symbol") or row.get("securityName") or "").upper().strip()
                if not sym or sym == "NEPSE":
                    continue
                if sym not in stock_map:
                    new_stocks_to_insert.add(sym)

            # Insert missing stocks
            if new_stocks_to_insert:
                print(f"Found {len(new_stocks_to_insert)} new symbols to add to the database...")
                for sym in new_stocks_to_insert:
                    try:
                        ins_res = supabase.table("stocks").insert({"symbol": sym}).execute()
                        if ins_res.data:
                            stock_map[sym] = ins_res.data[0]["id"]
                    except Exception as e:
                        print(f"Warning: Could not create stock entry for {sym}: {e}")

            # Prepare daily_ohlcv payloads
            for row in rows:
                if not isinstance(row, dict):
                    continue
                sym = (row.get("symbol") or row.get("securityName") or "").upper().strip()
                if not sym or sym == "NEPSE":
                    continue
                
                stock_id = stock_map.get(sym)
                if not stock_id:
                    continue

                close = _g(row, "closePrice", "close", "lastTradedPrice", "ltp")
                if close == 0:
                    continue

                open_price = _g(row, "openPrice", "open", "todayOpen", "openingPrice")
                high_price = _g(row, "highPrice", "high", "todayHigh")
                low_price = _g(row, "lowPrice", "low", "todayLow")
                volume = _g(row, "totalTradeQuantity", "totalTradedQuantity", "volume", "tradedQuantity", t=int)

                # Heal missing OHLC if needed
                if open_price == 0:
                    open_price = close
                if high_price == 0:
                    high_price = max(open_price, close)
                if low_price == 0:
                    low_price = min(open_price, close)

                payloads.append({
                    "stock_id": stock_id,
                    "date":     target_date,
                    "open":     open_price,
                    "high":     high_price,
                    "low":      low_price,
                    "close":    close,
                    "volume":   volume
                })

            if payloads:
                print(f"Upserting {len(payloads)} records into Supabase for {target_date}...")
                batch_size = 100
                success_count = 0
                for i in range(0, len(payloads), batch_size):
                    batch = payloads[i:i + batch_size]
                    try:
                        supabase.table("daily_ohlcv").upsert(batch, on_conflict="stock_id,date").execute()
                        success_count += len(batch)
                    except Exception as e:
                        print(f"Batch failed at index {i}: {e}")
                print(f"Successfully upserted {success_count}/{len(payloads)} records for {target_date}.\n")
            else:
                print(f"No valid records found to upsert for {target_date}.\n")

        except Exception as e:
            print(f" ERROR: {e}\n")
        
        # Sleep briefly between dates to be polite to NEPSE API
        await asyncio.sleep(1)

    print("=== SYNC PROCESS FINISHED ===")

if __name__ == "__main__":
    asyncio.run(main())
