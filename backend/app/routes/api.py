import json
import logging
import math
import uuid
import os
import pandas as pd
from fastapi import APIRouter, Request, UploadFile, File, Form, HTTPException
from typing import Optional
from datetime import datetime, timezone
import asyncio
from app.services.nepse_service import get_live_data, get_stock_chart, is_market_open, get_live_quote
from app.limiter import limiter

logger = logging.getLogger(__name__)

from app.indicators import add_indicators
from app.model import train_or_load_model, predict_latest
from app.file_parser import parse_file
from app.services.openai_service import generate_explanation
from app.services.news_service import get_company_news
from app.services.supabase_client import get_supabase

router = APIRouter()

_CURRENT_DF        = None
_CURRENT_ARTIFACTS = None
_CURRENT_SYMBOL    = None

# Local history file — used when Supabase is not configured
_LOCAL_HISTORY_FILE = os.path.join(os.path.dirname(__file__), '..', '..', 'local_history.json')

# Minimum required columns (case-insensitive check done below)
_REQUIRED_COLS = {'close', 'open', 'high', 'low'}


def _validate_columns(df: pd.DataFrame) -> None:
    present = {c.lower() for c in df.columns}
    missing = _REQUIRED_COLS - present
    if missing:
        missing_fmt = ', '.join(sorted(c.capitalize() for c in missing))
        present_fmt = ', '.join(sorted(df.columns.tolist()))
        raise HTTPException(
            status_code=400,
            detail=(
                f"Missing required column(s): {missing_fmt}. "
                f"Your CSV has: {present_fmt}. "
                f"Expected columns: Date, Open, High, Low, Close, Volume."
            )
        )


# ── Local history helpers ──────────────────────────────────────────────────────

