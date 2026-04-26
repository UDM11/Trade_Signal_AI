import pandas as pd
import numpy as np
from ta.momentum import RSIIndicator, StochasticOscillator
from ta.trend import MACD, EMAIndicator, ADXIndicator
from ta.volume import OnBalanceVolumeIndicator

def add_indicators(df: pd.DataFrame) -> pd.DataFrame:
    """
    Computes a comprehensive set of technical indicators and engineered features.
    Expects df to have 'Close', 'High', 'Low', 'Open', 'Volume' columns (case-insensitive).

    Indicator groups:
      - Trend:     EMA9, EMA21, MA50, MA200, MACD, ADX
      - Momentum:  RSI, Stochastic %K/%D, 5/10-day momentum
      - Volatility: Bollinger Bands, ATR, 20-period rolling std
      - Volume:    OBV, Volume Change
      - Price action: Candle Body/Shadows, Support/Resistance, 52-week position
      - Composite:  Close_Normalized, Above_MA50/200, MACD_Cross, RSI_Change
    """
    df = df.copy()

    # ── Normalize column names (case-insensitive) ──────────────────────────
    col_map = {}
    for col in df.columns:
        cl = col.lower()
        if cl == 'close':               col_map[col] = 'Close'
        elif cl == 'open':              col_map[col] = 'Open'
        elif cl == 'high':              col_map[col] = 'High'
        elif cl == 'low':               col_map[col] = 'Low'
        elif cl in ['volume', 'qty']:   col_map[col] = 'Volume'
    df.rename(columns=col_map, inplace=True)

    if 'Close' not in df.columns:
        raise ValueError("No 'Close' column found for indicator calculation.")

    for col in ['Close', 'Open', 'High', 'Low', 'Volume']:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors='coerce')

    df.dropna(subset=['Close'], inplace=True)

    n = len(df)

    # ── Adaptive window sizes — never exceed available rows ────────────────
    rsi_w    = min(14, max(2, n - 1))
    macd_f   = min(12, max(2, n - 1))
    macd_s   = min(26, max(3, n - 1))
    macd_sig = min(9,  max(2, n - 1))
    ema9_w   = min(9,  max(2, n))
    ema21_w  = min(21, max(2, n))
    ma50_w   = min(50,  max(2, n))
    ma200_w  = min(200, max(2, n))
    bb_w     = min(20,  max(2, n))
    atr_w    = min(14,  max(2, n - 1))
    adx_w    = min(14,  max(2, n - 1))
    stoch_w  = min(14,  max(2, n))
    stoch_s  = min(3,   max(2, n))
    roll_w   = min(20,  max(2, n))
    w52      = min(252, max(2, n))   # 52-week lookback

    has_high   = 'High'   in df.columns
    has_low    = 'Low'    in df.columns
    has_open   = 'Open'   in df.columns
    has_volume = 'Volume' in df.columns

    # ── Trend Indicators ───────────────────────────────────────────────────

    # EMA 9 & 21 — faster trend signals preferred by NEPSE day-traders
    df['EMA_9']  = EMAIndicator(close=df['Close'], window=ema9_w).ema_indicator()
    df['EMA_21'] = EMAIndicator(close=df['Close'], window=ema21_w).ema_indicator()

    # EMA crossover: 1 = EMA9 > EMA21 (bullish), 0 = bearish
    df['EMA_Cross'] = (df['EMA_9'] > df['EMA_21']).astype(int)

    # Moving Averages — min_periods=1: expanding window until full data available,
    # avoiding the 0-fill that made Above_MA200 trivially true for early rows.
    df['MA_50']  = df['Close'].rolling(window=ma50_w,  min_periods=1).mean()
    df['MA_200'] = df['Close'].rolling(window=ma200_w, min_periods=1).mean()

    # MACD
    macd_obj      = MACD(close=df['Close'], window_fast=macd_f, window_slow=macd_s, window_sign=macd_sig)
    df['MACD']        = macd_obj.macd()
    df['MACD_signal'] = macd_obj.macd_signal()
    df['MACD_diff']   = macd_obj.macd_diff()

    # ADX — trend strength 0-100 (>25 = trending, <20 = ranging)
    if has_high and has_low:
        adx_obj     = ADXIndicator(high=df['High'], low=df['Low'], close=df['Close'], window=adx_w)
        df['ADX']       = adx_obj.adx()
        df['ADX_pos']   = adx_obj.adx_pos()   # +DI (bullish directional)
        df['ADX_neg']   = adx_obj.adx_neg()   # -DI (bearish directional)
    else:
        df['ADX']     = 25.0
        df['ADX_pos'] = 0.0
        df['ADX_neg'] = 0.0

    # ── Momentum Indicators ────────────────────────────────────────────────

    # RSI
    df['RSI'] = RSIIndicator(close=df['Close'], window=rsi_w).rsi()
    df['RSI_Change'] = df['RSI'].diff()

    # Stochastic %K and %D — overbought/oversold with smoother signal
    if has_high and has_low:
        stoch_obj   = StochasticOscillator(
            high=df['High'], low=df['Low'], close=df['Close'],
            window=stoch_w, smooth_window=stoch_s
        )
        df['Stoch_K'] = stoch_obj.stoch()
        df['Stoch_D'] = stoch_obj.stoch_signal()
    else:
        df['Stoch_K'] = 50.0
        df['Stoch_D'] = 50.0

    # Price momentum: % return over 5 and 10 periods
    df['Momentum_5']  = df['Close'].pct_change(periods=5).replace([np.inf, -np.inf], 0)
    df['Momentum_10'] = df['Close'].pct_change(periods=10).replace([np.inf, -np.inf], 0)

    # 1-period price change (used as a base feature)
    df['Price_Change_Pct'] = df['Close'].pct_change().replace([np.inf, -np.inf], 0)

    # ── Volatility Indicators ──────────────────────────────────────────────

    # Bollinger Bands — manual with min_periods=1
    _bb_mean = df['Close'].rolling(window=bb_w, min_periods=1).mean()
    _bb_std  = df['Close'].rolling(window=bb_w, min_periods=1).std().fillna(0)
    df['BB_High']  = _bb_mean + 2 * _bb_std
    df['BB_Low']   = _bb_mean - 2 * _bb_std
    df['BB_Width'] = (df['BB_High'] - df['BB_Low']) / df['Close'].replace(0, np.nan)
    # BB %B — where price sits within the band (0 = lower band, 1 = upper band)
    bb_range = (df['BB_High'] - df['BB_Low']).replace(0, np.nan)
    df['BB_pct_B'] = (df['Close'] - df['BB_Low']) / bb_range

    # ATR — Average True Range (key volatility/stop-loss measure)
    if has_high and has_low:
        tr = pd.DataFrame({
            'hl':  df['High'] - df['Low'],
            'hpc': (df['High'] - df['Close'].shift(1)).abs(),
            'lpc': (df['Low']  - df['Close'].shift(1)).abs(),
        }).max(axis=1)
        df['ATR']       = tr.rolling(window=atr_w, min_periods=1).mean()
        df['ATR_Ratio'] = df['ATR'] / df['Close'].replace(0, np.nan)  # normalized ATR
    else:
        df['ATR']       = 0.0
        df['ATR_Ratio'] = 0.0

    # 20-period volatility (rolling std of daily returns)
    df['Volatility'] = df['Close'].pct_change().rolling(window=roll_w, min_periods=2).std()

    # ── Volume Indicators ──────────────────────────────────────────────────

    if has_volume:
        # OBV — On Balance Volume: cumulative volume following price direction
        obv_obj   = OnBalanceVolumeIndicator(close=df['Close'], volume=df['Volume'])
        raw_obv   = obv_obj.on_balance_volume()
        obv_sma   = raw_obv.rolling(window=roll_w, min_periods=1).mean()
        # OBV normalized: how far OBV is from its rolling mean (positive = accumulation)
        df['OBV_Ratio']     = (raw_obv / obv_sma.replace(0, np.nan)).fillna(1.0)
        df['Volume_Change'] = df['Volume'].pct_change().replace([np.inf, -np.inf], 0)
        # Volume vs its 20-period average (>1 means above-average volume)
        vol_ma = df['Volume'].rolling(window=roll_w, min_periods=1).mean()
        df['Volume_Ratio'] = df['Volume'] / vol_ma.replace(0, np.nan)
    else:
        df['OBV_Ratio']    = 1.0
        df['Volume_Change'] = 0.0
        df['Volume_Ratio'] = 1.0

    # ── Price Action Features ──────────────────────────────────────────────

    # Candle body, upper/lower shadows (pattern recognition)
    if has_open:
        df['Candle_Body']   = (df['Close'] - df['Open']) / df['Close']
        body_top = df[['Close', 'Open']].max(axis=1)
        body_bot = df[['Close', 'Open']].min(axis=1)
        if has_high:
            df['Upper_Shadow'] = (df['High'] - body_top) / df['Close']
        else:
            df['Upper_Shadow'] = 0.0
        if has_low:
            df['Lower_Shadow'] = (body_bot - df['Low']) / df['Close']
        else:
            df['Lower_Shadow'] = 0.0
    else:
        df['Candle_Body']   = 0.0
        df['Upper_Shadow']  = 0.0
        df['Lower_Shadow']  = 0.0

    # Support / Resistance — min_periods=1 so every row has a valid level
    if has_high and has_low:
        df['Support']    = df['Low'].rolling(window=roll_w,  min_periods=1).min()
        df['Resistance'] = df['High'].rolling(window=roll_w, min_periods=1).max()
    else:
        df['Support']    = df['Close']
        df['Resistance'] = df['Close']

    # 52-week high/low position — where is price relative to yearly range?
    high_52w = df['Close'].rolling(window=w52, min_periods=1).max()
    low_52w  = df['Close'].rolling(window=w52, min_periods=1).min()
    range_52w = (high_52w - low_52w).replace(0, np.nan)
    df['High52W_Ratio'] = df['Close'] / high_52w.replace(0, np.nan)  # 1.0 = at 52w high
    df['Low52W_Ratio']  = df['Close'] / low_52w.replace(0, np.nan)   # high = far above 52w low
    df['Range52W_Pct']  = (df['Close'] - low_52w) / range_52w        # 0=52w low, 1=52w high

    # ── Composite / Signal Features ───────────────────────────────────────

    # MACD crossover: 1 = histogram positive (bullish momentum)
    df['MACD_Cross']  = (df['MACD_diff'] > 0).astype(int)

    # Price vs key MAs
    df['Above_MA50']  = (df['Close'] > df['MA_50']).astype(int)
    df['Above_MA200'] = (df['Close'] > df['MA_200']).astype(int)

    # Price normalized to MA50 (trend position)
    df['Close_Normalized'] = df['Close'] / df['MA_50'].replace(0, np.nan)

    # Distance from support/resistance (normalized)
    df['Dist_Support']    = (df['Close'] - df['Support'])    / df['Close'].replace(0, np.nan)
    df['Dist_Resistance'] = (df['Resistance'] - df['Close']) / df['Close'].replace(0, np.nan)

    # ── Institutional Signals ──────────────────────────────────────────────
    
    # Golden Cross (MA50 crosses above MA200)
    df['Golden_Cross'] = ((df['MA_50'] > df['MA_200']) & (df['MA_50'].shift(1) <= df['MA_200'].shift(1))).astype(int)
    # Death Cross (MA50 crosses below MA200)
    df['Death_Cross']  = ((df['MA_50'] < df['MA_200']) & (df['MA_50'].shift(1) >= df['MA_200'].shift(1))).astype(int)

    # ── Clean up and Finalize ─────────────────────────────────────────────
    
    # Forward fill to handle any mid-day calculation gaps
    df.ffill(inplace=True)
    
    # Smart Data Cleaning:
    # We drop the very first 20 rows because almost all indicators (RSI, EMA, BB) 
    # need at least 14-20 rows to "warm up" and provide accurate math.
    if len(df) > 30:
        df = df.iloc[20:].copy()
    
    # Any remaining NaNs (from extremely long MAs like 200) are filled with 0 
    # to keep the AI model from crashing.
    df.fillna(0, inplace=True)
    df.reset_index(drop=True, inplace=True)

    # ── Hard scalar enforcement ────────────────────────────────────────────
    # Cast every numeric column to plain float64 to prevent inhomogeneous
    # numpy arrays when TA libraries return 0-d arrays on tiny datasets.
    _date_cols = {c for c in df.columns if c.lower() in ('date', 'time', 'timestamp')}
    for col in df.columns:
        if col in _date_cols:
            continue
        try:
            df[col] = df[col].map(
                lambda v: float(np.asarray(v, dtype=float).flat[0])
                          if isinstance(v, (np.ndarray, list, pd.Series))
                          else float(v) if pd.notna(v) else 0.0
            ).astype(np.float64)
        except Exception:
            df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0.0)

    return df
