"""
Automated daily prediction scheduler.

Runs at 15:15 NPT (09:30 UTC) Mon–Fri, right after market close.
For every active NEPSE stock: fetches OHLCV history → indicators →
trains ensemble model → generates BUY/SELL/HOLD → saves to Supabase + local.
"""

import asyncio
import logging
import math
from datetime import datetime, timezone

import httpx
import pandas as pd
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler(timezone="UTC")

# ── Status exposed via /api/predictions/status ──────────────────────────────
_job_status: dict = {
    "last_run":     None,
    "last_finish":  None,
    "last_results": None,
    "running":      False,
    "job_type":     None,   # "scan" | "retrain"
    "progress":     {"current": 0, "total": 0}
}


# ── Helpers ──────────────────────────────────────────────────────────────────

def _chart_to_df(chart_data: list) -> pd.DataFrame:
    """Convert get_stock_chart() output to a canonical OHLCV DataFrame."""
    if not chart_data:
        return pd.DataFrame()
    df = pd.DataFrame(chart_data)
    df = df.rename(columns={
        "time":  "Date",
        "open":  "Open",
        "high":  "High",
        "low":   "Low",
        "close": "Close",
        "value": "Volume",
    })
    df["Date"] = pd.to_datetime(df["Date"], errors="coerce")
    df = df.dropna(subset=["Date"]).sort_values("Date").reset_index(drop=True)
    for col in ("Open", "High", "Low", "Close", "Volume"):
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0)
    return df


def _safe_float(val, default=0.0, decimals=2):
    try:
        v = float(val)
        return round(v, decimals) if not (math.isnan(v) or math.isinf(v)) else default
    except Exception:
        return default


def _build_indicators_summary(latest) -> dict:
    f = _safe_float
    return {
        "RSI":           f(latest.get("RSI"),           0),
        "MACD":          f(latest.get("MACD"),          0, 4),
        "MACD_diff":     f(latest.get("MACD_diff"),     0, 4),
        "MA_50":         f(latest.get("MA_50"),         0),
        "MA_200":        f(latest.get("MA_200"),        0),
        "EMA_9":         f(latest.get("EMA_9"),         0),
        "EMA_21":        f(latest.get("EMA_21"),        0),
        "EMA_Cross":     int(latest.get("EMA_Cross",    0) or 0),
        "Above_MA50":    int(latest.get("Above_MA50",   0) or 0),
        "Above_MA200":   int(latest.get("Above_MA200",  0) or 0),
        "Stoch_K":       f(latest.get("Stoch_K"),       50),
        "Stoch_D":       f(latest.get("Stoch_D"),       50),
        "Momentum_5":    f(latest.get("Momentum_5"),    0, 4),
        "Momentum_10":   f(latest.get("Momentum_10"),   0, 4),
        "BB_Width":      f(latest.get("BB_Width"),      0, 4),
        "BB_pct_B":      f(latest.get("BB_pct_B"),      0.5, 4),
        "ATR":           f(latest.get("ATR"),           0),
        "ATR_Ratio":     f(latest.get("ATR_Ratio"),     0, 4),
        "Volatility":    f(latest.get("Volatility"),    0, 4),
        "OBV_Ratio":     f(latest.get("OBV_Ratio"),     1, 4),
        "Volume_Change": f(latest.get("Volume_Change"), 0, 4),
        "Volume_Ratio":  f(latest.get("Volume_Ratio"),  1, 4),
        "Close":         f(latest.get("Close"),         0),
        "Support":       f(latest.get("Support"),       0),
        "Resistance":    f(latest.get("Resistance"),    0),
        "Candle_Body":   f(latest.get("Candle_Body"),   0, 4),
        "ADX":           f(latest.get("ADX"),           0),
        "ADX_pos":       f(latest.get("ADX_pos"),       0),
        "ADX_neg":       f(latest.get("ADX_neg"),       0),
        "Range52W_Pct":  round(float(latest.get('Range52W_Pct', 0.5)), 4),
        "Williams_R":    f(latest.get("Williams_R"),    -50),
        "CMF":           f(latest.get("CMF"),           0, 4),
        "ROC_3":         f(latest.get("ROC_3"),         0, 4),
        "ROC_6":         f(latest.get("ROC_6"),         0, 4),
        "Consec_Up":     int(latest.get("Consec_Up",    0) or 0),
        "Consec_Down":   int(latest.get("Consec_Down",  0) or 0),
        "RSI_Slope":     f(latest.get("RSI_Slope"),     0, 4),
        "BB_Squeeze":    int(latest.get("BB_Squeeze",   0) or 0),
        "VWAP_Ratio":    f(latest.get("VWAP_Ratio"),    1, 4),
        "Volume_Surge":  int(latest.get("Volume_Surge", 0) or 0),
    }