def _load_local_history() -> list:
    try:
        if os.path.exists(_LOCAL_HISTORY_FILE):
            with open(_LOCAL_HISTORY_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
    except Exception as e:
        logger.error("Failed to read local history: %s", e)
    return []


def _save_local_history(records: list) -> None:
    try:
        with open(_LOCAL_HISTORY_FILE, 'w', encoding='utf-8') as f:
            json.dump(records, f, ensure_ascii=False, indent=2)
    except Exception as e:
        logger.error("Failed to write local history: %s", e)


def _upsert_local(symbol: str, payload: dict) -> None:
    """Insert or update the prediction record for this symbol in the local JSON store."""
    records = _load_local_history()
    # Find existing record for this symbol
    idx = next((i for i, r in enumerate(records) if r.get('stocks', {}).get('symbol') == symbol), None)
    entry = {
        "id":               str(uuid.uuid4()),
        "prediction":       payload['prediction'],
        "confidence_score": payload['confidence_score'],
        "explanation":      payload.get('explanation', ''),
        "target_price":     payload.get('target_price'),
        "stop_loss":        payload.get('stop_loss'),
        "estimated_days":   payload.get('estimated_days'),
        "target_pct":       payload.get('target_pct'),
        "stop_loss_pct":    payload.get('stop_loss_pct'),
        "risk_reward":      payload.get('risk_reward'),
        "all_proba":        payload.get('all_proba'),
        "indicators":       payload.get('indicators'),
        "model_metrics":    payload.get('model_metrics'),
        "ai_analysis":      payload.get('ai_analysis'),
        "chart_data":       payload.get('chart_data', []),
        "signal_history":   payload.get('signal_history', []),
        "backtest_stats":   payload.get('backtest_stats'),
        "created_at":       payload['created_at'],
        "stocks":           {"symbol": symbol},
    }
    if idx is not None:
        entry['id'] = records[idx].get('id', entry['id'])  # keep stable id
        records[idx] = entry
    else:
        records.insert(0, entry)
    # _save_local_history(records) # Removed as per user request to use only Supabase


# ── Routes ─────────────────────────────────────────────────────────────────────

_SYMBOL_COLS = {'symbol', 'stock', 'company', 'script', 'scrip', 'ticker', 'instrument'}


_SUPPORTED_EXTS = {".csv", ".xlsx", ".xls", ".pdf"}


@router.post("/upload-csv")
async def upload_csv(file: UploadFile = File(...)):
    global _CURRENT_DF, _CURRENT_ARTIFACTS, _CURRENT_SYMBOL

    ext = "." + file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
    if ext not in _SUPPORTED_EXTS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{ext}'. Accepted formats: CSV (.csv), Excel (.xlsx / .xls), PDF (.pdf)."
        )

    try:
        # Reset shared state immediately so a failed upload never leaves a
        # mismatched DF + artifacts pair behind (old model predicting on new data).
        _CURRENT_DF        = None
        _CURRENT_ARTIFACTS = None
        _CURRENT_SYMBOL    = None

        content = await file.read()

        # ── Parse file into a DataFrame ──────────────────────────────────────
        try:
            df = parse_file(content, file.filename)
        except ValueError as ve:
            raise HTTPException(status_code=400, detail=str(ve))

        _validate_columns(df)

        # ── Guard: ensure Close column actually has numeric data ────────────
        close_valid = pd.to_numeric(df.get("Close", pd.Series(dtype=float)), errors="coerce").notna().sum()
        if close_valid == 0:
            sample = df.get("Close", pd.Series()).head(5).tolist()
            cols   = list(df.columns)
            raise HTTPException(
                status_code=400,
                detail=(
                    f"The Close/LTP column was found but contains no readable numbers. "
                    f"Sample values seen: {sample}. "
                    f"All columns detected: {cols}. "
                    f"Try opening the file in Excel and re-saving as CSV."
                )
            )

        # ── Extract symbol BEFORE add_indicators (which converts all cols to float) ──
        symbol_col = next((c for c in df.columns if c.lower() in _SYMBOL_COLS), None)
        extracted_symbol = None

        if symbol_col:
            for val in df[symbol_col].dropna():
                s = str(val).strip()
                if s and s.lower() not in ('nan', 'none', ''):
                    try:
                        float(s)
                    except ValueError:
                        extracted_symbol = s.upper()
                        break

        if not extracted_symbol:
            extracted_symbol = (
                file.filename.rsplit('.', 1)[0]
                .replace('_', ' ').replace('-', ' ')
                .strip().upper() or 'UNKNOWN'
            )

        # add_indicators expects specific column names — ensure they exist
        if "Date" not in df.columns:
            df = df.iloc[::-1].reset_index(drop=True)

        df = add_indicators(df)

        # ── Guard: enough rows survived indicator calculation ───────────────
        if len(df) < 15:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Only {len(df)} usable rows remain after parsing. "
                    f"Need at least 15 rows of valid OHLCV data. "
                    f"Check that the file has enough historical data and no empty/corrupt rows."
                )
            )

        metrics, artifacts = train_or_load_model(df)

        # Only set shared state after training succeeds — prevents a failed
        # training run from leaving an old model paired with new data.
        _CURRENT_DF        = df
        _CURRENT_SYMBOL    = extracted_symbol
        _CURRENT_ARTIFACTS = artifacts

        latest = df.iloc[-1]
        summary = {
            "SymbolInfo":     extracted_symbol,
            "RowsProcessed":  len(df),
            "LatestClose":    float(latest.get('Close', 0.0)),
            "IndicatorReady": "RSI, MACD, EMA9/21, MA50/200, BB, ATR, ADX, OBV, Stoch, Support/Res, 52W, Volume, Candle, Volatility",
            "ModelAccuracy":  metrics.get('accuracy', 0),
            "ThresholdUsed":  metrics.get('threshold_used', 0),
            "FeaturesUsed":   42,
        }
        return {"message": "File processed and model trained successfully.", "summary": summary}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/predict")
