"""
NEPSE live data service — NepseUnofficialApi (AsyncNepse)

Working methods:
  getPriceVolumeHistory(business_date)  POST  all stocks OHLCV for a date
  getCompanyPriceVolumeHistory(id)      GET   historical OHLCV for ONE stock (chart)
  getLiveMarket()                       GET   real-time prices (empty when market closed)
  getTopGainers() / getTopLosers()      GET
  getNepseIndex() / getSummary()        GET

Note: getDailyScripPriceGraph uses POST + WASM auth — avoided on Windows.
      getCompanyPriceVolumeHistory uses plain GET — no auth needed.
"""
import asyncio
import logging
import httpx
from datetime import timezone, timedelta, datetime, date, time as dtime

logger = logging.getLogger(__name__)

_NPT = timezone(timedelta(hours=5, minutes=45))   # Nepal Standard Time, no DST


def _npt_now() -> datetime:
    return datetime.now(_NPT)


def is_market_open() -> bool:
    now = _npt_now()
    t, wd = now.time(), now.weekday()
    
    # 5 = Saturday, 6 = Sunday
    if wd in (5, 6):
        return False
        
    # Monday to Friday: 11:00 AM to 3:00 PM
    return dtime(11, 0) <= t <= dtime(15, 0)

def get_market_status() -> str:
    now = _npt_now()
    t, wd = now.time(), now.weekday()
    
    # 5 = Saturday, 6 = Sunday
    if wd in (5, 6):
        return "CLOSED"
        
    # Pre-open session: 10:30 AM to 10:45 AM
    if dtime(10, 30) <= t <= dtime(10, 45):
        return "PRE-OPEN"
        
    # Open session: 11:00 AM to 3:00 PM
    if dtime(11, 0) <= t <= dtime(15, 0):
        return "OPEN"
            
    return "CLOSED"


def _today_date() -> str:
    """Today's date in Nepal time, formatted for NEPSE API (YYYY-MM-DD)."""
    return _npt_now().strftime("%Y-%m-%d")


# ── AsyncNepse singleton + security-ID cache ─────────────────────────────────
_nepse_instance = None
_symbol_id_cache: dict = {}   # symbol → numeric security ID, built from pvh data
_last_good_response: dict = {}  # cache of last successful get_live_data() result
_live_quote_cache: dict = {"ts": 0.0, "rows": []}  # shared 5s cache for getLiveMarket()


async def _client():
    global _nepse_instance
    if _nepse_instance is None:
        from nepse import AsyncNepse
        _nepse_instance = AsyncNepse()
        _nepse_instance.setTLSVerification(False)
    return _nepse_instance


# ── Helpers ───────────────────────────────────────────────────────────────────

def _to_list(val):
    """Flatten any API response shape to a plain Python list."""
    if val is None or isinstance(val, Exception):
        return []
    if isinstance(val, list):
        return val
    if isinstance(val, dict):
        for key in ("content", "data", "securities", "stocks",
                    "items", "result", "todayPrice", "tradeStat"):
            inner = val.get(key)
            if isinstance(inner, list) and inner:
                return inner
    return []


def _g(d: dict, *keys, t=float, default=0):
    """Return first non-zero value found among candidate keys."""
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


def _s(v, t=float, default=0):
    try:
        return t(v) if v not in (None, "", "N/A", "null") else default
    except Exception:
        return default


# ── Third Party APIs ──────────────────────────────────────────────────────────

import csv
import os

async def get_nepse_history() -> list:
    """Fetch lifetime NEPSE index OHLCV history from local CSV + Chukul API."""
    data_map = {}
    try:
        # 1. Load the historical lifetime CSV
        csv_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', 'database', 'nepse data.csv'))
        if os.path.exists(csv_path):
            with open(csv_path, 'r', encoding='utf-8') as f:
                reader = csv.DictReader(f)
                for row in reader:
                    v_str = row.get("Volume", "0").replace(",", "")
                    data_map[row["Date"]] = {
                        "time": row["Date"],
                        "open": float(row.get("Open", 0)),
                        "high": float(row.get("High", 0)),
                        "low": float(row.get("Low", 0)),
                        "close": float(row.get("Close", 0)),
                        "volume": float(v_str) if v_str and v_str != '-' else 0.0,
                    }
        
        # 2. Layer with live/recent data from Chukul to stay up-to-date
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get("https://chukul.com/api/data/historydata/?symbol=nepse")
            if resp.status_code == 200:
                data = resp.json()
                for row in data:
                    data_map[row.get("date")] = {
                        "time": row.get("date"),
                        "open": float(row.get("open", 0)),
                        "high": float(row.get("high", 0)),
                        "low": float(row.get("low", 0)),
                        "close": float(row.get("close", 0)),
                        "volume": float(row.get("volume", 0)),
                    }
                    
        # 3. Sort ascending by date
        return sorted(data_map.values(), key=lambda x: x["time"])
    except Exception as e:
        logger.error(f"Failed to fetch NEPSE history: {e}")
    return []