def calculate_volume_profile(df: pd.DataFrame, bins: int = 24) -> list:
    """
    Calculates Volume Profile (Volume at Price).
    Divides the price range into 'bins' and sums volume for each.
    """
    if df.empty or len(df) < 5:
        return []
    
    price_min = df['Low'].min()
    price_max = df['High'].max()
    
    if price_max == price_min:
        return []
        
    bin_size = (price_max - price_min) / bins
    profiles = []
    
    for i in range(bins):
        b_low  = price_min + (i * bin_size)
        b_high = b_low + bin_size
        
        # Sum volume where price was within this bin
        # We use a simple approximation: if Close is in bin, add Volume
        mask = (df['Close'] >= b_low) & (df['Close'] < b_high)
        vol  = df.loc[mask, 'Volume'].sum()
        
        profiles.append({
            "price": round(b_low + (bin_size / 2), 2),
            "volume": float(vol),
            "low": round(b_low, 2),
            "high": round(b_high, 2)
        })
        
    return profiles


def calculate_fibonacci(df: pd.DataFrame, lookback: int = 120) -> dict:
    """
    Calculates Fibonacci Retracement levels (0.236, 0.382, 0.5, 0.618, 0.786).
    Uses the highest high and lowest low over the lookback period.
    """
    if df.empty or len(df) < 20:
        return {}
        
    recent_df = df.tail(lookback)
    high = recent_df['High'].max()
    low  = recent_df['Low'].min()
    diff = high - low
    
    if diff == 0:
        return {}
        
    return {
        "high": round(high, 2),
        "low":  round(low, 2),
        "levels": {
            "0.236": round(high - (0.236 * diff), 2),
            "0.382": round(high - (0.382 * diff), 2),
            "0.5":   round(high - (0.5 * diff), 2),
            "0.618": round(high - (0.618 * diff), 2),
            "0.786": round(high - (0.786 * diff), 2),
        }
    }


def resample_ohlcv(df: pd.DataFrame, freq: str = 'W') -> pd.DataFrame:
    """
    Resamples daily OHLCV data to a different frequency (e.g., 'W' for Weekly).
    """
    if df.empty: return df
    
    # Ensure index is datetime
    df_res = df.copy()
    if 'Date' in df_res.columns:
        df_res['Date'] = pd.to_datetime(df_res['Date'])
        df_res.set_index('Date', inplace=True)
    
    logic = {
        'Open':  'first',
        'High':  'max',
        'Low':   'min',
        'Close': 'last',
        'Volume': 'sum'
    }
    
    # Also include indicators if they exist
    for col in df_res.columns:
        if col not in logic:
            logic[col] = 'last'
            
    return df_res.resample(freq).apply(logic).dropna()


async def _save_to_db(symbol: str, payload: dict, df: pd.DataFrame = None) -> None:
    """Upsert prediction to Supabase and always mirror to local JSON."""
    from app.routes.api import _upsert_local
    from app.services.supabase_client import get_supabase

    supabase = get_supabase()
    if supabase:
        try:
            # 1. Resolve or Create Stock entry
            stock_res = supabase.table("stocks").select("id").eq("symbol", symbol).execute()
            if not stock_res.data:
                ins_res  = supabase.table("stocks").insert({"symbol": symbol}).execute()
                stock_id = ins_res.data[0]["id"]
            else:
                stock_id = stock_res.data[0]["id"]

            # 2. Sync OHLCV History (The "1 Year Data" requested by user)
            if df is not None and not df.empty:
                try:
                    ohlcv_batch = []
                    # Sync more rows to support long-term history (up to ~10 years)
                    sync_df = df.tail(2500) 
                    for _, row in sync_df.iterrows():
                        d_str = row["Date"].strftime("%Y-%m-%d") if hasattr(row["Date"], "strftime") else str(row["Date"])[:10]
                        ohlcv_batch.append({
                            "stock_id": stock_id,
                            "date":     d_str,
                            "open":     float(row.get("Open", 0)),
                            "high":     float(row.get("High", 0)),
                            "low":      float(row.get("Low", 0)),
                            "close":    float(row.get("Close", 0)),
                            "volume":   float(row.get("Volume", 0)),
                        })
                    
                    if ohlcv_batch:
                        # Use upsert with on_conflict if your table has a unique(stock_id, date) constraint.
                        # Otherwise, this might create duplicates unless the table is handled carefully.
                        # Standard trade-signal schema uses (stock_id, date) as unique.
                        supabase.table("daily_ohlcv").upsert(ohlcv_batch, on_conflict="stock_id,date").execute()
                except Exception as e:
                    logger.warning("[%s] OHLCV sync failed (skipping): %s", symbol, e)

            # 3. Update Prediction entry
            existing = supabase.table("predictions").select("id").eq("stock_id", stock_id).execute()
            if existing.data:
                supabase.table("predictions").update(payload).eq("stock_id", stock_id).execute()
            else:
                supabase.table("predictions").insert({"stock_id": stock_id, **payload}).execute()
        except Exception as e:
            logger.error("[%s] Supabase save failed: %s", symbol, e)

    _upsert_local(symbol, payload)


