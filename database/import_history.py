"""
DB Import Tool: Automated Batch Uploader
Usage: Place all historical CSV files (e.g., NRIC.csv, NTC.csv) in this folder and run.
Prerequisite: Ensure your Supabase table has a unique constraint:
    ALTER TABLE daily_ohlcv ADD CONSTRAINT unique_stock_date UNIQUE (stock_id, "date");
"""

import os
import pandas as pd
import asyncio
import glob
from supabase import create_client
from dotenv import load_dotenv

# Load environment variables from backend/.env
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
dotenv_path = os.path.join(BASE_DIR, "backend", ".env")
load_dotenv(dotenv_path=dotenv_path)

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

def clean_num(val):
    if pd.isna(val) or val == '-': return 0.0
    if isinstance(val, str):
        return float(val.replace(",", "").replace("%", "").strip())
    return float(val)

async def import_file(supabase, csv_path):
    filename = os.path.basename(csv_path)
    symbol = filename.split(".")[0].upper()
    
    print(f"\n>>> Processing {symbol} ({filename})...")
    
    try:
        df = pd.read_csv(csv_path)
        # Normalize columns
        df.columns = [c.capitalize() for c in df.columns]
    except Exception as e:
        print(f"Error reading {filename}: {e}")
        return

    # 1. Resolve stock ID
    try:
        res = supabase.table("stocks").select("id").eq("symbol", symbol).execute()
        if not res.data:
            ins = supabase.table("stocks").insert({"symbol": symbol}).execute()
            stock_id = ins.data[0]["id"]
        else:
            stock_id = res.data[0]["id"]
    except Exception as e:
        print(f"Database error for {symbol}: {e}")
        return

    # 2. Prepare payloads
    payloads = []
    for _, row in df.iterrows():
        try:
            payloads.append({
                "stock_id": stock_id,
                "date": str(row["Date"])[:10],
                "open": clean_num(row.get("Open", 0)),
                "high": clean_num(row.get("High", 0)),
                "low": clean_num(row.get("Low", 0)),
                "close": clean_num(row.get("Close", 0)),
                "volume": clean_num(row.get("Volume", 0)),
            })
        except: continue

    # 3. Batch Upload
    batch_size = 400
    success_count = 0
    for i in range(0, len(payloads), batch_size):
        batch = payloads[i:i + batch_size]
        try:
            supabase.table("daily_ohlcv").upsert(batch, on_conflict="stock_id,date").execute()
            success_count += len(batch)
        except Exception as e:
            print(f"Batch failed for {symbol} at row {i}: {e}")

    print(f"Done: {symbol} | {success_count} rows synced.")

async def main():
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("Error: SUPABASE_URL/KEY missing.")
        return

    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    files = glob.glob(os.path.join(os.path.dirname(__file__), "*.csv"))
    
    if not files:
        print("No CSV files found in database directory.")
        return

    print(f"=== Starting Batch Import for {len(files)} files ===")
    for f in files:
        if "nepse data" in f.lower(): continue # Skip the general index file
        await import_file(supabase, f)
    
    print("\n=== All Imports Completed Successfully ===")

if __name__ == "__main__":
    asyncio.run(main())