# ── Public API ────────────────────────────────────────────────────────────────

async def _safe(coro, timeout=30):
    """Run a coroutine with its own timeout; return the exception on failure."""
    try:
        return await asyncio.wait_for(coro, timeout=timeout)
    except Exception as e:
        logger.warning("NEPSE call failed/timed out: %s", e)
        return e


async def get_live_data() -> dict:
    global _last_good_response, _nepse_instance
    nepse = await _client()
    today = _today_date()

    # Fire all requests in parallel, each with its own per-call timeout
    (pvh_raw, live_raw, summary_raw,
     gainers_raw, losers_raw, index_raw, nepse_chart_raw) = await asyncio.gather(
        _safe(nepse.getPriceVolumeHistory(business_date=today), timeout=45),
        _safe(nepse.getLiveMarket(),           timeout=30),
        _safe(nepse.getSummary(),              timeout=30),
        _safe(nepse.getTopGainers(),           timeout=30),
        _safe(nepse.getTopLosers(),            timeout=30),
        _safe(nepse.getNepseIndex(),           timeout=30),
        _safe(nepse.getDailyNepseIndexGraph(), timeout=30),
    )

    # If pvh (the main data source) failed, reset the singleton so next call
    # gets a fresh session/token — stale sessions cause persistent timeouts
    if isinstance(pvh_raw, Exception):
        logger.warning("pvh failed — resetting AsyncNepse instance for next call")
        _nepse_instance = None

    pvh_list  = _to_list(pvh_raw)
    live_list = _to_list(live_raw)

    # Debug: show what came back
    logger.info("getPriceVolumeHistory(date=%s) → %d rows | getLiveMarket → %d rows",
                today, len(pvh_list), len(live_list))
    if pvh_list and isinstance(pvh_list[0], dict):
        logger.info("today-price fields: %s", list(pvh_list[0].keys()))
        logger.info("today-price sample row: %s", pvh_list[0])   # full row for field name diagnosis
    if isinstance(pvh_raw, Exception):
        logger.error("getPriceVolumeHistory ERROR: %s", pvh_raw)

    # Real-time LTP overlay keyed by symbol
    live_map: dict = {}
    for row in live_list:
        if isinstance(row, dict):
            sym = (row.get("symbol") or row.get("securityName") or "").upper().strip()
            if sym:
                live_map[sym] = row

    # ── Stocks ────────────────────────────────────────────────────────────
    stocks: list = []
    for s in pvh_list:
        if not isinstance(s, dict):
            continue
        try:
            sym  = (s.get("symbol") or s.get("securityName") or "").upper().strip()
            live = live_map.get(sym, {})
            sid  = s.get("securityId") or s.get("id") or s.get("companyId")

            # Cache symbol → ID for chart lookups (no extra API call needed)
            if sym and sid:
                _symbol_id_cache[sym] = sid

                # Prefer real-time LTP when market is open
                ltp = (
                    _g(live, "ltp", "lastTradedPrice") or
                    _g(s,    "ltp", "lastTradedPrice", "closingPrice", "closePrice")
                )
                
                prev_close = _g(s,
                    "previousDayClosePrice", "previousClose", "prevClose", 
                    "previousClosingPrice", "lastClose", "previousClosePrice", 
                    "prevClosingPrice", "lastClosingPrice", "prevDayClose", 
                    "previousDayClose", "yesterdayClose")
                
                change = (
                    _g(live, "pointChange", "priceChange") or
                    _g(s,    "pointChange", "priceChange", "change")
                )
                
                change_pct = (
                    _g(live, "percentageChange", "changePercent") or
                    _g(s,    "percentageChange", "changePercent")
                )
                
                if change == 0 and ltp > 0 and prev_close > 0:
                    change = ltp - prev_close
                    
                if change_pct == 0 and change != 0 and prev_close > 0:
                    change_pct = (change / prev_close) * 100

                stocks.append({
                    "id":     sid,
                    "symbol": sym,
                    "name":   s.get("securityName") or s.get("companyName") or "",

                    "ltp": ltp,
                    "change": change,
                    "change_pct": change_pct,

                    # OHLCV — try every known field name variant
                    "open":  _g(s, "openPrice",  "open",  "todayOpen"),
                    "high":  _g(s, "highPrice",  "high",  "todayHigh"),
                    "low":   _g(s, "lowPrice",   "low",   "todayLow"),
                    "prev_close": prev_close,
                    "volume":   _g(s, "totalTradeQuantity", "totalTradedQuantity",
                                      "volume", t=int),
                    "trades":   _g(s, "totalTrades", "tradeCount", t=int),
                    "turnover": _g(s, "totalTradeValue", "totalTradedValue", "turnover"),
                })
        except Exception as exc:
            logger.debug("Stock parse error [%s]: %s", s.get("symbol"), exc)

    # ── Movers ────────────────────────────────────────────────────────────
    def _movers(raw):
        out = []
        for s in _to_list(raw):
            if not isinstance(s, dict):
                continue
            try:
                out.append({
                    "symbol":     (s.get("symbol") or
                                   s.get("securityName") or "").upper().strip(),
                    "ltp":        _g(s, "ltp", "lastTradedPrice"),
                    "change":     _g(s, "pointChange",      "priceChange"),
                    "change_pct": _g(s, "percentageChange", "changePercent"),
                    "volume":     _g(s, "totalTradeQuantity",
                                       "totalTradedQuantity", t=int),
                })
            except Exception:
                continue
        return out

    # ── NEPSE Index ───────────────────────────────────────────────────────
    index: dict = {}
    idx_list = _to_list(index_raw)
    
    nepse_idx = {}
    for i in idx_list:
        if isinstance(i, dict) and str(i.get("index", "")).upper() == "NEPSE INDEX":
            nepse_idx = i
            break
            
    if not nepse_idx and idx_list and isinstance(idx_list[0], dict):
        nepse_idx = idx_list[0]
        
    if nepse_idx:
        index = {
            "value":      _g(nepse_idx, "currentValue", "index", "nepseIndex"),
            "change":     _g(nepse_idx, "change", "pointChange"),
            "change_pct": _g(nepse_idx, "perChange", "percentChange", "percentageChange"),
        }

    # ── Market Summary ────────────────────────────────────────────────────
    s_dict = {}
    for item in _to_list(summary_raw):
        if isinstance(item, dict):
            detail = str(item.get("detail", "")).lower()
            val = item.get("value", 0)
            if "turnover" in detail:
                s_dict["totalTurnover"] = val
            elif "shares" in detail or "quantity" in detail:
                s_dict["totalQuantity"] = val
            elif "transactions" in detail or "trades" in detail:
                s_dict["totalTransactions"] = val
            elif "advancing" in detail:
                s_dict["advancingIssues"] = val
            elif "declining" in detail:
                s_dict["decliningIssues"] = val
            elif "neutral" in detail or "unchanged" in detail:
                s_dict["neutralIssues"] = val

    # Calculate fallbacks from stocks list if API summary is empty
    adv_fallback = sum(1 for s in stocks if s.get("change", 0) > 0)
    dec_fallback = sum(1 for s in stocks if s.get("change", 0) < 0)
    unc_fallback = sum(1 for s in stocks if s.get("change", 0) == 0 and s.get("ltp", 0) > 0)
    
    vol_fallback = sum(s.get("volume", 0) for s in stocks)
    trades_fallback = sum(s.get("trades", 0) for s in stocks)
    turnover_fallback = sum(s.get("turnover", 0) for s in stocks)

    summary = {
        "total_turnover": _s(s_dict.get("totalTurnover")) or turnover_fallback,
        "total_volume":   _s(s_dict.get("totalQuantity"),     int) or vol_fallback,
        "total_trades":   _s(s_dict.get("totalTransactions"), int) or trades_fallback,
        "advancing":      _s(s_dict.get("advancingIssues"),   int) or adv_fallback,
        "declining":      _s(s_dict.get("decliningIssues"),   int) or dec_fallback,
        "unchanged":      _s(s_dict.get("neutralIssues"),     int) or unc_fallback,
    }

    # ── Top Turnovers ─────────────────────────────────────────────────────
    top_turnovers = sorted(
        [s for s in stocks if s.get("turnover", 0) > 0],
        key=lambda s: s["turnover"],
        reverse=True
    )[:10]

    result = {
        "market_open":   is_market_open(),
        "market_status": get_market_status(),
        "timestamp":     _npt_now().isoformat(),
        "index":         index,
        "summary":       summary,
        "stocks":        stocks,
        "gainers":       _movers(gainers_raw),
        "losers":        _movers(losers_raw),
        "top_turnovers": top_turnovers,
        "nepse_chart":   _to_list(nepse_chart_raw),
        "stale":         False,
    }

    # Only update cache when we got real stock data
    if stocks:
        _last_good_response = result

    return result