async def _predict_one(symbol: str, artifacts: dict = None, force_ai: bool = False) -> dict:
    """
    Full prediction pipeline for a single stock symbol.
    Returns the full payload dictionary.
    """
    from app.indicators import add_indicators
    from app.model import train_or_load_model, predict_latest
    from app.services.nepse_service import get_stock_chart
    from app.services.openai_service import generate_explanation
    from app.services.news_service import get_company_news

    try:
        # 1. Fetch Data (Prioritizes System/DB History + Merges latest NEPSE)
        chart = await get_stock_chart(symbol)
        if not chart or not chart.get("chart_data"):
            return "NO_DATA"

        df = _chart_to_df(chart["chart_data"])
        history_days = len(df)
        logger.info("[DEEP] Analyzing %s with %d days of historical data", symbol, history_days)
        
        if history_days < 25:
            return "INSUFFICIENT"

        # CPU-bound work → run in thread pool so the event loop stays free
        df = await asyncio.to_thread(add_indicators, df)
        if len(df) < 10:
            return "INSUFFICIENT"

        # If no global artifacts were passed, fall back to ad-hoc training
        if artifacts is None:
            _, artifacts = await asyncio.to_thread(train_or_load_model, df)

        prediction, confidence, backtest_stats, model_metrics, all_proba, all_signals = \
            await asyncio.to_thread(predict_latest, df, artifacts)

        # 2. Fetch News Sentiment (V4 Upgrade: Sentiment is now a FEATURE, not just text)
        news_data = {"sentiment_score": 0.0, "headlines": ""}
        try:
            news_data = await get_company_news(symbol)
        except Exception: pass
        
        # Inject Sentiment into the dataframe for the model to "see"
        df['Sentiment_Score'] = news_data.get("sentiment_score", 0.0)

        # 3. Inject Global Market Breadth (Macro Context)
        # We assume breadth was pre-calculated and available or we use a neutral fallback
        df['Market_Breadth'] = getattr(asyncio.get_event_loop(), '_last_market_breadth', 1.0)

        if math.isnan(confidence) or math.isinf(confidence):
            confidence = 0.0

        latest            = df.iloc[-1]
        indicators_summary = _build_indicators_summary(latest)

        # ── TRADER UPGRADE: Multi-Timeframe Confluence ──
        weekly_confluence = "Neutral"
        try:
            df_w = resample_ohlcv(df, freq='W')
            if len(df_w) > 5:
                w_latest = df_w.iloc[-1]
                w_ema = w_latest.get('EMA_21', w_latest.get('EMA_20', 0))
                w_close = w_latest.get('Close', 0)
                if prediction == "BUY" and w_close > w_ema:
                    weekly_confluence = "Bullish Alignment"
                elif prediction == "SELL" and w_close < w_ema:
                    weekly_confluence = "Bearish Alignment"
        except Exception as e:
            logger.warning("Weekly confluence check failed: %s", e)

        # ── TRADER UPGRADE: Sector Alignment ──
        sector_alignment = 0.0
        try:
            from app.services.nepse_service import _last_good_response
            if _last_good_response and "index" in _last_good_response:
                mkt_chg = _last_good_response.get("index", {}).get("change_pct", 0)
                if (prediction == "BUY" and mkt_chg > 0) or (prediction == "SELL" and mkt_chg < 0):
                    sector_alignment = 1.0
                elif (prediction == "BUY" and mkt_chg < 0) or (prediction == "SELL" and mkt_chg > 0):
                    sector_alignment = -1.0
        except: pass

        # Generate deep explanation
        # If force_ai is True (from manual request), we generate text even for SELL/HOLD
        ai_result = await asyncio.to_thread(
            generate_explanation,
            prediction,
            confidence,
            indicators_summary,
            news_data,
            force_fallback=(prediction != "BUY" and not force_ai)
        )

        # Build chart data and signal history from the indicator-enriched df
        chart_data:     list = []
        signal_history: list = []
        for i, (_, row) in enumerate(df.iterrows()):
            t = row["Date"].strftime("%Y-%m-%d") if hasattr(row["Date"], "strftime") else str(row["Date"])
            chart_data.append({
                "time":  t,
                "open":  float(row.get("Open",   0)),
                "high":  float(row.get("High",   0)),
                "low":   float(row.get("Low",    0)),
                "close": float(row.get("Close",  0)),
                "value": float(row.get("Volume", 0)),
            })
            if i < len(all_signals) and all_signals[i] in ("BUY", "SELL"):
                signal_history.append({"time": t, "signal": all_signals[i]})

        last_close = float(latest.get("Close", 0))
        # Ensure T1 and T2 are in logical order
        t1 = ai_result.get("target_price")
        t2 = ai_result.get("target2")
        
        if t1 and t2:
            if prediction == "BUY" or prediction == "HOLD":
                # For Buy/Hold, T1 should be lower than T2
                target_price = min(t1, t2)
                target2 = max(t1, t2)
            else:
                # For Sell, T1 (first exit) should be higher than T2 (deep exit)
                target_price = max(t1, t2)
                target2 = min(t1, t2)
        else:
            target_price = t1
            target2 = t2

        payload = {
            "prediction":       prediction,
            "confidence_score": float(f"{confidence:.2f}"),
            "model_used":       "XGBoost+LightGBM+RF Ensemble",
            "explanation":      ai_result.get("explanation", ""),
            "target_price":     target_price,
            "target_pct":       round(((target_price - last_close) / last_close) * 100, 2) if target_price and last_close else 0,
            "stop_loss":        ai_result.get("stop_loss"),
            "stop_loss_pct":    ai_result.get("stop_loss_pct"),
            "estimated_days":   ai_result.get("estimated_days"),
            "risk_reward":      ai_result.get("risk_reward"),
            "all_proba":        all_proba,
            "indicators":       indicators_summary,
            "model_metrics":    model_metrics,
            "ai_analysis": {
                "explanation":      ai_result.get("explanation", ""),
                "ideal_entry":       ai_result.get("ideal_entry"),
                "entry_zone_low":    ai_result.get("entry_zone_low"),
                "entry_zone_high":   ai_result.get("entry_zone_high"),
                "entry_condition":   ai_result.get("entry_condition"),
                "target_price":      target_price,
                "target2":           target2,
                "target2_pct":       round(((target2 - last_close) / last_close) * 100, 2) if target2 and last_close else 0,
                "trailing_stop":     ai_result.get("trailing_stop"),
                "trailing_stop_pct": ai_result.get("trailing_stop_pct"),
                "stop_loss":         ai_result.get("stop_loss"),
                "exit_condition":    ai_result.get("exit_condition"),
                "risk_note":         ai_result.get("risk_note"),
                "market_structure":  ai_result.get("market_structure"),
                "volume_profile":    calculate_volume_profile(df),
                "fibonacci":         calculate_fibonacci(df),
                "weekly_confluence": weekly_confluence,
                "sector_alignment":  sector_alignment,
            },
            "chart_data":    chart_data,
            "signal_history": signal_history,
            "backtest_stats": backtest_stats,
            "created_at":    datetime.now(timezone.utc).isoformat(),
        }

        await _save_to_db(symbol, payload, df=df)
        logger.info("[AUTO] %s → %s (%.1f%%)", symbol, prediction, confidence)
        return payload

    except Exception as e:
        logger.error("[AUTO] %s failed: %s", symbol, e)
        return {"error": str(e), "signal": "ERROR"}


