
import os
import pandas as pd
import asyncio
from supabase import create_client
from dotenv import load_dotenv

# --- CONFIGURATION ---
SYMBOL = "NTC"           # <-- Change this to the stock symbol (e.g., "NTC")
FILE_NAME = "NTC.csv"    # <-- Change this to your CSV filename
# ---------------------

# Load environment variables from backend/.env
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
dotenv_path = os.path.join(BASE_DIR, "backend", ".env")
load_dotenv(dotenv_path=dotenv_path)

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

async def run_import():
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("Error: Could not find SUPABASE_URL/KEY in backend/.env")
        return

    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    csv_path = os.path.join(os.path.dirname(__file__), FILE_NAME)

    if not os.path.exists(csv_path):
        print(f"Error: File '{FILE_NAME}' not found in database folder.")
        return

    print(f"--- Starting Import for {SYMBOL} ---")
    
    # 1. Read and Clean CSV
    try:
        df = pd.read_csv(csv_path)
        print(f"Read {len(df)} rows from CSV.")
    except Exception as e:
        print(f"Error reading CSV: {e}")
        return

    # 2. Get or Create Stock ID automatically
    try:
        res = supabase.table("stocks").select("id").eq("symbol", SYMBOL.upper()).execute()
        if not res.data:
            print(f"Symbol {SYMBOL} not found in database. Creating it...")
            ins = supabase.table("stocks").insert({"symbol": SYMBOL.upper()}).execute()
            stock_id = ins.data[0]["id"]
        else:
            stock_id = res.data[0]["id"]
        print(f"Database ID for {SYMBOL}: {stock_id}")
    except Exception as e:
        print(f"Database error: {e}")
        return

    # 3. Prepare Data for Supabase
    payloads = []
    for _, row in df.iterrows():
        def clean_num(val):
            if pd.isna(val): return 0.0
            if isinstance(val, str):
                return float(val.replace(",", "").replace("%", "").strip())
            return float(val)

        try:
            payloads.append({
                "stock_id": stock_id,
                "date": str(row["Date"])[:10], # Ensure YYYY-MM-DD
                "open": clean_num(row.get("Open", 0)),
                "high": clean_num(row.get("High", 0)),
                "low": clean_num(row.get("Low", 0)),
                "close": clean_num(row.get("Close", 0)),
                "volume": clean_num(row.get("Volume", 0)),
            })
        except Exception as e:
            continue

    # 4. Upload in batches
    batch_size = 100
    print(f"Uploading {len(payloads)} records in batches...")
    
    for i in range(0, len(payloads), batch_size):
        batch = payloads[i:i + batch_size]
        try:
            # Upsert handles updates if date already exists
            supabase.table("daily_ohlcv").upsert(batch, on_conflict="stock_id,date").execute()
            print(f"Successfully uploaded rows {i} to {i + len(batch)}")
        except Exception as e:
            print(f"Batch failed at row {i}. Error: {e}")

    print(f"\nSUCCESS! {SYMBOL} history is now in Supabase.")
    print("You can now see the full history in the Live Market chart.")

if __name__ == "__main__":
    asyncio.run(run_import())