async def get_stock_chart(symbol: str) -> dict:
    """
    Historical daily OHLCV using getCompanyPriceVolumeHistory(id) — plain GET,
    no WASM auth needed. Security ID is resolved from the module-level cache
    built when get_live_data() was last called.
    """
    symbol = symbol.upper().strip()
    nepse  = await _client()

    # Resolve security ID from cache (populated by get_live_data)
    security_id = _symbol_id_cache.get(symbol)

    if not security_id:
        # Cache miss — fetch pvh to build the map on demand
        logger.info("ID cache miss for %s — fetching pvh to resolve", symbol)
        try:
            pvh = await asyncio.wait_for(
                nepse.getPriceVolumeHistory(business_date=_today_date()),
                timeout=25,
            )
            for s in _to_list(pvh):
                if not isinstance(s, dict):
                    continue
                sym = (s.get("symbol") or s.get("securityName") or "").upper().strip()
                sid = s.get("securityId") or s.get("id") or s.get("companyId")
                if sym and sid:
                    _symbol_id_cache[sym] = sid
        except Exception as e:
            logger.warning("pvh fetch for ID resolution failed: %s", e)
        security_id = _symbol_id_cache.get(symbol)

    if not security_id:
        logger.warning("Symbol '%s' not found in security cache. Cache keys (sample): %s",
                       symbol, list(_symbol_id_cache.keys())[:10])
        return {"error": f"Symbol '{symbol}' not found.",
                "symbol": symbol, "chart_data": [], "count": 0}

    logger.info("Chart request: symbol=%s  security_id=%s", symbol, security_id)

    # Takes symbol string (calls .upper() internally — NOT the numeric ID)
    try:
        # Pass a very old start_date to force NEPSE to return all available historical data
        chart_raw = await asyncio.wait_for(
            nepse.getCompanyPriceVolumeHistory(symbol, start_date="2000-01-01"),
            timeout=30,
        )
    except asyncio.TimeoutError:
        return {"error": "Chart fetch timed out.", "symbol": symbol,
                "chart_data": [], "count": 0}
    except Exception as e:
        logger.error("getCompanyPriceVolumeHistory(%s) error: %s", symbol, e)
        return {"error": str(e), "symbol": symbol, "chart_data": [], "count": 0}

    rows = _to_list(chart_raw)
    logger.info("getCompanyPriceVolumeHistory(%s) → %d rows", symbol, len(rows))
    if rows and isinstance(rows[0], dict):
        logger.info("Chart row fields: %s", list(rows[0].keys()))

    chart_data = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        try:
            date_str = (
                row.get("businessDate") or row.get("date") or
                row.get("tradeDate")    or row.get("eodDate") or ""
            )[:10]
            if not date_str:
                continue
            chart_data.append({
                "time":  date_str,
                "open":  _s(row.get("openPrice")   or row.get("open")),
                "high":  _s(row.get("highPrice")   or row.get("high")),
                "low":   _s(row.get("lowPrice")    or row.get("low")),
                "close": _s(row.get("closePrice")  or row.get("close")
                             or row.get("closingPrice")),
                "value": _s(row.get("tradedQuantity") or row.get("volume")
                             or row.get("totalTradedQuantity")),
            })
        except Exception:
            continue

    chart_data.sort(key=lambda d: d["time"])

    # NEPSE company history endpoint often omits openPrice
    # We can approximate it using the previous day's close
    for i in range(1, len(chart_data)):
        if chart_data[i]["open"] == 0 and chart_data[i-1]["close"] > 0:
            chart_data[i]["open"] = chart_data[i-1]["close"]

    if chart_data and chart_data[0]["open"] == 0:
        chart_data[0]["open"] = chart_data[0]["close"]

    return {"symbol": symbol, "chart_data": chart_data, "count": len(chart_data)}