# ── Main job ─────────────────────────────────────────────────────────────────

async def run_daily_predictions(symbols: list | None = None) -> dict:
    """
    Fetch all active NEPSE stocks, run the full prediction pipeline for each,
    and persist results. Accepts an optional symbol list for manual runs.

    Returns a summary dict: {BUY, SELL, HOLD, ERROR, NO_DATA, INSUFFICIENT, elapsed_s}
    """
    global _job_status
    # running=True and job_type already set by the API endpoint before task creation
    _job_status["last_run"] = datetime.now(timezone.utc).isoformat()
    started = datetime.now(timezone.utc)

    try:
        if symbols is None:
            from app.services.nepse_service import get_live_data
            live    = await get_live_data()
            stocks  = live.get("stocks") or []
            if stocks:
                symbols = [s["symbol"] for s in stocks if s.get("symbol")]
            else:
                # Market was closed — use gainers+losers as symbol source
                seen: set = set()
                symbols = []
                for s in live.get("gainers", []) + live.get("losers", []):
                    sym = s.get("symbol")
                    if sym and sym not in seen:
                        seen.add(sym)
                        symbols.append(sym)

        total   = len(symbols)
        _job_status["progress"] = {"current": 0, "total": total}
        results: dict = {"BUY": 0, "SELL": 0, "HOLD": 0,
                         "ERROR": 0, "NO_DATA": 0, "INSUFFICIENT": 0}

        logger.info("=== Auto-prediction started: %d symbols ===", total)

        # ── Macro Upgrade: Calculate Market Breadth (Adv/Dec Ratio) ──
        try:
            stocks_list = live.get("stocks") or []
            advances = sum(1 for s in stocks_list if float(s.get("change") or 0) > 0)
            declines = sum(1 for s in stocks_list if float(s.get("change") or 0) < 0)
            # Breadth > 1.0 is Bullish Market, < 1.0 is Bearish Market
            breadth = round(advances / max(1, declines), 2)
            asyncio.get_event_loop()._last_market_breadth = breadth
            logger.info("Market Breadth calculated: %.2f (Adv: %d, Dec: %d)", breadth, advances, declines)
        except Exception as be:
            asyncio.get_event_loop()._last_market_breadth = 1.0
            logger.warning("Could not calculate market breadth: %s", be)

        from app.model import _get_latest_model_path
        import joblib
        
        global_artifacts = None
        latest_model = _get_latest_model_path()
        if latest_model:
            logger.info("Loading global model for daily predictions: %s", latest_model)
            try:
                global_artifacts = joblib.load(latest_model)
            except Exception as e:
                logger.error("Failed to load global model: %s", e)
        else:
            logger.warning("No global model found! Falling back to ad-hoc per-symbol training (very slow).")

        for i, symbol in enumerate(symbols, 1):
            _job_status["progress"]["current"] = i
            res = await _predict_one(symbol, global_artifacts)
            
            if isinstance(res, dict):
                signal = res.get("prediction", "ERROR")
                if "error" in res and signal == "ERROR":
                    signal = "ERROR" # explicitly mark as error
            else:
                signal = res # Fallback for any legacy code

            results[signal] = results.get(signal, 0) + 1

            # Brief pause every 10 stocks to avoid hammering the NEPSE API
            if i % 10 == 0:
                logger.info("Progress %d/%d — %s", i, total, results)
                await asyncio.sleep(3)
            else:
                await asyncio.sleep(0.8)

        elapsed = round((datetime.now(timezone.utc) - started).total_seconds(), 1)
        results["elapsed_s"] = elapsed
        results["total"]     = total

        logger.info("=== Auto-prediction done in %.0fs — %s ===", elapsed, results)
        _job_status["last_finish"]  = datetime.now(timezone.utc).isoformat()
        _job_status["last_results"] = results
        return results

    finally:
        _job_status["running"]  = False
        _job_status["job_type"] = None


