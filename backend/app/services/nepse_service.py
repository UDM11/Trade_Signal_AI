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
    
    # NEPSE Schedule: Sunday (6) to Thursday (3) 
    # Friday (4) and Saturday (5) are holidays
    if wd in (4, 5):
        return False
        
    # Open session: 11:00 AM to 3:00 PM
    return dtime(11, 0) <= t <= dtime(15, 0)

def get_market_status() -> str:
    now = _npt_now()
    t, wd = now.time(), now.weekday()
    
    # 4 = Friday, 5 = Saturday
    if wd in (4, 5):
        return "CLOSED"
        
    # Pre-open session: 10:30 AM to 11:00 AM (includes matching window)
    if dtime(10, 30) <= t < dtime(11, 0):
        return "PRE-OPEN"
        
    # Open session: 11:00 AM to 3:00 PM
    if dtime(11, 0) <= t <= dtime(15, 0):
        return "OPEN"
            
    return "CLOSED"


def _today_date() -> str:
    """Today's date in Nepal time, formatted for NEPSE API (YYYY-MM-DD)."""
    return _npt_now().strftime("%Y-%m-%d")


def get_latest_trading_date() -> str:
    """Returns the most recent trading date (today if open/after-close, else previous business day)."""
    now = _npt_now()
    t = now.time()
    wd = now.weekday()
    
    # NEPSE Trading: Sun(6) to Thu(3). Fri(4) & Sat(5) are holidays.
    # If today is a trading day and it's after market open (11:00 AM), today is the active session.
    if wd in (6, 0, 1, 2, 3) and t >= dtime(11, 0):
        return now.strftime("%Y-%m-%d")
        
    # Otherwise, go back day by day until we find a trading day.
    check = now - timedelta(days=1)
    while check.weekday() in (4, 5):
        check -= timedelta(days=1)
    return check.strftime("%Y-%m-%d")


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
    """Fetch lifetime NEPSE index OHLCV history from Supabase, local CSV, and Chukul API."""
    data_map = {}
    
    # 1. Load from Supabase (Highest Priority / User's main database)
    try:
        from app.services.supabase_client import get_supabase
        supabase = get_supabase()
        if supabase:
            # Note: Index might be stored under symbol 'NEPSE' or a specific index ID
            res = supabase.table("daily_ohlcv").select("*, stocks!inner(symbol)").eq("stocks.symbol", "NEPSE").order("date", desc=False).execute()
            if res.data:
                for r in res.data:
                    data_map[r["date"]] = {
                        "time": r["date"],
                        "open": float(r.get("open") or 0),
                        "high": float(r.get("high") or 0),
                        "low": float(r.get("low") or 0),
                        "close": float(r.get("close") or 0),
                        "volume": float(r.get("volume") or r.get("total_traded_quantity") or 0),
                    }
                logger.info(f"Loaded {len(res.data)} NEPSE records from Supabase")
    except Exception as e:
        logger.warning(f"Supabase NEPSE fetch failed: {e}")

    # 2. Layer with local historical lifetime CSV
    try:
        csv_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', 'database', 'nepse data.csv'))
        if os.path.exists(csv_path):
            with open(csv_path, 'r', encoding='utf-8') as f:
                reader = csv.DictReader(f)
                for row in reader:
                    date_val = row["Date"]
                    if date_val not in data_map: # Don't overwrite Supabase data
                        v_str = row.get("Volume", "0").replace(",", "")
                        data_map[date_val] = {
                            "time": date_val,
                            "open": float(row.get("Open", 0)),
                            "high": float(row.get("High", 0)),
                            "low": float(row.get("Low", 0)),
                            "close": float(row.get("Close", 0)),
                            "volume": float(v_str) if v_str and v_str != '-' else 0.0,
                        }
    except Exception as e:
        logger.error(f"Failed to read NEPSE CSV: {e}")

    # 3. Layer with live/recent data from Chukul
    try:
        headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
        async with httpx.AsyncClient(timeout=60.0, headers=headers) as client:
            resp = await client.get("https://chukul.com/api/data/historydata/?symbol=nepse")
            if resp.status_code == 200:
                data = resp.json()
                for row in data:
                    date_val = row.get("date")
                    if date_val:
                        data_map[date_val] = {
                            "time": date_val,
                            "open": float(row.get("open", 0)),
                            "high": float(row.get("high", 0)),
                            "low": float(row.get("low", 0)),
                            "close": float(row.get("close", 0)),
                            "volume": float(row.get("volume", 0)),
                        }
    except Exception as e:
        logger.warning(f"Chukul NEPSE update failed: {e}")
                    
    # 4. Sort ascending by date
    return sorted(data_map.values(), key=lambda x: x["time"])

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
    market_open = is_market_open()

    # Fetch PVH if market is open OR if it's after market close (to get final day data).
    # If it's early morning (before 11:00), fetch for the last trading session instead of today.
    now_time = _npt_now().time()
    effective_pvh_date = get_latest_trading_date()
    
    # Only skip if it's a holiday and we have no fallback date (unlikely)
    pvh_coro = _safe(nepse.getPriceVolumeHistory(business_date=effective_pvh_date), timeout=60)

    (pvh_raw, live_raw, summary_raw,
     gainers_raw, losers_raw, index_raw, nepse_chart_raw) = await asyncio.gather(
        pvh_coro,
        _safe(nepse.getLiveMarket(),           timeout=60),
        _safe(nepse.getSummary(),              timeout=60),
        _safe(nepse.getTopGainers(),           timeout=60),
        _safe(nepse.getTopLosers(),            timeout=60),
        _safe(nepse.getNepseIndex(),           timeout=60),
        _safe(nepse.getDailyNepseIndexGraph(), timeout=60),
    )

    # Reset singleton on fatal failure
    if isinstance(pvh_raw, Exception) and market_open:
        logger.warning("pvh failed during market hours — resetting AsyncNepse instance")
        _nepse_instance = None

    pvh_list = _to_list(pvh_raw)
    
    # Internal helper for direct NEPSE API fetch
    async def _direct_fetch(date_str):
        try:
            url = f"https://newweb.nepalstock.com/api/nots/nepse-data/today-price?&size=500&businessDate={date_str}"
            async with httpx.AsyncClient(verify=False, timeout=15) as client:
                resp = await client.get(url, headers={
                    "User-Agent": "Mozilla/5.0", "Referer": "https://newweb.nepalstock.com/"
                })
                if resp.status_code == 200:
                    return _to_list(resp.json())
        except Exception:
            pass
        return []

    # ── Fallback 1: Direct Today-Price Fetch (if primary failed) ────────
    if not pvh_list:
        pvh_list = await _direct_fetch(effective_pvh_date)
        if pvh_list:
            logger.info("pvh fallback (today) → %d rows", len(pvh_list))

    # ── Fallback 2: Previous Trading Day (if today is holiday/empty) ───
    if not pvh_list:
        check = datetime.strptime(effective_pvh_date, "%Y-%m-%d") - timedelta(days=1)
        while check.weekday() in (4, 5):
            check -= timedelta(days=1)
        prev_date = check.strftime("%Y-%m-%d")
        pvh_list = await _direct_fetch(prev_date)
        if pvh_list:
            logger.info("pvh fallback (prev: %s) → %d rows", prev_date, len(pvh_list))

    live_list = _to_list(live_raw)

    logger.info("pvh → %d rows | live → %d rows | market_open=%s",
                len(pvh_list), len(live_list), market_open)
    if market_open and isinstance(pvh_raw, Exception):
        logger.error("getPriceVolumeHistory ERROR: %s", pvh_raw)
    if not pvh_list and live_list and isinstance(live_list[0], dict):
        logger.debug("pvh empty — using live_list as stock source; fields: %s", list(live_list[0].keys()))

    # Real-time LTP overlay keyed by symbol
    live_map: dict = {}
    for row in live_list:
        if isinstance(row, dict):
            sym = (row.get("symbol") or row.get("securityName") or "").upper().strip()
            if sym:
                live_map[sym] = row

    # ── Stocks ────────────────────────────────────────────────────────────
    # When pvh is empty (market closed / weekend), fall back to live_list so
    # the stocks table, top_turnovers, and top_volumes still have data.
    source_list = pvh_list if pvh_list else live_list

    stocks: list = []
    for s in source_list:
        if not isinstance(s, dict):
            continue
        try:
            sym  = (s.get("symbol") or s.get("securityName") or "").upper().strip()
            live = live_map.get(sym, {})
            sid  = (s.get("securityId") or s.get("id") or s.get("companyId")
                    or live.get("securityId") or live.get("id"))

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

                    # OHLCV — try every known field name variant (pvh and live field names)
                    "open":  _g(s, "openPrice",  "open",  "todayOpen",  "openingPrice"),
                    "high":  _g(s, "highPrice",  "high",  "todayHigh",  "highPrice"),
                    "low":   _g(s, "lowPrice",   "low",   "todayLow",   "lowPrice"),
                    "prev_close": prev_close,
                    "volume":   _g(s, "totalTradeQuantity", "totalTradedQuantity",
                                      "volume", "tradedQuantity", t=int),
                    "trades":   _g(s, "totalTrades", "tradeCount", "numberOfTransactions", t=int),
                    "turnover": _g(s, "totalTradeValue", "totalTradedValue", "turnover", "tradedValue"),
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
            "open":       _g(nepse_idx, "openIndex", "open", "openingIndex"),
            "high":       _g(nepse_idx, "highIndex", "high", "maxIndex"),
            "low":        _g(nepse_idx, "lowIndex", "low", "minIndex"),
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

    # ── Top Volume ────────────────────────────────────────────────────────
    top_volumes = sorted(
        [s for s in stocks if s.get("volume", 0) > 0],
        key=lambda s: s["volume"],
        reverse=True
    )[:10]

    # ── Public Holiday / Unexpected Closure Detection ────────────────────
    # If is_market_open() says True (Mon-Fri, 11AM-3PM) but the NEPSE API
    # returns NO live data, it means the exchange is closed for a public
    # holiday or an unexpected suspension. Override status accordingly.
    actually_open = market_open and len(live_list) > 0
    effective_status = get_market_status() if actually_open else (
        "HOLIDAY" if market_open else get_market_status()
    )

    # ── Gainers / Losers ──────────────────────────────────────────────────
    gainers = _movers(gainers_raw)
    losers  = _movers(losers_raw)
    
    # Fallback: Derive from stocks list if specific endpoints are empty
    if not gainers and stocks:
        gainers = sorted(
            [s for s in stocks if s.get("change_pct", 0) > 0],
            key=lambda s: s["change_pct"],
            reverse=True
        )[:10]
        
    if not losers and stocks:
        losers = sorted(
            [s for s in stocks if s.get("change_pct", 0) < 0],
            key=lambda s: s["change_pct"],
            reverse=False
        )[:10]

    result = {
        "market_open":   actually_open,
        "market_status": effective_status,
        "timestamp":     _npt_now().isoformat(),
        "index":         index,
        "summary":       summary,
        "stocks":        stocks,
        "gainers":       gainers,
        "losers":        losers,
        "top_turnovers": top_turnovers,
        "top_volumes":   top_volumes,
        "nepse_chart":   _to_list(nepse_chart_raw),
        "stale":         False,
    }

    # Only update cache when we got real stock data
    if stocks:
        _last_good_response = result

    # When market is closed today's pvh is empty — serve last session's data
    if not stocks and _last_good_response:
        stale = dict(_last_good_response)
        stale["stale"] = True
        stale["market_open"]   = actually_open          # correct: False on holiday
        stale["market_status"] = effective_status       # correct: HOLIDAY / CLOSED
        stale["timestamp"]     = result["timestamp"]
        stale["index"]         = result["index"] if result["index"] else stale.get("index", {})
        stale["nepse_chart"]   = result["nepse_chart"] if result["nepse_chart"] else stale.get("nepse_chart", [])
        return stale

    return result


