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
        "Range52W_Pct":  f(latest.get("Range52W_Pct"),  0.5, 4),
    }


async def _save_to_db(symbol: str, payload: dict) -> None:
    """Upsert prediction to Supabase and always mirror to local JSON."""
    from app.routes.api import _upsert_local
    from app.services.supabase_client import get_supabase

    supabase = get_supabase()
    if supabase:
        try:
            stock_res = supabase.table("stocks").select("id").eq("symbol", symbol).execute()
            if not stock_res.data:
                ins_res  = supabase.table("stocks").insert({"symbol": symbol}).execute()
                stock_id = ins_res.data[0]["id"]
            else:
                stock_id = stock_res.data[0]["id"]

            existing = supabase.table("predictions").select("id").eq("stock_id", stock_id).execute()
            if existing.data:
                supabase.table("predictions").update(payload).eq("stock_id", stock_id).execute()
            else:
                supabase.table("predictions").insert({"stock_id": stock_id, **payload}).execute()
        except Exception as e:
            logger.error("[%s] Supabase save failed: %s", symbol, e)

    _upsert_local(symbol, payload)


async def _predict_one(symbol: str, artifacts: dict = None) -> str:
    """
    Full prediction pipeline for a single stock symbol.
    Returns the signal string or an error code.
    """
    from app.indicators import add_indicators
    from app.model import train_or_load_model, predict_latest
    from app.services.nepse_service import get_stock_chart
    from app.services.openai_service import generate_explanation
    from app.services.news_service import get_company_news

    try:
        # 1. Fetch Data
        chart = await get_stock_chart(symbol)
        if not chart or not chart.get("chart_data"):
            return "NO_DATA"

        df = _chart_to_df(chart["chart_data"])
        if len(df) < 30:
            return "INSUFFICIENT"

        # CPU-bound work → run in thread pool so the event loop stays free
        df = await asyncio.to_thread(add_indicators, df)
        if len(df) < 15:
            return "INSUFFICIENT"

        # If no global artifacts were passed, fall back to ad-hoc training
        if artifacts is None:
            _, artifacts = await asyncio.to_thread(train_or_load_model, df)

        prediction, confidence, backtest_stats, model_metrics, all_proba, all_signals = \
            await asyncio.to_thread(predict_latest, df, artifacts)

        # 2. Fetch News for sentiment context (only for BUY signals to save costs/time)
        news_text = ""
        if prediction == "BUY":
            try:
                news_text = await get_company_news(symbol)
            except:
                news_text = ""

        if math.isnan(confidence) or math.isinf(confidence):
            confidence = 0.0

        latest            = df.iloc[-1]
        indicators_summary = _build_indicators_summary(latest)

        # generate_explanation has its own internal try/except fallback
        # force_fallback=True for non-BUY signals to save OpenAI costs
        ai_result = await asyncio.to_thread(
            generate_explanation, 
            prediction, 
            confidence, 
            indicators_summary, 
            news_text,
            force_fallback=(prediction != "BUY")
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

        payload = {
            "prediction":       prediction,
            "confidence_score": float(f"{confidence:.2f}"),
            "model_used":       "XGBoost+LightGBM+RF Ensemble",
            "explanation":      ai_result.get("explanation", ""),
            "target_price":     ai_result.get("target_price"),
            "stop_loss":        ai_result.get("stop_loss"),
            "estimated_days":   ai_result.get("estimated_days"),
            "target_pct":       ai_result.get("target_pct"),
            "stop_loss_pct":    ai_result.get("stop_loss_pct"),
            "risk_reward":      ai_result.get("risk_reward"),
            "all_proba":        all_proba,
            "indicators":       indicators_summary,
            "model_metrics":    model_metrics,
            "ai_analysis": {
                "ideal_entry":       ai_result.get("ideal_entry"),
                "entry_zone_low":    ai_result.get("entry_zone_low"),
                "entry_zone_high":   ai_result.get("entry_zone_high"),
                "entry_condition":   ai_result.get("entry_condition"),
                "target2":           ai_result.get("target2"),
                "target2_pct":       ai_result.get("target2_pct"),
                "trailing_stop":     ai_result.get("trailing_stop"),
                "trailing_stop_pct": ai_result.get("trailing_stop_pct"),
                "exit_condition":    ai_result.get("exit_condition"),
                "risk_note":         ai_result.get("risk_note"),
                "market_structure":  ai_result.get("market_structure"),
            },
            "chart_data":    chart_data,
            "signal_history": signal_history,
            "backtest_stats": backtest_stats,
            "created_at":    datetime.now(timezone.utc).isoformat(),
        }

        await _save_to_db(symbol, payload)
        logger.info("[AUTO] %s → %s (%.1f%%)", symbol, prediction, confidence)
        return prediction

    except Exception as e:
        logger.error("[AUTO] %s failed: %s", symbol, e)
        return "ERROR"


# ── Main job ─────────────────────────────────────────────────────────────────

async def run_daily_predictions(symbols: list | None = None) -> dict:
    """
    Fetch all active NEPSE stocks, run the full prediction pipeline for each,
    and persist results. Accepts an optional symbol list for manual runs.

    Returns a summary dict: {BUY, SELL, HOLD, ERROR, NO_DATA, INSUFFICIENT, elapsed_s}
    """
    global _job_status
    if _job_status["running"]:
        logger.warning("Prediction job already running — skipping duplicate trigger")
        return {"error": "already_running"}

    _job_status["running"] = True
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
        results: dict = {"BUY": 0, "SELL": 0, "HOLD": 0,
                         "ERROR": 0, "NO_DATA": 0, "INSUFFICIENT": 0}

        logger.info("=== Auto-prediction started: %d symbols ===", total)

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
            signal = await _predict_one(symbol, global_artifacts)
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
        _job_status["running"] = False


async def run_daily_ohlcv_dump() -> None:
    """
    Fetches the last 7 days of OHLCV data for all stocks and dumps it into the
    Supabase daily_ohlcv table. This acts as a self-healing backup that fills gaps.
    Runs at 15:30 NPT (09:45 UTC).
    """
    logger.info("=== Starting Daily EOD OHLCV Data Dump (with 7-day backfill) ===")
    try:
        from app.services.nepse_service import get_live_data, get_stock_chart
        from app.services.supabase_client import get_supabase
        
        supabase = get_supabase()
        if not supabase: return

        live = await get_live_data()
        stocks = live.get("stocks") or []
        
        # Explicitly ensure NEPSE index is included in the sync list
        symbols = [s.get("symbol", "").upper() for s in stocks if s.get("symbol")]
        if "NEPSE" not in symbols:
            symbols.append("NEPSE")

        # Get stock ID map
        db_stocks = supabase.table("stocks").select("id, symbol").execute()
        stock_map = {s["symbol"].upper(): s["id"] for s in db_stocks.data}

        total_upserted = 0
        for sym in symbols:
            if not sym: continue

            stock_id = stock_map.get(sym)
            if not stock_id:
                try:
                    res = supabase.table("stocks").insert({"symbol": sym}).execute()
                    if res.data:
                        stock_id = res.data[0]["id"]
                        stock_map[sym] = stock_id
                except: continue

            if not stock_id: continue

            # Fetch recent history (get_stock_chart already handles merging)
            chart = await get_stock_chart(sym)
            history = chart.get("chart_data", [])[-7:] # Only need last 7 days for backup
            
            payloads = []
            for h in history:
                payloads.append({
                    "stock_id": stock_id,
                    "date": h["time"],
                    "open": float(h.get("open", 0)),
                    "high": float(h.get("high", 0)),
                    "low": float(h.get("low", 0)),
                    "close": float(h.get("close", 0)),
                    "volume": float(h.get("value", 0)),
                })

            if payloads:
                try:
                    supabase.table("daily_ohlcv").upsert(payloads, on_conflict="stock_id,date").execute()
                    total_upserted += len(payloads)
                except Exception as e:
                    logger.error("Failed to upsert history for %s: %s", sym, e)
            
            # Throttle to avoid hitting rate limits or Supabase limits
            await asyncio.sleep(0.2)

        logger.info("EOD Dump Complete: Upserted %d records for %d stocks.", total_upserted, len(stocks))

    except Exception as e:
        logger.error("Daily EOD OHLCV Dump failed: %s", e)

# ── Scheduler setup ──────────────────────────────────────────────────────────

async def run_weekly_retraining() -> None:
    """
    Gathers data from top stocks, performs RandomizedSearchCV to find optimal
    hyperparameters, and saves a single global model.
    Runs every Saturday.
    """
    if _job_status["running"]:
        return

    logger.info("=== Starting Weekly Global Model Retraining ===")
    try:
        from app.services.nepse_service import get_live_data, get_stock_chart
        from app.indicators import add_indicators
        from app.model import tune_and_train_global_model
        
        live = await get_live_data()
        stocks = live.get("stocks") or []
        if not stocks:
            stocks = live.get("top_turnovers", []) + live.get("top_volumes", [])
            
        # Select top 50 stocks by volume/turnover for training the global model
        # to ensure high liquidity data and keep training fast
        stocks = sorted(stocks, key=lambda s: s.get("volume", 0), reverse=True)[:50]
        symbols = [s["symbol"] for s in stocks if s.get("symbol")]
        
        if not symbols:
            logger.error("No symbols found for weekly retraining.")
            return
            
        dfs = []
        for symbol in symbols:
            chart = await get_stock_chart(symbol)
            if chart and chart.get("chart_data"):
                df = _chart_to_df(chart["chart_data"])
                if len(df) >= 50:
                    df = add_indicators(df)
                    dfs.append(df)
            await asyncio.sleep(0.5)
            
        if not dfs:
            logger.error("Could not fetch valid chart data for global model.")
            return
            
        global_df = pd.concat(dfs, ignore_index=True)
        logger.info("Training global model on %d combined rows from %d stocks...", len(global_df), len(dfs))
        
        metrics, _ = await asyncio.to_thread(tune_and_train_global_model, global_df)
        logger.info("=== Weekly Retraining Complete: Acc: %.1f%% ===", metrics.get('accuracy', 0))
    except Exception as e:
        logger.error("Weekly retraining failed: %s", e)


def start_scheduler() -> None:
    """Register the daily job and start APScheduler. Called once from main.py."""
    # 15:15 NPT = 09:30 UTC  (NPT = UTC+5:45)
    scheduler.add_job(
        run_daily_predictions,
        CronTrigger(hour=9, minute=30, day_of_week="mon-fri", timezone="UTC"),
        id="daily_predictions",
        replace_existing=True,
        misfire_grace_time=600,   # 10-min grace window if server was briefly down
    )
    
    # Weekly retraining at 10:00 NPT on Saturday (04:15 UTC)
    scheduler.add_job(
        run_weekly_retraining,
        CronTrigger(hour=4, minute=15, day_of_week="sat", timezone="UTC"),
        id="weekly_retraining",
        replace_existing=True,
    )
    
    # Daily EOD Data Dump at 15:30 NPT (09:45 UTC)
    scheduler.add_job(
        run_daily_ohlcv_dump,
        CronTrigger(hour=9, minute=45, day_of_week="mon-fri", timezone="UTC"),
        id="daily_ohlcv_dump",
        replace_existing=True,
    )
    
    scheduler.start()
    logger.info("APScheduler started — daily predictions at 15:15 NPT, EOD dump at 15:30 NPT, weekly retraining on Saturday")