async def _fetch_all_nepse_symbols_direct() -> list[str]:
    """
    Fetches ALL listed NEPSE stock symbols using direct HTTP — no nepse library dependency.
    Sources (tried in order, results merged):
      1. NEPSE today-price endpoint (returns all ~350 symbols always, even market-closed)
      2. Supabase stocks table (previously known symbols as fallback)
      3. In-memory live-data cache
    """
    from app.services.supabase_client import get_supabase

    seen: set  = set()
    symbols: list = []

    def _add(sym: str):
        s = (sym or "").upper().strip()
        if s and len(s) <= 15:
            if s not in seen:
                seen.add(s)
                symbols.append(s)

    # ── Source 1: NEPSE today-price endpoint (size=500 covers all ~350 stocks) ──
    nepse_urls = [
        "https://newweb.nepalstock.com/api/nots/nepse-data/today-price?&size=500&sort=true",
        "https://newweb.nepalstock.com/api/nots/security/floorsheet?size=500",
    ]
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "application/json",
        "Referer": "https://newweb.nepalstock.com/",
    }
    async with httpx.AsyncClient(verify=False, timeout=30) as client:
        for url in nepse_urls:
            try:
                resp = await client.get(url, headers=headers)
                if resp.status_code == 200:
                    data = resp.json()
                    items = data if isinstance(data, list) else (
                        data.get("content") or data.get("data") or
                        data.get("securities") or data.get("stocks") or []
                    )
                    before = len(symbols)
                    for item in items:
                        if isinstance(item, dict):
                            sym = (item.get("symbol") or item.get("securityName") or
                                   item.get("stockSymbol") or "")
                            _add(sym)
                    logger.info("NEPSE endpoint %s → +%d symbols", url.split("?")[0].split("/")[-1], len(symbols) - before)
                    if len(symbols) > 100:
                        break
            except Exception as e:
                logger.debug("NEPSE direct fetch failed (%s): %s", url, e)

    # ── Source 2: Supabase stocks table ──────────────────────────────────────
    try:
        supabase = get_supabase()
        if supabase:
            res = supabase.table("stocks").select("symbol").execute()
            before = len(symbols)
            for row in (res.data or []):
                _add(row.get("symbol", ""))
            logger.info("Supabase stocks table → +%d symbols", len(symbols) - before)
    except Exception as e:
        logger.warning("Supabase symbol fetch failed: %s", e)

    # ── Source 3: in-memory live-data cache ──────────────────────────────────
    try:
        from app.services.nepse_service import _last_good_response
        for s in _last_good_response.get("stocks", []):
            _add(s.get("symbol", ""))
    except Exception:
        pass

    _add("NEPSE")
    logger.info("Total symbols resolved: %d", len(symbols))
    return symbols