async def get_live_quote(symbol: str) -> dict:
    """
    Return the live LTP/OHLCV for a single symbol using a 5s shared cache of
    getLiveMarket(). Fast endpoint for real-time chart candle updates.
    Returns {"symbol", "ltp", "open", "high", "low", "volume", "live": bool}
    """
    import time as _time
    global _live_quote_cache

    now = _time.monotonic()
    if now - _live_quote_cache["ts"] > 5.0:
        try:
            nepse = await _client()
            raw = await asyncio.wait_for(nepse.getLiveMarket(), timeout=10)
            _live_quote_cache = {"ts": now, "rows": _to_list(raw)}
        except Exception as e:
            logger.debug("live_quote cache refresh failed: %s", e)

    sym = symbol.upper().strip()
    for row in _live_quote_cache["rows"]:
        if not isinstance(row, dict):
            continue
        s = (row.get("symbol") or row.get("securityName") or "").upper().strip()
        if s == sym:
            return {
                "symbol": sym,
                "ltp":    _g(row, "ltp", "lastTradedPrice"),
                "open":   _g(row, "openPrice",  "open",  "todayOpen"),
                "high":   _g(row, "highPrice",  "high",  "todayHigh"),
                "low":    _g(row, "lowPrice",   "low",   "todayLow"),
                "volume": _g(row, "totalTradeQuantity", "totalTradedQuantity", t=int),
                "live":   True,
            }
    return {"symbol": sym, "ltp": 0, "live": False}