@limiter.limit("5/minute")
async def predict_stock(
    request: Request,
    symbol: str = Form("UNKNOWN"),
    news_text: Optional[str] = Form("")
):
    global _CURRENT_DF, _CURRENT_ARTIFACTS, _CURRENT_SYMBOL
    from app.services.scheduler import _predict_one
    from app.model import _get_latest_model_path
    import joblib

    symbol = symbol.strip().upper()
    if not symbol or symbol == "UNKNOWN":
        if _CURRENT_SYMBOL:
            symbol = _CURRENT_SYMBOL
        else:
            raise HTTPException(status_code=400, detail="Please provide a stock symbol or upload a CSV.")

    try:
        # CASE 1: Use currently loaded CSV (Fast)
        if _CURRENT_DF is not None and (_CURRENT_SYMBOL == symbol or symbol == "UNKNOWN"):
            df = _CURRENT_DF
            prediction, predict_confidence, backtest_stats, model_metrics, all_proba, all_signals = predict_latest(df, _CURRENT_ARTIFACTS)
            
            latest = df.iloc[-1]
            indicators_summary = {
                "RSI": round(float(latest.get('RSI', 0)), 2),
                "MACD": round(float(latest.get('MACD', 0)), 4),
                "MACD_diff": round(float(latest.get('MACD_diff', 0)), 4),
                "MA_50": round(float(latest.get('MA_50', 0)), 2),
                "MA_200": round(float(latest.get('MA_200', 0)), 2),
                "EMA_9": round(float(latest.get('EMA_9', 0)), 2),
                "EMA_21": round(float(latest.get('EMA_21', 0)), 2),
                "EMA_Cross": int(latest.get('EMA_Cross', 0)),
                "Above_MA50": int(latest.get('Above_MA50', 0)),
                "Above_MA200": int(latest.get('Above_MA200', 0)),
                "Stoch_K": round(float(latest.get('Stoch_K', 50)), 2),
                "Stoch_D": round(float(latest.get('Stoch_D', 50)), 2),
                "Momentum_5": round(float(latest.get('Momentum_5', 0)), 4),
                "Momentum_10": round(float(latest.get('Momentum_10', 0)), 4),
                "BB_Width": round(float(latest.get('BB_Width', 0)), 4),
                "BB_pct_B": round(float(latest.get('BB_pct_B', 0.5)), 4),
                "ATR": round(float(latest.get('ATR', 0)), 2),
                "ATR_Ratio": round(float(latest.get('ATR_Ratio', 0)), 4),
                "Volatility": round(float(latest.get('Volatility', 0)), 4),
                "OBV_Ratio": round(float(latest.get('OBV_Ratio', 1)), 4),
                "Volume_Change": round(float(latest.get('Volume_Change', 0)), 4),
                "Volume_Ratio": round(float(latest.get('Volume_Ratio', 1)), 4),
                "Close": round(float(latest.get('Close', 0)), 2),
                "Support": round(float(latest.get('Support', 0)), 2),
                "Resistance": round(float(latest.get('Resistance', 0)), 2),
                "Candle_Body": round(float(latest.get('Candle_Body', 0)), 4),
                "ADX": round(float(latest.get('ADX', 0)), 2),
                "ADX_pos": round(float(latest.get('ADX_pos', 0)), 2),
                "ADX_neg": round(float(latest.get('ADX_neg', 0)), 2),
                "Range52W_Pct": round(float(latest.get('Range52W_Pct', 0.5)), 4),
            }

            if not news_text and prediction == "BUY":
                news_text = await get_company_news(symbol)

            ai_result = generate_explanation(prediction, predict_confidence, indicators_summary, news_text, force_fallback=(prediction != "BUY"))
            
            # Map result to a standardized record
            record = {
                "symbol": symbol,
                "prediction": prediction,
                "confidence": predict_confidence,
                "all_proba": all_proba,
                "explanation": ai_result.get("explanation", ""),
                "target_price": ai_result.get("target_price"),
                "stop_loss": ai_result.get("stop_loss"),
                "estimated_days": ai_result.get("estimated_days"),
                "target_pct": ai_result.get("target_pct"),
                "stop_loss_pct": ai_result.get("stop_loss_pct"),
                "risk_reward": ai_result.get("risk_reward"),
                "indicators": indicators_summary,
                "backtest": backtest_stats,
                "model_metrics": model_metrics,
                "ai_analysis": {
                    "ideal_entry": ai_result.get("ideal_entry"),
                    "entry_zone_low": ai_result.get("entry_zone_low"),
                    "entry_zone_high": ai_result.get("entry_zone_high"),
                    "entry_condition": ai_result.get("entry_condition"),
                    "target2": ai_result.get("target2"),
                    "target2_pct": ai_result.get("target2_pct"),
                    "trailing_stop": ai_result.get("trailing_stop"),
                    "trailing_stop_pct": ai_result.get("trailing_stop_pct"),
                    "exit_condition": ai_result.get("exit_condition"),
                    "risk_note": ai_result.get("risk_note"),
                    "market_structure": ai_result.get("market_structure"),
                }
            }
            return record

        # CASE 2: No CSV or different symbol -> Run full automated pipeline
        global_artifacts = None
        latest_model = _get_latest_model_path()
        if latest_model:
            try: global_artifacts = joblib.load(latest_model)
            except: pass

        res_signal = await _predict_one(symbol, global_artifacts)
        if res_signal in ("NO_DATA", "INSUFFICIENT", "ERROR"):
            raise HTTPException(status_code=400, detail=f"Prediction failed for {symbol}: {res_signal}")
        
        history = _load_local_history()
        record = next((r for r in history if (r.get("stocks", {}).get("symbol") == symbol or r.get("symbol") == symbol)), None)
        if not record:
            raise HTTPException(status_code=500, detail="Prediction completed but could not retrieve results.")
        return record

    except HTTPException: raise
    except Exception as e:
        logger.error("Predict endpoint error: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/predictions")