async def _fetch_stock_ohlcv_chukul(symbol: str, client: httpx.AsyncClient) -> list[dict]:
    """Fetch 1 year of daily OHLCV for a stock from Chukul API."""
    try:
        url  = f"https://chukul.com/api/data/historydata/?symbol={symbol}"
        resp = await client.get(url, headers={"User-Agent": "Mozilla/5.0"}, timeout=15)
        if resp.status_code != 200:
            return []
        rows = resp.json()
        if not isinstance(rows, list):
            return []
        result = []
        for r in rows:
            date_val = r.get("date", "")
            close    = float(r.get("close") or r.get("ltp") or 0)
            if not date_val or close == 0:
                continue
            result.append({
                "time":   date_val,
                "open":   float(r.get("open")   or close),
                "high":   float(r.get("high")   or close),
                "low":    float(r.get("low")    or close),
                "close":  close,
                "volume": float(r.get("volume") or 0),
            })
        return result
    except Exception as e:
        logger.debug("[%s] Chukul fetch failed: %s", symbol, e)
        return []


async def run_daily_ohlcv_dump(manual: bool = False) -> dict:
    """
    Saves TODAY's OHLCV data for ALL active NEPSE stocks to Supabase daily_ohlcv.

    Uses NEPSE today-price endpoint (single HTTP call → all ~350 stocks at once).
    Falls back to Chukul most-recent row per stock if NEPSE endpoint fails.
    Works whether market is open or closed.
    """
    global _job_status
    label = "Today's OHLCV Sync" if manual else "Auto EOD OHLCV Dump"
    logger.info("=== Starting %s ===", label)

    if manual:
        _job_status["last_run"]     = datetime.now(timezone.utc).isoformat()
        _job_status["progress"]     = {"current": 0, "total": 1}

    try:
        from app.services.supabase_client import get_supabase
        from app.services.nepse_service import _npt_now

        supabase = get_supabase()
        if not supabase:
            return {"error": "Supabase not configured"}

        # ── Step 1: Fetch today's OHLCV for all stocks in one call ──────────
        # NEPSE today-price endpoint returns all ~350 stocks with today's data.
        # Works even when market is closed (returns last trading day's data).
        today_rows: list[dict] = []   # [{symbol, date, open, high, low, close, volume}]

        NEPSE_URL = "https://newweb.nepalstock.com/api/nots/nepse-data/today-price?&size=500&sort=true"
        HDR = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Accept":     "application/json",
            "Referer":    "https://newweb.nepalstock.com/",
        }

        today_str = _npt_now().strftime("%Y-%m-%d")

        async with httpx.AsyncClient(verify=False, timeout=30) as http:
            # Primary: NEPSE today-price
            try:
                resp = await http.get(NEPSE_URL, headers=HDR)
                if resp.status_code == 200:
                    data  = resp.json()
                    items = data if isinstance(data, list) else (
                        data.get("content") or data.get("data") or
                        data.get("securities") or data.get("stocks") or []
                    )
                    for item in items:
                        if not isinstance(item, dict):
                            continue
                        sym = (item.get("symbol") or item.get("securityName") or "").upper().strip()
                        if not sym:
                            continue
                        close = float(item.get("closePrice") or item.get("ltp") or
                                      item.get("lastTradedPrice") or item.get("close") or 0)
                        if close == 0:
                            continue
                        today_rows.append({
                            "symbol": sym,
                            "date":   item.get("businessDate", today_str)[:10] or today_str,
                            "open":   float(item.get("openPrice")  or item.get("open")  or close),
                            "high":   float(item.get("highPrice")  or item.get("high")  or close),
                            "low":    float(item.get("lowPrice")   or item.get("low")   or close),
                            "close":  close,
                            "volume": float(item.get("totalTradeQuantity") or
                                           item.get("totalTradedQuantity") or
                                           item.get("volume") or 0),
                        })
                    logger.info("NEPSE today-price → %d stocks", len(today_rows))
            except Exception as e:
                logger.warning("NEPSE today-price failed: %s", e)

            # Fallback: Chukul most-recent row per stock (if NEPSE endpoint gave nothing)
            if not today_rows:
                logger.info("Falling back to Chukul for today's data...")
                symbols = await _fetch_all_nepse_symbols_direct()
                if manual:
                    _job_status["progress"] = {"current": 0, "total": len(symbols)}
                for idx, sym in enumerate(symbols, 1):
                    if manual:
                        _job_status["progress"]["current"] = idx
                    if sym == "NEPSE":
                        continue
                    rows = await _fetch_stock_ohlcv_chukul(sym, http)
                    if rows:
                        # Chukul returns newest first
                        latest = rows[0]
                        today_rows.append({
                            "symbol": sym,
                            "date":   latest["time"],
                            "open":   latest["open"],
                            "high":   latest["high"],
                            "low":    latest["low"],
                            "close":  latest["close"],
                            "volume": latest["volume"],
                        })
                    await asyncio.sleep(0.3)

        if not today_rows:
            logger.warning("No today's data found from any source")
            return {"error": "No data available", "total_stocks": 0, "rows_upserted": 0}

        if manual:
            _job_status["progress"] = {"current": 0, "total": len(today_rows)}

        # ── Step 2: Resolve stock IDs and batch-upsert ───────────────────────
        db_stocks = supabase.table("stocks").select("id, symbol").execute()
        stock_map: dict = {r["symbol"].upper(): r["id"] for r in (db_stocks.data or [])}

        payloads   = []
        errors     = 0

        for idx, row in enumerate(today_rows, 1):
            if manual:
                _job_status["progress"]["current"] = idx

            sym = row["symbol"]
            stock_id = stock_map.get(sym)
            if not stock_id:
                try:
                    res = supabase.table("stocks").insert({"symbol": sym}).execute()
                    if res.data:
                        stock_id = res.data[0]["id"]
                        stock_map[sym] = stock_id
                except Exception:
                    errors += 1
                    continue
            if not stock_id:
                continue

            payloads.append({
                "stock_id": stock_id,
                "date":     row["date"],
                "open":     row["open"],
                "high":     row["high"],
                "low":      row["low"],
                "close":    row["close"],
                "volume":   row["volume"],
            })

        # Upsert in batches of 400
        total_upserted = 0
        BATCH = 400
        for b in range(0, len(payloads), BATCH):
            batch = payloads[b:b + BATCH]
            try:
                supabase.table("daily_ohlcv").upsert(batch, on_conflict="stock_id,date").execute()
                total_upserted += len(batch)
            except Exception as e:
                logger.error("Batch upsert failed: %s", e)
                errors += 1

        result = {
            "total_stocks":  len(today_rows),
            "rows_upserted": total_upserted,
            "errors":        errors,
            "date":          today_str,
        }
        logger.info("=== %s Complete: %d stocks / %d rows saved ===",
                    label, len(today_rows), total_upserted)

        if manual:
            _job_status["last_finish"]  = datetime.now(timezone.utc).isoformat()
            _job_status["last_results"] = result

        return result

    except Exception as e:
        logger.error("%s failed: %s", label, e)
        return {"error": str(e)}
    finally:
        if manual:
            _job_status["running"]  = False
            _job_status["job_type"] = None

