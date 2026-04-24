import json
import logging
import math
import uuid
import os
import pandas as pd
from fastapi import APIRouter, Request, UploadFile, File, Form, HTTPException
from typing import Optional
from datetime import datetime, timezone
from app.limiter import limiter

logger = logging.getLogger(__name__)

from app.indicators import add_indicators
from app.model import train_or_load_model, predict_latest
from app.file_parser import parse_file
from app.services.openai_service import generate_explanation
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
    _save_local_history(records)


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

    if _CURRENT_DF is None:
        raise HTTPException(status_code=400, detail="No CSV data loaded. Please upload a CSV first.")

    # Always use the symbol extracted at upload time
    symbol = _CURRENT_SYMBOL or symbol or 'UNKNOWN'

    try:
        df = _CURRENT_DF

        prediction, predict_confidence, backtest_stats, model_metrics, all_proba, all_signals = predict_latest(df, _CURRENT_ARTIFACTS)

        if math.isnan(predict_confidence) or math.isinf(predict_confidence):
            predict_confidence = 0.0

        latest = df.iloc[-1]
        indicators_summary = {
            # Trend
            "RSI":           round(float(latest.get('RSI',           0)), 2),
            "MACD":          round(float(latest.get('MACD',          0)), 4),
            "MACD_diff":     round(float(latest.get('MACD_diff',     0)), 4),
            "MA_50":         round(float(latest.get('MA_50',         0)), 2),
            "MA_200":        round(float(latest.get('MA_200',        0)), 2),
            "EMA_9":         round(float(latest.get('EMA_9',         0)), 2),
            "EMA_21":        round(float(latest.get('EMA_21',        0)), 2),
            "EMA_Cross":     int(latest.get('EMA_Cross',  0)),
            "Above_MA50":    int(latest.get('Above_MA50', 0)),
            "Above_MA200":   int(latest.get('Above_MA200',0)),
            # Momentum
            "Stoch_K":       round(float(latest.get('Stoch_K',       50)), 2),
            "Stoch_D":       round(float(latest.get('Stoch_D',       50)), 2),
            "Momentum_5":    round(float(latest.get('Momentum_5',    0)), 4),
            "Momentum_10":   round(float(latest.get('Momentum_10',   0)), 4),
            # Volatility
            "BB_Width":      round(float(latest.get('BB_Width',      0)), 4),
            "BB_pct_B":      round(float(latest.get('BB_pct_B',      0.5)), 4),
            "ATR":           round(float(latest.get('ATR',           0)), 2),
            "ATR_Ratio":     round(float(latest.get('ATR_Ratio',     0)), 4),
            "Volatility":    round(float(latest.get('Volatility',    0)), 4),
            # Volume
            "OBV_Ratio":     round(float(latest.get('OBV_Ratio',     1)), 4),
            "Volume_Change": round(float(latest.get('Volume_Change', 0)), 4),
            "Volume_Ratio":  round(float(latest.get('Volume_Ratio',  1)), 4),
            # Price action
            "Close":         round(float(latest.get('Close',         0)), 2),
            "Support":       round(float(latest.get('Support',       0)), 2),
            "Resistance":    round(float(latest.get('Resistance',    0)), 2),
            "Candle_Body":   round(float(latest.get('Candle_Body',   0)), 4),
            # Market structure
            "ADX":           round(float(latest.get('ADX',           0)), 2),
            "ADX_pos":       round(float(latest.get('ADX_pos',       0)), 2),
            "ADX_neg":       round(float(latest.get('ADX_neg',       0)), 2),
            "Range52W_Pct":  round(float(latest.get('Range52W_Pct',  0.5)), 4),
        }

        ai_result        = generate_explanation(prediction, predict_confidence, indicators_summary, news_text)
        explanation      = ai_result.get("explanation", "")
        target_price     = ai_result.get("target_price")
        stop_loss        = ai_result.get("stop_loss")
        estimated_days   = ai_result.get("estimated_days")
        target_pct       = ai_result.get("target_pct")
        stop_loss_pct    = ai_result.get("stop_loss_pct")
        risk_reward      = ai_result.get("risk_reward")
        # Extended AI analysis fields
        ideal_entry      = ai_result.get("ideal_entry")
        entry_zone_low   = ai_result.get("entry_zone_low")
        entry_zone_high  = ai_result.get("entry_zone_high")
        entry_condition  = ai_result.get("entry_condition")
        target2          = ai_result.get("target2")
        target2_pct      = ai_result.get("target2_pct")
        trailing_stop    = ai_result.get("trailing_stop")
        trailing_stop_pct= ai_result.get("trailing_stop_pct")
        exit_condition   = ai_result.get("exit_condition")
        risk_note        = ai_result.get("risk_note")
        market_structure = ai_result.get("market_structure")

        # Build chart data + signal history
        chart_df = df.copy()
        date_col = next((c for c in chart_df.columns if c.lower() in ['date', 'time', 'timestamp']), None)
        if date_col:
            chart_df['__Time__'] = pd.to_datetime(chart_df[date_col]).dt.strftime('%Y-%m-%d')
        else:
            chart_df['__Time__'] = [f"Day {i}" for i in range(len(chart_df))]

        chart_data     = []
        signal_history = []
        for i, (_, row) in enumerate(chart_df.iterrows()):
            chart_data.append({
                "time":  row['__Time__'],
                "open":  float(row.get('Open',   0)),
                "high":  float(row.get('High',   0)),
                "low":   float(row.get('Low',    0)),
                "close": float(row.get('Close',  0)),
                "value": float(row.get('Volume', 0)),
            })
            if i < len(all_signals) and all_signals[i] in ('BUY', 'SELL'):
                signal_history.append({"time": row['__Time__'], "signal": all_signals[i]})

        now_iso = datetime.now(timezone.utc).isoformat()
        ai_analysis = {
            "ideal_entry":       ideal_entry,
            "entry_zone_low":    entry_zone_low,
            "entry_zone_high":   entry_zone_high,
            "entry_condition":   entry_condition,
            "target2":           target2,
            "target2_pct":       target2_pct,
            "trailing_stop":     trailing_stop,
            "trailing_stop_pct": trailing_stop_pct,
            "exit_condition":    exit_condition,
            "risk_note":         risk_note,
            "market_structure":  market_structure,
        }
        save_payload = {
            "prediction":       prediction,
            "confidence_score": float(f"{predict_confidence:.2f}"),
            "model_used":       "XGBoost+LightGBM+RF Ensemble",
            "explanation":      explanation,
            "target_price":     target_price,
            "stop_loss":        stop_loss,
            "estimated_days":   estimated_days,
            "target_pct":       target_pct,
            "stop_loss_pct":    stop_loss_pct,
            "risk_reward":      risk_reward,
            "all_proba":        all_proba,
            "indicators":       indicators_summary,
            "model_metrics":    model_metrics,
            "ai_analysis":      ai_analysis,
            "chart_data":       chart_data,
            "signal_history":   signal_history,
            "backtest_stats":   backtest_stats,
            "created_at":       now_iso,
        }

        # ── Persist: try Supabase first, always save locally as well ────────
        supabase = get_supabase()
        if supabase:
            try:
                stock_res = supabase.table("stocks").select("id").eq("symbol", symbol).execute()
                if not stock_res.data:
                    ins_res  = supabase.table("stocks").insert({"symbol": symbol}).execute()
                    stock_id = ins_res.data[0]['id']
                else:
                    stock_id = stock_res.data[0]['id']

                existing = supabase.table("predictions").select("id").eq("stock_id", stock_id).execute()
                if existing.data:
                    supabase.table("predictions").update(save_payload).eq("stock_id", stock_id).execute()
                else:
                    supabase.table("predictions").insert({"stock_id": stock_id, **save_payload}).execute()

                logger.info("Saved to Supabase: %s → %s", symbol, prediction)
            except Exception as db_err:
                logger.error("Supabase write failed: %s", db_err)

        # Always save locally — ensures history works even without Supabase
        _upsert_local(symbol, save_payload)

        return {
            "symbol":            symbol,
            "prediction":        prediction,
            "confidence":        predict_confidence,
            "all_proba":         all_proba,
            "explanation":       explanation,
            "target_price":      target_price,
            "stop_loss":         stop_loss,
            "estimated_days":    estimated_days,
            "target_pct":        target_pct,
            "stop_loss_pct":     stop_loss_pct,
            "risk_reward":       risk_reward,
            # Extended AI analysis
            "ideal_entry":       ideal_entry,
            "entry_zone_low":    entry_zone_low,
            "entry_zone_high":   entry_zone_high,
            "entry_condition":   entry_condition,
            "target2":           target2,
            "target2_pct":       target2_pct,
            "trailing_stop":     trailing_stop,
            "trailing_stop_pct": trailing_stop_pct,
            "exit_condition":    exit_condition,
            "risk_note":         risk_note,
            "market_structure":  market_structure,
            "indicators":        indicators_summary,
            "chart_data":        chart_data,
            "signal_history":    signal_history,
            "backtest":          backtest_stats,
            "model_metrics":     model_metrics,
        }

    except HTTPException:
        raise
    except Exception as e:
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