async def get_predictions():
    """Return history from Supabase if configured, otherwise from local JSON file."""
    supabase = get_supabase()
    if supabase:
        try:
            res = supabase.table("predictions").select(
                "id, prediction, confidence_score, explanation, target_price, stop_loss, estimated_days, target_pct, stop_loss_pct, risk_reward, all_proba, indicators, model_metrics, ai_analysis, chart_data, signal_history, backtest_stats, created_at, stocks(symbol)"
            ).order("created_at", desc=True).execute()
            return {"data": res.data}
        except Exception as e:
            logger.error("Supabase read failed, falling back to local: %s", e)

    # Local fallback
    records = _load_local_history()
    return {"data": records}


@router.post("/predictions/run")
async def trigger_predictions(symbols: list[str] | None = None):
    """
    Manually trigger the market scan.
    Optionally pass a list of symbols to limit the run.
    """
    from app.services.scheduler import run_daily_predictions, _job_status
    if _job_status["running"]:
        return {"status": "already_running", "detail": "A scan is already in progress."}
    # Fix race condition: mark running before creating the task so the first
    # status poll (which may arrive before the coroutine starts) sees running=True.
    _job_status["running"]  = True
    _job_status["job_type"] = "scan"
    asyncio.create_task(run_daily_predictions(symbols))
    return {"status": "started", "detail": "Market scan started."}


@router.get("/predictions/status")
async def get_predictions_status():
    """Returns the current state of the prediction engine (running, last run, etc.)"""
    from app.services.scheduler import _job_status
    return _job_status


_LAST_EOD_SYNC_DATE = None

@router.get("/nepse/sync-eod")
async def trigger_eod_sync():
    """
    Called on app startup. Checks if market is closed and past 15:15 NPT.
    If so, triggers the EOD OHLCV data dump to ensure Supabase is up to date.
    """
    global _LAST_EOD_SYNC_DATE
    from app.services.nepse_service import is_market_open, _npt_now
    from app.services.scheduler import run_daily_ohlcv_dump
    
    now = _npt_now()
    today = now.strftime("%Y-%m-%d")
    
    # Only sync if:
    # 1. Market is closed
    # 2. It's after 3:15 PM (15:15) NPT
    # 3. We haven't successfully synced today yet
    if not is_market_open() and now.hour >= 15 and (now.hour > 15 or now.minute >= 15):
        if _LAST_EOD_SYNC_DATE != today:
            _LAST_EOD_SYNC_DATE = today
            asyncio.create_task(run_daily_ohlcv_dump())
            return {"status": "sync_started", "date": today}
    
    return {"status": "skipped", "reason": "Market open or already synced today", "date": today}


@router.post("/predictions/retrain")
async def manual_retrain():
    """Manually trigger the deep AI retraining process."""
    from app.services.scheduler import run_weekly_retraining, _job_status
    if _job_status["running"]:
        return {"error": "A task is already running"}
    _job_status["running"]  = True
    _job_status["job_type"] = "retrain"
    asyncio.create_task(run_weekly_retraining())
    return {"status": "Retraining started in background"}


@router.post("/predictions/ohlcv-dump")
async def manual_ohlcv_dump():
    """Manually trigger OHLCV data sync for all NEPSE stocks into Supabase."""
    from app.services.scheduler import run_daily_ohlcv_dump, _job_status
    if _job_status["running"]:
        return {"error": "A task is already running. Please wait for it to finish."}
    _job_status["running"]  = True
    _job_status["job_type"] = "ohlcv_dump"
    _job_status["progress"] = {"current": 0, "total": 0}
    asyncio.create_task(run_daily_ohlcv_dump(manual=True))
    return {"status": "OHLCV sync started in background"}


# ── NEPSE Live Market Routes ───────────────────────────────────────────────────