async def get_stock_chart(symbol: str) -> dict:
    """Fetches daily OHLCV history for a symbol using securityId from cache."""
    from app.services.nepse_service import _last_good_response
    
    symbol = symbol.strip().upper()
    sec_id = _symbol_id_cache.get(symbol)
    
    # Fallback: Search live market cache if ID is missing from static map
    if not sec_id and _last_good_response:
        for s in _last_good_response.get("stocks", []):
            if s.get("symbol") == symbol:
                sec_id = s.get("securityId") or s.get("id")
                if sec_id:
                    _symbol_id_cache[symbol] = sec_id
                    break
                
    if not sec_id:
        return {"error": f"Security ID not found for {symbol}", "chart_data": []}

    async def get_db_data(sym: str):
        try:
            from app.services.supabase_client import get_supabase
            supabase = get_supabase()
            if not supabase: return []
            stock_res = supabase.table("stocks").select("id").eq("symbol", sym).execute()
            if not stock_res.data: return []
            stock_id = stock_res.data[0]["id"]
            ohlcv_res = supabase.table("daily_ohlcv").select("*").eq("stock_id", stock_id).order("date", desc=False).execute()
            if not ohlcv_res.data: return []
            return [{
                "time": r["date"],
                "open": float(r.get("open") or 0),
                "high": float(r.get("high") or 0),
                "low": float(r.get("low") or 0),
                "close": float(r.get("close") or 0),
                "value": float(r.get("volume") or r.get("total_traded_quantity") or r.get("traded_quantity") or 0),
            } for r in ohlcv_res.data]
        except Exception as e:
            logger.error("Supabase data fetch failed: %s", e)
            return []
    
    if symbol == 'NEPSE':
        # Use the dedicated helper which handles CSV + Chukul API merge
        raw_history = await get_nepse_history()
        # Convert volume key to 'value' for chart compatibility
        processed = []
        for d in raw_history:
            processed.append({
                "time":  d["time"],
                "open":  d["open"],
                "high":  d["high"],
                "low":   d["low"],
                "close": d["close"],
                "value": d.get("volume") or d.get("value") or 0
            })
        return {"symbol": "NEPSE", "chart_data": processed, "count": len(processed)}

    nepse  = await _client()

    # 1. Fetch from Supabase first (Highest reliability)
    db_data = await get_db_data(symbol)
    
    # 2. Resolve security ID from cache (used for some API versions)
    security_id = _symbol_id_cache.get(symbol)
    if not security_id:
        logger.info("ID cache miss for %s — fetching pvh to resolve", symbol)
        try:
            pvh = await asyncio.wait_for(
                nepse.getPriceVolumeHistory(business_date=_today_date()),
                timeout=25,
            )
            for s in _to_list(pvh):
                if not isinstance(s, dict): continue
                sym = (s.get("symbol") or s.get("securityName") or "").upper().strip()
                sid = s.get("securityId") or s.get("id") or s.get("companyId")
                if sym and sid:
                    _symbol_id_cache[sym] = sid
            security_id = _symbol_id_cache.get(symbol)
        except Exception as e:
            logger.debug("pvh fetch for ID resolution failed: %s", e)

    # 3. Fetch from API (Live/Recent data)
    api_data = []
    try:
        from datetime import datetime, timedelta
        now = datetime.now()
        
        # If we have DB data, only fetch from the last date onwards to save time/bandwidth
        # Otherwise fetch the last 6 years in chunks
        if db_data:
            last_date_str = db_data[-1]["time"]
            last_dt = datetime.strptime(last_date_str, "%Y-%m-%d")
            # Overlap by 5 days to ensure no gaps from weekends/holidays
            start_dt = last_dt - timedelta(days=5)
            chunks = [(start_dt, now)]
            logger.info("Deep Analysis: Using DB history for %s, fetching only from %s from API", symbol, start_dt.strftime("%Y-%m-%d"))
        else:
            chunks = [
                (now - timedelta(days=365*2), now),
                (now - timedelta(days=365*4), now - timedelta(days=365*2 + 1)),
                (now - timedelta(days=365*6), now - timedelta(days=365*4 + 1)),
            ]
        
        for start_dt, end_dt in chunks:
            s_str = start_dt.strftime("%Y-%m-%d")
            e_str = end_dt.strftime("%Y-%m-%d")
            
            # Try fetching by Symbol first, then by ID as fallback
            chart_raw = None
            for identifier in [symbol, security_id]:
                if not identifier: continue
                try:
                    chart_raw = await asyncio.wait_for(
                        nepse.getCompanyPriceVolumeHistory(identifier, start_date=s_str, end_date=e_str),
                        timeout=15,
                    )
                    if _to_list(chart_raw): break
                except: continue
            
            rows = _to_list(chart_raw)
            if not rows: continue
            
            for row in rows:
                if not isinstance(row, dict): continue
                date_str = (row.get("businessDate") or row.get("date") or row.get("tradeDate") or "")[:10]
                if not date_str: continue
                api_data.append({
                    "time":  date_str,
                    "open":  _g(row, "openPrice", "open", "todayOpen"),
                    "high":  _g(row, "highPrice", "high", "todayHigh"),
                    "low":   _g(row, "lowPrice",  "low",  "todayLow"),
                    "close": _g(row, "closePrice", "close", "lastTradedPrice"),
                    "value": _g(row, "totalTradedQuantity", "totalTradeQuantity", "tradedQuantity", "volume", t=float),
                })
            
            if len(chunks) > 1:
                await asyncio.sleep(0.5)

    except Exception as e:
        logger.warning("Iterative API chart fetch for %s failed: %s", symbol, e)

    # 4. Merge Data (API data takes precedence for matching dates)
    if not db_data and not api_data:
        return {"error": "No data available from API or Database", "symbol": symbol, "chart_data": [], "count": 0}

    merged_map = {d["time"]: d for d in db_data}
    for d in api_data:
        merged_map[d["time"]] = d
        
    final_data = sorted(merged_map.values(), key=lambda d: d["time"])

    # 4. Post-process (Fix missing open prices)
    # NEPSE company history endpoint often omits openPrice
    # We approximate it using the previous day's close
    for i in range(len(final_data)):
        if final_data[i]["open"] == 0:
            if i > 0 and final_data[i-1]["close"] > 0:
                final_data[i]["open"] = final_data[i-1]["close"]
            else:
                final_data[i]["open"] = final_data[i]["close"]
        
        # Ensure high/low are valid relative to open/close
        final_data[i]["high"] = max(final_data[i]["high"], final_data[i]["open"], final_data[i]["close"])
        if final_data[i]["low"] == 0:
             final_data[i]["low"] = min(final_data[i]["open"], final_data[i]["close"])
        else:
             final_data[i]["low"] = min(final_data[i]["low"], final_data[i]["open"], final_data[i]["close"])

    logger.info("Successfully merged data for %s: %d total rows", symbol, len(final_data))
    return {"symbol": symbol, "chart_data": final_data, "count": len(final_data)}


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


