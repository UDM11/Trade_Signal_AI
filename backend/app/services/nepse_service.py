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
                    # Sanity Check: Ignore corrupted near-zero or negative prices that break the chart scale
                    if float(r.get("close") or 0) <= 0 or float(r.get("high") or 0) <= 0 or float(r.get("low") or 0) <= 0 or float(r.get("open") or 0) <= 0:
                        continue
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


# ── Caching Logic for Faster Updates ──────────────────────────────────────────
_market_cache: dict = {
    "ticker":   {"ts": 0.0, "data": []},
    "summary":  {"ts": 0.0, "data": {}},
    "index":    {"ts": 0.0, "data": {}},
    "movers_g": {"ts": 0.0, "data": []},
    "movers_l": {"ts": 0.0, "data": []},
    "graph":    {"ts": 0.0, "data": []},
    "pvh":      {"ts": 0.0, "data": []},
}

_nepse_semaphore = asyncio.Semaphore(1)

async def _safe_fetch(coro_func):
    """Serialize NEPSE API calls to avoid httpx connection pool exhaustion and infinite retries."""
    async with _nepse_semaphore:
        return await coro_func()


async def get_live_data(force_refresh: bool = False) -> dict:
    """
    Optimized live data fetcher. 
    Uses tiered caching to provide fast updates for prices (Ticker)
    while fetching heavy data (Summary, Movers, PVH) less frequently.
    """
    global _last_good_response, _nepse_instance, _market_cache
    nepse = await _client()
    now = _npt_now().timestamp()
    market_open = is_market_open()

    # Define TTLs (Seconds)
    TICKER_TTL  = 2.0   if market_open else 60.0
    SUMMARY_TTL = 30.0  if market_open else 300.0
    MOVERS_TTL  = 30.0  if market_open else 300.0
    INDEX_TTL   = 10.0  if market_open else 60.0
    PVH_TTL     = 120.0 if market_open else 3600.0

    async def _fetch_if_expired(key, coro_func, ttl):
        """Helper to fetch and cache data only if expired with automatic retries."""
        if force_refresh or (now - _market_cache[key]["ts"] > ttl):
            for attempt in range(3): # 3 attempts for robustness
                try:
                    # PVH and Summary are heavy, allow more time
                    timeout_val = 45 if key in ["pvh", "summary"] else 25
                    res = await asyncio.wait_for(_safe_fetch(coro_func), timeout=timeout_val)
                    
                    # Basic validation: ensure we got something list-like or dict-like
                    if _to_list(res) or (isinstance(res, dict) and res):
                        _market_cache[key]["ts"] = now
                        _market_cache[key]["data"] = res
                        return res
                except Exception as e:
                    if attempt < 2:
                        await asyncio.sleep(2) # Backoff before retry
                        continue
                    if isinstance(e, (TimeoutError, asyncio.TimeoutError)):
                        logger.debug(f"Cache fetch failed for {key} after 3 attempts: {type(e).__name__} - {e}")
                    else:
                        logger.warning(f"Cache fetch failed for {key} after 3 attempts: {type(e).__name__} - {e}")
        return _market_cache[key]["data"]

    # 1. Fetch components concurrently only if needed
    # We pass lambdas to delay the creation of coroutines until needed
    ticker_task = _fetch_if_expired("ticker", lambda: nepse.getLiveMarket(), TICKER_TTL)
    
    tasks = [
        ticker_task,
        _fetch_if_expired("summary", lambda: nepse.getSummary(),              SUMMARY_TTL),
        _fetch_if_expired("movers_g", lambda: nepse.getTopGainers(),           MOVERS_TTL),
        _fetch_if_expired("movers_l", lambda: nepse.getTopLosers(),            MOVERS_TTL),
        _fetch_if_expired("index",   lambda: nepse.getNepseIndex(),           INDEX_TTL),
        _fetch_if_expired("graph",   lambda: nepse.getDailyNepseIndexGraph(), INDEX_TTL),
    ]
    
    # Optional: PVH is very heavy, fetch even less frequently
    if force_refresh or (now - _market_cache["pvh"]["ts"] > PVH_TTL):
        tasks.append(_fetch_if_expired("pvh", lambda: nepse.getPriceVolumeHistory(business_date=get_latest_trading_date()), PVH_TTL))
    
    results = await asyncio.gather(*tasks)
    
    ticker_raw  = results[0]
    summary_raw = results[1]
    gainers_raw = results[2]
    losers_raw  = results[3]
    index_raw   = results[4]
    graph_raw   = results[5]
    pvh_raw     = results[6] if len(results) > 6 else _market_cache["pvh"]["data"]

    pvh_list = _to_list(pvh_raw)
    live_list = _to_list(ticker_raw)

    # ── Fallback Logic ──────────────────────────────────────────────────
    if not pvh_list and market_open:
        # If PVH is empty but ticker has data, we can still show prices
        pvh_list = [] # Already empty, will use live_list as source below

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
                    "sector": s.get("sectorName") or s.get("sector") or "Other",

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

    # ── NEPSE Index & Sectors (Trader V5 Upgrade) ─────────────────────────────
    index: dict = {}
    market_indices: list = []
    sectors_map: dict = {}
    idx_list = _to_list(index_raw)
    
    # 1. Categorize indices from API
    for i in idx_list:
        if not isinstance(i, dict): continue
        idx_name = str(i.get("index", i.get("indexName", ""))).upper()
        
        idx_data = {
            "name":       idx_name.replace(" INDEX", "").replace(" SUB-INDEX", "").strip(),
            "value":      _g(i, "currentValue", "index", "nepseIndex"),
            "change":     _g(i, "change", "pointChange"),
            "change_pct": _g(i, "perChange", "percentChange", "percentageChange"),
            "open":       _g(i, "open", "openPrice"),
            "high":       _g(i, "high", "highPrice"),
            "low":        _g(i, "low", "lowPrice"),
        }
        
        # Primary Index
        if idx_name == "NEPSE INDEX":
            index = idx_data
        # Broad Market Indices (Float, Sensitive)
        elif any(x in idx_name for x in ["FLOAT", "SENSITIVE"]):
            market_indices.append(idx_data)
        # Real Sectors (Banking, Hydro, etc.)
        else:
            sectors_map[idx_data["name"]] = idx_data

    # 1.5. Calculate OHLC for NEPSE Index from intraday graph if missing
    if index and (not index.get("open") or not index.get("high") or index["open"] == index["value"]):
        graph_list = _to_list(graph_raw)
        if graph_list:
            # graph_raw is usually [ [timestamp, value], ... ]
            vals = []
            for p in graph_list:
                if isinstance(p, (list, tuple)) and len(p) >= 2:
                    try: vals.append(float(p[1]))
                    except: continue
                elif isinstance(p, dict):
                    v = _g(p, "value", "ltp", "price")
                    if v: vals.append(v)
            
            if vals:
                index["open"] = vals[0]
                index["high"] = max(vals)
                index["low"] = min(vals)
                logger.info(f"Derived NEPSE Index OHLC from graph: O={index['open']}, H={index['high']}, L={index['low']}")

    # 2. Fallback/Augment: Always check stocks to find missing sectors
    if stocks:
        temp_sectors = {}
        for s in stocks:
            sec = s.get("sector") or "Other"
            if sec not in temp_sectors:
                temp_sectors[sec] = {"sum": 0.0, "count": 0, "val": 0.0}
            if s.get("change_pct") is not None:
                temp_sectors[sec]["sum"] += s["change_pct"]
                temp_sectors[sec]["count"] += 1
                temp_sectors[sec]["val"] += s.get("ltp", 0)
        
        for name, data in temp_sectors.items():
            if data["count"] > 0:
                # If sector from stock data is NOT in sectors_map, or sectors_map is empty, add it
                if name not in sectors_map:
                    sectors_map[name] = {
                        "name":       name,
                        "value":      data["val"] / data["count"],
                        "change":     0,
                        "change_pct": data["sum"] / data["count"]
                    }

    sectors = list(sectors_map.values())

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
        "advancers":      _s(s_dict.get("advancingIssues"),   int) or adv_fallback,
        "decliners":      _s(s_dict.get("decliningIssues"),   int) or dec_fallback,
        "unchanged":      _s(s_dict.get("neutralIssues"),     int) or unc_fallback,
        "total_stocks":   len(stocks)
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

    # ── Market Breadth / Sector Analysis (Trader V5 Upgrade) ──────────────
    # NEPSE provides indices for each sector. We calculate the performance
    # of each sector based on advancing/declining stocks within it.
    # Note: For now, we use a symbol-to-sector mapping if available, 
    # but the simplest way is to categorize by the index name.
    sectors: dict = {}
    idx_list = _to_list(index_raw)
    for idx in idx_list:
        if not isinstance(idx, dict): continue
        name = str(idx.get("index", "")).upper()
        if "INDEX" in name and name != "NEPSE INDEX":
            sectors[name] = {
                "name":       name.replace(" INDEX", "").strip(),
                "value":      _g(idx, "currentValue", "index"),
                "change":     _g(idx, "change", "pointChange"),
                "change_pct": _g(idx, "perChange", "percentChange"),
            }

    result = {
        "market_open":   actually_open,
        "market_status": effective_status,
        "timestamp":     _npt_now().isoformat(),
        "index":         index,
        "market_indices": market_indices,
        "summary":       summary,
        "sectors":       sectors,
        "stocks":        stocks,
        "gainers":       gainers,
        "losers":        losers,
        "top_turnovers": top_turnovers,
        "top_volumes":   top_volumes,
        "nepse_chart":   _to_list(graph_raw),
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
            
            clean_db = []
            for r in ohlcv_res.data:
                o, h, l, c = [float(r.get(k) or 0) for k in ["open", "high", "low", "close"]]
                # If all prices are 0 but volume exists, the row is corrupted. 
                # We skip it so the API fetch logic can "heal" it by downloading fresh data.
                if o == 0 and h == 0 and l == 0 and c == 0:
                    continue
                
                clean_db.append({
                    "time": r["date"],
                    "open": o,
                    "high": h,
                    "low": l,
                    "close": c,
                    "value": float(r.get("volume") or r.get("total_traded_quantity") or r.get("traded_quantity") or 0),
                })
            return clean_db
        except Exception as e:
            logger.error("Supabase data fetch failed: %s", e)
            return []
    

    nepse  = await _client()

    # 1. Fetch from Supabase first (Highest reliability)
    db_data = await get_db_data(symbol)
    
    # 2. Resolve security ID from cache (used for historical API)
    security_id = _symbol_id_cache.get(symbol)
    if not security_id:
        logger.info("ID cache miss for %s — fetching pvh to resolve", symbol)
        try:
            # Use latest trading date instead of today's date to avoid holiday/closed empty responses
            latest_trading = get_latest_trading_date()
            pvh = await asyncio.wait_for(
                _safe_fetch(lambda: nepse.getPriceVolumeHistory(business_date=latest_trading)),
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
        
        # Incremental fetch strategy
        if db_data:
            last_date_str = db_data[-1]["time"]
            last_dt = datetime.strptime(last_date_str, "%Y-%m-%d")
            start_dt = last_dt - timedelta(days=5) # 5-day overlap
            chunks = [(start_dt, now)]
        else:
            # Full historical fetch (6 years in chunks)
            chunks = [
                (now - timedelta(days=365*2), now),
                (now - timedelta(days=365*4), now - timedelta(days=365*2 + 1)),
                (now - timedelta(days=365*6), now - timedelta(days=365*4 + 1)),
            ]
        
        async def fetch_api_chunks(active_chunks):
            results = []
            for start_dt, end_dt in active_chunks:
                s_str = start_dt.strftime("%Y-%m-%d")
                e_str = end_dt.strftime("%Y-%m-%d")
                
                chart_raw = None
                # Historical API works best with numeric security_id
                identifiers = [security_id, symbol] if security_id else [symbol]
                
                for identifier in identifiers:
                    if not identifier: continue
                    try:
                        chart_raw = await asyncio.wait_for(
                            _safe_fetch(lambda: nepse.getCompanyPriceVolumeHistory(identifier, start_date=s_str, end_date=e_str)),
                            timeout=15,
                        )
                        if _to_list(chart_raw): break
                    except: continue
                
                rows = _to_list(chart_raw)
                for row in rows:
                    if not isinstance(row, dict): continue
                    date_str = (row.get("businessDate") or row.get("date") or row.get("tradeDate") or "")[:10]
                    if not date_str: continue
                    results.append({
                        "time":  date_str,
                        "open":  _g(row, "openPrice", "open", "todayOpen"),
                        "high":  _g(row, "highPrice", "high", "todayHigh"),
                        "low":   _g(row, "lowPrice",  "low",  "todayLow"),
                        "close": _g(row, "closePrice", "close", "lastTradedPrice"),
                        "value": _g(row, "totalTradedQuantity", "totalTradeQuantity", "tradedQuantity", "volume", t=float),
                    })
            return results

        api_data = await fetch_api_chunks(chunks)
        
        # Proactive Deep History: If we have very little history (< 2 years / 500 trading days),
        # try to fetch a massive 3-year block to populate the database.
        if len(db_data) < 500:
            logger.info("Insufficient local history for %s (%d days). Triggering 3-year deep history fetch.", symbol, len(db_data))
            full_chunks = [(now - timedelta(days=365*3), now)]
            api_data = await fetch_api_chunks(full_chunks)

    except Exception as e:
        logger.warning("Historical API chart fetch for %s failed: %s", symbol, e)

    # 3.5 Write-Through Cache: Save new API data back to Supabase
    if api_data:
        try:
            from app.services.supabase_client import get_supabase
            supabase = get_supabase()
            if supabase:
                # Resolve stock ID
                stock_res = supabase.table("stocks").select("id").eq("symbol", symbol).execute()
                if stock_res.data:
                    stock_id = stock_res.data[0]["id"]
                    # Prepare batch for upsert
                    sync_payload = []
                    for d in api_data:
                        sync_payload.append({
                            "stock_id": stock_id,
                            "date":     d["time"],
                            "open":     d["open"],
                            "high":     d["high"],
                            "low":      d["low"],
                            "close":    d["close"],
                            "volume":   d["value"]
                        })
                    # Batch upsert (Supabase handles duplicates via on_conflict if constraint exists)
                    if sync_payload:
                        supabase.table("daily_ohlcv").upsert(sync_payload, on_conflict="stock_id,date").execute()
                        logger.info("Write-Through Cache: Synced %d rows to Supabase for %s", len(sync_payload), symbol)
        except Exception as se:
            logger.debug("Write-Through Cache failed for %s (non-critical): %s", symbol, se)

    # 4. Merge Data (API data takes precedence for matching dates)
    if not db_data and not api_data:
        return {"error": "No data available from API or Database", "symbol": symbol, "chart_data": [], "count": 0}

    merged_map = {d["time"]: d for d in db_data}
    for d in api_data:
        merged_map[d["time"]] = d
        
    final_data = sorted(merged_map.values(), key=lambda d: d["time"])

    # ── Professional Data Processing ──────────────────────────────────────────
    try:
        from database.import_history import import_and_clean_history
        from app.indicators import add_indicators
        
        # Heal Open=0 using PREVIOUS DAY'S CLOSE (not current close!).
        # Using current close makes open==close → always a doji → always green.
        # Using prev close correctly shows red candles on down days.
        prev_close = 0
        for d in final_data:
            c = d.get("close", 0)
            if d.get("open", 0) == 0:
                # Use previous close if available, otherwise fall back to current close
                d["open"] = prev_close if prev_close > 0 else c
            if c > 0:
                prev_close = c
        
        # Build a DataFrame for indicators — but we keep ALL rows for chart display
        df_cleaned = import_and_clean_history(symbol, final_data)
        
        if len(df_cleaned) >= 15:
            df_indicators = add_indicators(df_cleaned)
            # Build a lookup: date string → indicator row
            ind_map = {}
            for _, row in df_indicators.iterrows():
                d_str = row["Date"].strftime("%Y-%m-%d") if hasattr(row["Date"], "strftime") else str(row["Date"])[:10]
                ind_map[d_str] = row
        else:
            ind_map = {}
        
        # Re-format: use ALL original rows (no rows dropped), attach indicators where available
        processed_chart = []
        for d in final_data:
            d_str = d.get("time", "")[:10]
            row = ind_map.get(d_str)
            entry = {
                "time":  d_str,
                "open":  round(float(d.get("open", 0)), 2),
                "high":  round(float(d.get("high", 0)), 2),
                "low":   round(float(d.get("low", 0)), 2),
                "close": round(float(d.get("close", 0)), 2),
                "value": round(float(d.get("value", 0)), 2),
                # Indicators — 0 for early warmup rows that don't have them yet
                "rsi":        round(float(row.get("RSI", 0)), 2) if row is not None else 0,
                "macd":       round(float(row.get("MACD", 0)), 3) if row is not None else 0,
                "macd_signal":round(float(row.get("MACD_signal", 0)), 3) if row is not None else 0,
                "macd_hist":  round(float(row.get("MACD_diff", 0)), 3) if row is not None else 0,
                "ema9":       round(float(row.get("EMA_9", 0)), 2) if row is not None else 0,
                "ema21":      round(float(row.get("EMA_21", 0)), 2) if row is not None else 0,
                "ma50":       round(float(row.get("MA_50", 0)), 2) if row is not None else 0,
                "ma200":      round(float(row.get("MA_200", 0)), 2) if row is not None else 0,
                "bb_upper":   round(float(row.get("BB_High", 0)), 2) if row is not None else 0,
                "bb_lower":   round(float(row.get("BB_Low", 0)), 2) if row is not None else 0,
            }
            processed_chart.append(entry)
        
        final_data = processed_chart
        logger.info(f"Chart processed: {len(final_data)} rows preserved for {symbol} (indicators synced where available)")
        
    except Exception as e:
        logger.error(f"Indicator Synchronization failed for {symbol}: {e}")


    # 5. Price-Healing Logic: Fill zero prices, fix OHLC consistency, remove only truly corrupt rows
    cleaned_data = []
    
    # ── Pass 1: Collect valid closes for median-based outlier detection ──────
    valid_closes = [d.get("close", 0) for d in final_data if d.get("close", 0) > 0]
    median_close = float(sorted(valid_closes)[len(valid_closes) // 2]) if valid_closes else 0

    # ── Pass 2: Forward-fill zero closes from last valid close ───────────────
    last_valid_close = 0
    for d in final_data:
        c = d.get("close", 0)
        if c > 0:
            last_valid_close = c
        elif last_valid_close > 0:
            d["close"] = last_valid_close  # heal: fill with last known price
            c = last_valid_close

    # ── Pass 3: Backward-fill any remaining zero closes (leading rows) ───────
    last_valid_close = 0
    for d in reversed(final_data):
        c = d.get("close", 0)
        if c > 0:
            last_valid_close = c
        elif last_valid_close > 0:
            d["close"] = last_valid_close
            c = last_valid_close

    # ── Pass 4: Clean OHLC consistency & remove only genuine outliers ────────
    prev_c = 0  # track previous close for open-healing
    for d in final_data:
        c = d.get("close", 0)

        # Skip truly unrecoverable rows (no price data at all)
        if c <= 0:
            continue

        # Only drop rows that are extreme outliers relative to median
        # (e.g. old pre-split data that wasn't back-adjusted — >95% away from median)
        if median_close > 0 and c < (median_close * 0.05):
            continue

        # Heal: If open is still 0, use previous close for correct red/green candle rendering
        if d.get("open", 0) == 0:
            d["open"] = prev_c if prev_c > 0 else c

        # Ensure High >= max(Open, Close) and Low <= min(Open, Close)
        o = d.get("open", c)
        d["high"] = max(d.get("high", 0), o, c)
        low_cand  = min(o, c)
        d["low"]  = min(d.get("low", low_cand), low_cand) if d.get("low", 0) > 0 else low_cand

        cleaned_data.append(d)
        prev_c = c  # update for next row

    return {"symbol": symbol, "chart_data": cleaned_data, "count": len(cleaned_data)}


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