@router.get("/nepse/status")
async def nepse_market_status():
    """Quick check — is NEPSE open right now?"""
    return {
        "is_open":   is_market_open(),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/nepse/live")
@limiter.limit("30/minute")
async def nepse_live(request: Request):
    from app.services.nepse_service import get_live_data, _last_good_response
    try:
        result = await asyncio.wait_for(get_live_data(), timeout=55.0)
        return result
    except asyncio.TimeoutError:
        if _last_good_response:
            stale = dict(_last_good_response)
            stale["stale"] = True
            stale["stale_reason"] = "NEPSE server slow — showing last cached data"
            return stale
        return {"error": "NEPSE server is not responding. Please try again later."}
    except Exception as e:
        logger.error("nepse_live error: %s", e)
        if _last_good_response:
            stale = dict(_last_good_response)
            stale["stale"] = True
            return stale
        return {"error": str(e)}


@router.get("/nepse/chart/{symbol}")
@limiter.limit("20/minute")
async def nepse_chart(request: Request, symbol: str):
    """Historical daily OHLCV for a single NEPSE symbol (for chart rendering)."""
    try:
        result = await asyncio.wait_for(get_stock_chart(symbol), timeout=40.0)
        return result
    except asyncio.TimeoutError:
        return {"error": "Chart data fetch timed out. Please try again."}
    except Exception as e:
        logger.error("nepse_chart error: %s", e)
        return {"error": str(e)}

@router.get("/nepse/intraday/{symbol}")
@limiter.limit("20/minute")
async def nepse_intraday(request: Request, symbol: str):
    """1-minute OHLCV for a single NEPSE symbol."""
    from app.services.nepse_service import get_stock_intraday
    try:
        result = await asyncio.wait_for(get_stock_intraday(symbol), timeout=20.0)
        return result
    except asyncio.TimeoutError:
        return {"error": "Intraday fetch timed out."}
    except Exception as e:
        logger.error("nepse_intraday error: %s", e)
        return {"error": str(e)}

@router.get("/nepse/quote/{symbol}")
@limiter.limit("120/minute")
async def nepse_quote(request: Request, symbol: str):
    """Live price quote for one symbol — uses a 5s shared getLiveMarket() cache."""
    try:
        return await asyncio.wait_for(get_live_quote(symbol), timeout=12.0)
    except Exception as e:
        return {"symbol": symbol.upper(), "ltp": 0, "live": False, "error": str(e)}


@router.get("/nepse/history")
@limiter.limit("20/minute")
async def nepse_history(request: Request):
    """Lifetime historical OHLCV for the NEPSE Index."""
    from app.services.nepse_service import get_nepse_history
    try:
        result = await asyncio.wait_for(get_nepse_history(), timeout=40.0)
        return result
    except asyncio.TimeoutError:
        return {"error": "Index history fetch timed out. Please try again."}
    except Exception as e:
        logger.error("nepse_history error: %s", e)
        return {"error": str(e)}
@router.get("/nepse/analyze/{symbol}")
@limiter.limit("5/minute")
async def analyze_stock_deep(request: Request, symbol: str):
    """
    Triggers an on-demand, deep institutional analysis for a single symbol.
    Fetches latest history, news, calculates 40+ indicators, and runs the AI ensemble.
    """
    from app.services.scheduler import _predict_one
    from app.model import _get_latest_model_path
    import joblib

    symbol = symbol.strip().upper()
    try:
        # Load global model if available for consistency
        global_artifacts = None
        latest_model = _get_latest_model_path()
        if latest_model:
            try:
                global_artifacts = joblib.load(latest_model)
            except: pass

        # Run the full pipeline
        # _predict_one now returns the full payload dict
        result = await _predict_one(symbol, global_artifacts, force_ai=True)
        
        if result == "NO_DATA":
            raise HTTPException(status_code=400, detail=f"No price data found for {symbol}. NEPSE server might be down.")
        
        if result == "INSUFFICIENT":
            raise HTTPException(status_code=400, detail=f"{symbol} has insufficient history for AI analysis (need at least 35 days).")
            
        if result == "ERROR":
            raise HTTPException(status_code=400, detail=f"A technical error occurred during {symbol} analysis.")

        # ── SAVE TO DATABASE / HISTORY ──
        try:
            from app.services.scheduler import _save_to_db
            # Use await because _save_to_db is async
            await _save_to_db(symbol, result)
        except Exception as se:
            logger.error("Failed to save deep analysis for %s: %s", symbol, se)

        return result

    except HTTPException: raise
    except Exception as e:
        logger.error("Deep analysis endpoint error: %s", e)
        raise HTTPException(status_code=500, detail=str(e))