# ── Scheduler setup ──────────────────────────────────────────────────────────

async def run_weekly_retraining() -> None:
    """
    Gathers data from top stocks, performs RandomizedSearchCV to find optimal
    hyperparameters, and saves a single global model.
    Runs every Saturday.
    """
    # running=True and job_type already set by the API endpoint before task creation
    _job_status["last_run"]  = datetime.now(timezone.utc).isoformat()
    _job_status["progress"]  = {"current": 0, "total": 100}
    logger.info("=== Starting Weekly Global Model Retraining ===")
    
    try:
        from app.services.nepse_service import get_live_data, get_stock_chart
        from app.indicators import add_indicators
        from app.model import tune_and_train_global_model, assign_labels
        live = await get_live_data()
        stocks = live.get("stocks") or []
        if not stocks:
            stocks = live.get("top_turnovers", []) + live.get("top_volumes", [])
            
        # Select top 50 stocks by volume/turnover for training
        # Deduplicate to avoid training bias if a stock is in both turnover and volume lists
        seen = set()
        deduped_stocks = []
        for s in stocks:
            sym = s.get("symbol")
            if sym and sym not in seen:
                seen.add(sym)
                deduped_stocks.append(s)
        
        stocks = sorted(deduped_stocks, key=lambda s: s.get("volume", 0), reverse=True)[:50]
        symbols = [s["symbol"] for s in stocks if s.get("symbol")]
        
        _job_status["running"] = True
        _job_status["progress"]["total"] = 100
        _job_status["progress"]["current"] = 0
        
        if not symbols:
            logger.error("No symbols found for weekly retraining.")
            _job_status["running"] = False
            return
            
        dfs = []
        total_syms = len(symbols)
        for i, symbol in enumerate(symbols, 1):
            _job_status["progress"]["current"] = 5 + int((i/total_syms) * 45)
            chart = await get_stock_chart(symbol)
            if chart and chart.get("chart_data"):
                df = _chart_to_df(chart["chart_data"])
                if len(df) >= 50:
                    # Bug fix 2: run CPU-bound work in thread pool — avoids blocking event loop
                    df = await asyncio.to_thread(add_indicators, df)
                    try:
                        # Bug fix 1 & 4: label each stock individually BEFORE concat so
                        # shift(-5) never bleeds across stock boundaries, and warmup rows
                        # are dropped per-stock (add_indicators already removed first 20).
                        df, _ = assign_labels(df)
                        dfs.append(df)
                    except Exception as label_err:
                        logger.warning("[%s] labeling skipped: %s", symbol, label_err)
            await asyncio.sleep(0.6)
            
        if not dfs:
            logger.error("Could not fetch valid chart data for global model.")
            return
            
        global_df = pd.concat(dfs, ignore_index=True)
        logger.info("Training global model on %d combined rows from %d stocks...", len(global_df), len(dfs))

        # Data collection done (50%). Model training phase begins — ticks to 90 while thread runs.
        _job_status["progress"]["current"] = 55
        train_task = asyncio.to_thread(tune_and_train_global_model, global_df)

        # Slowly inch progress while the blocking thread trains (cosmetic only)
        async def _tick_progress():
            for pct in range(60, 90, 5):
                await asyncio.sleep(15)
                if _job_status["progress"]["current"] < pct:
                    _job_status["progress"]["current"] = pct

        tick_task = asyncio.ensure_future(_tick_progress())
        try:
            metrics, _ = await train_task
        finally:
            tick_task.cancel()

        _job_status["progress"]["current"] = 100
        _job_status["last_finish"]  = datetime.now(timezone.utc).isoformat()
        _job_status["last_results"] = {"accuracy": metrics.get("accuracy", 0), "stocks_trained": len(dfs)}
        logger.info("=== Weekly Retraining Complete: Acc: %.1f%% ===", metrics.get('accuracy', 0))
    except Exception as e:
        logger.error("Weekly retraining failed: %s", e)
    finally:
        _job_status["running"]  = False
        _job_status["job_type"] = None