async def get_stock_intraday(symbol: str) -> dict:
    """
    Fetch 1-minute (intraday) OHLCV for a single symbol from NepseAlpha.
    """
    import time
    from datetime import datetime
    
    symbol = symbol.upper().strip()
    end_time = int(time.time())
    # Fetch last 3 days to ensure we have data even if market is closed today
    start_time = end_time - (3 * 24 * 60 * 60)
    
    # NepseAlpha Resolution '1' = 1 minute
    url = f"https://nepsealpha.com/trading/chart/history?symbol={symbol}&resolution=1&from={start_time}&to={end_time}"
    
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": "https://newweb.nepalstock.com/",
        "Origin": "https://newweb.nepalstock.com",
    }
    
    # Increase timeout for cloud deployments (NEPSE is slow/unstable)
    try:
        async with httpx.AsyncClient(headers=headers, verify=False, timeout=60.0) as client:
            resp = await client.get(url, headers=headers)
            if resp.status_code != 200:
                return {"error": f"Failed to fetch intraday for {symbol}", "chart_data": []}
            
            data = resp.json()
            if data.get("s") != "ok":
                return {"error": "NepseAlpha returned no data", "chart_data": []}
            
            chart_data = []
            for i in range(len(data.get("t", []))):
                dt = datetime.fromtimestamp(data["t"][i])
                chart_data.append({
                    "time":  dt.strftime("%Y-%m-%d %H:%M:%S"),
                    "open":  float(data["o"][i]),
                    "high":  float(data["h"][i]),
                    "low":   float(data["l"][i]),
                    "close": float(data["c"][i]),
                    "value": float(data["v"][i]) if "v" in data else 0,
                })
            
            return {
                "symbol": symbol,
                "chart_data": chart_data,
                "count": len(chart_data)
            }
    except Exception as e:
        logger.error(f"Intraday fetch failed for {symbol}: {e}")
        return {"error": str(e), "chart_data": []}