def start_scheduler() -> None:
    """Register the daily job and start APScheduler. Called once from main.py."""
    # 15:15 NPT = 09:30 UTC  (NPT = UTC+5:45)
    # Disabled as per user request to have full manual control
    # scheduler.add_job(
    #     run_daily_predictions,
    #     CronTrigger(hour=9, minute=30, day_of_week="mon-fri", timezone="UTC"),
    #     id="daily_predictions",
    #     replace_existing=True,
    #     misfire_grace_time=600,   # 10-min grace window if server was briefly down
    # )
    
    # Weekly retraining at 10:00 NPT on Saturday (04:15 UTC)
    # Disabled as per user request to use the manual 'Deep Retrain' button instead
    # scheduler.add_job(
    #     run_weekly_retraining,
    #     CronTrigger(hour=4, minute=15, day_of_week="sat", timezone="UTC"),
    #     id="weekly_retraining",
    #     replace_existing=True,
    # )
    
    # Daily EOD Data Dump at 15:30 NPT (09:45 UTC)
    # Disabled scheduled time as per user request to trigger on app open instead
    # scheduler.add_job(
    #     run_daily_ohlcv_dump,
    #     CronTrigger(hour=9, minute=45, day_of_week="mon-fri", timezone="UTC"),
    #     id="daily_ohlcv_dump",
    #     replace_existing=True,
    # )
    
    scheduler.start()
    logger.info("APScheduler started in MANUAL mode — use the dashboard buttons to trigger scans and retraining.")
