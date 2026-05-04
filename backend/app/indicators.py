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
       - Trend:     EMA9, EMA21, HMA14, MA50, MA200, MACD, ADX, Aroon
       - Momentum:  RSI, Stochastic %K/%D, 5/10-day momentum, Efficiency Ratio
       - Volatility: Bollinger Bands, ATR, Z-Score, Donchian Channels
       - Volume:    OBV, MFI, Volume Change
       - Price action: Candle Body/Shadows, Pivot Points, 52-week position
       - Advanced:   Fisher Transform, RSI Divergence, Trend Acceleration
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

    # Hull Moving Average (HMA) — Less lag than EMA, very responsive
    # Formula: WMA(2*WMA(n/2) - WMA(n), sqrt(n))
    def _wma(series, window):
        weights = np.arange(1, window + 1)
        return series.rolling(window).apply(lambda x: np.dot(x, weights) / weights.sum(), raw=True)

    hma_w = 14
    half_w = hma_w // 2
    sqrt_w = int(np.sqrt(hma_w))
    _raw_hma = 2 * _wma(df['Close'], half_w) - _wma(df['Close'], hma_w)
    df['HMA_14'] = _wma(_raw_hma, sqrt_w)
    df['HMA_Trend'] = (df['Close'] > df['HMA_14'].fillna(df['Close'])).astype(int)

    # Moving Averages — min_periods=1: expanding window until full data available,
    # avoiding the 0-fill that made Above_MA200 trivially true for early rows.
    df['MA_50']  = df['Close'].rolling(window=ma50_w,  min_periods=1).mean()
    df['MA_200'] = df['Close'].rolling(window=ma200_w, min_periods=1).mean()

    # MACD
    try:
        macd_obj      = MACD(close=df['Close'], window_fast=macd_f, window_slow=macd_s, window_sign=macd_sig)
        df['MACD']        = macd_obj.macd()
        df['MACD_signal'] = macd_obj.macd_signal()
        df['MACD_diff']   = macd_obj.macd_diff()
    except Exception:
        df['MACD']        = 0.0
        df['MACD_signal'] = 0.0
        df['MACD_diff']   = 0.0

    # ADX — trend strength 0-100 (>25 = trending, <20 = ranging)
    if has_high and has_low:
        try:
            adx_obj     = ADXIndicator(high=df['High'], low=df['Low'], close=df['Close'], window=adx_w)
            df['ADX']       = adx_obj.adx()
            df['ADX_pos']   = adx_obj.adx_pos()   # +DI (bullish directional)
            df['ADX_neg']   = adx_obj.adx_neg()   # -DI (bearish directional)
        except Exception:
            df['ADX']     = 25.0
            df['ADX_pos'] = 0.0
            df['ADX_neg'] = 0.0
    else:
        df['ADX']     = 25.0
        df['ADX_pos'] = 0.0
        df['ADX_neg'] = 0.0

    # Aroon Indicator — detects trend age and strength
    if has_high and has_low:
        ar_w = 25
        df['Aroon_Up'] = df['High'].rolling(window=ar_w + 1).apply(lambda x: float(np.argmax(x[::-1]) / ar_w * 100), raw=True)
        df['Aroon_Dn'] = df['Low'].rolling(window=ar_w + 1).apply(lambda x: float(np.argmin(x[::-1]) / ar_w * 100), raw=True)
        df['Aroon_Osc'] = df['Aroon_Up'] - df['Aroon_Dn']
    else:
        df['Aroon_Osc'] = 0.0

    # ── Momentum Indicators ────────────────────────────────────────────────

    # RSI
    try:
        df['RSI'] = RSIIndicator(close=df['Close'], window=rsi_w).rsi()
        df['RSI_Change'] = df['RSI'].diff()
    except Exception:
        df['RSI'] = 50.0
        df['RSI_Change'] = 0.0

    # Stochastic %K and %D — overbought/oversold with smoother signal
    if has_high and has_low:
        try:
            stoch_obj   = StochasticOscillator(
                high=df['High'], low=df['Low'], close=df['Close'],
                window=stoch_w, smooth_window=stoch_s
            )
            df['Stoch_K'] = stoch_obj.stoch()
            df['Stoch_D'] = stoch_obj.stoch_signal()
        except Exception:
            df['Stoch_K'] = 50.0
            df['Stoch_D'] = 50.0
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

    # Z-Score — Statistical overextension (Mean Reversion)
    # > 2.0 = Extremely Overbought, < -2.0 = Extremely Oversold
    df['Z_Score'] = (df['Close'] - _bb_mean) / _bb_std.replace(0, np.nan)

    # Donchian Channels — Breakout detection (Turtle Trading)
    if has_high and has_low:
        df['Donchian_High'] = df['High'].rolling(window=20).max()
        df['Donchian_Low']  = df['Low'].rolling(window=20).min()
        df['Donchian_Mid']  = (df['Donchian_High'] + df['Donchian_Low']) / 2
        df['Donchian_Width'] = (df['Donchian_High'] - df['Donchian_Low']) / df['Close'].replace(0, np.nan)
    else:
        df['Donchian_Width'] = 0.0

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
        
        # MFI - Money Flow Index (Volume-weighted RSI)
        # Professional standard for detecting overbought/oversold with volume
        if has_high and has_low:
            typical_price = (df['High'] + df['Low'] + df['Close']) / 3
            money_flow = typical_price * df['Volume']
            positive_flow = (money_flow.where(typical_price > typical_price.shift(1), 0)).rolling(14).sum()
            negative_flow = (money_flow.where(typical_price < typical_price.shift(1), 0)).rolling(14).sum()
            mfr = positive_flow / negative_flow.replace(0, np.nan)
            df['MFI'] = 100 - (100 / (1 + mfr.fillna(0)))
        else:
            df['MFI'] = 50.0
    else:
        df['OBV_Ratio']     = 1.0
        df['Volume_Change'] = 0.0
        df['Volume_Ratio']  = 1.0
        df['MFI']           = 50.0

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

    # ── Advanced Features ──────────────────────────────────────────────────

    # Williams %R — overbought/oversold (complements RSI + Stoch)
    # Range: -100 to 0. Above -20 = overbought; below -80 = oversold.
    if has_high and has_low:
        hh = df['High'].rolling(window=stoch_w, min_periods=1).max()
        ll = df['Low'].rolling(window=stoch_w,  min_periods=1).min()
        hl_range = (hh - ll).replace(0, np.nan)
        df['Williams_R'] = ((hh - df['Close']) / hl_range * -100).fillna(-50)
    else:
        df['Williams_R'] = -50.0

    # CMF — Chaikin Money Flow: net institutional buying/selling pressure (20-period)
    # Positive = accumulation (smart money buying); Negative = distribution
    if has_high and has_low and has_volume:
        mfm = ((df['Close'] - df['Low']) - (df['High'] - df['Close'])) / \
              (df['High'] - df['Low']).replace(0, np.nan)
        mfv = mfm * df['Volume']
        vol_sum = df['Volume'].rolling(window=roll_w, min_periods=1).sum().replace(0, np.nan)
        df['CMF'] = mfv.rolling(window=roll_w, min_periods=1).sum() / vol_sum
        df['CMF'] = df['CMF'].fillna(0)
    else:
        df['CMF'] = 0.0

    # Rate of Change — short (3d) and medium (6d) momentum
    df['ROC_3'] = df['Close'].pct_change(periods=3).replace([np.inf, -np.inf], 0).fillna(0)
    df['ROC_6'] = df['Close'].pct_change(periods=6).replace([np.inf, -np.inf], 0).fillna(0)

    # Kaufman Efficiency Ratio (ER) — Noise vs Trend
    # 1.0 = Clean efficient trend; 0.0 = Noisy/Choppy sideways
    change = (df['Close'] - df['Close'].shift(10)).abs()
    volatility_sum = (df['Close'] - df['Close'].shift(1)).abs().rolling(window=10).sum()
    df['Efficiency_Ratio'] = (change / volatility_sum.replace(0, np.nan)).fillna(0.5)

    # Fisher Transform — Normalizes price action for machine learning
    # Highlights price extremes and trend reversals with high precision
    med = (df['High'] + df['Low']) / 2 if (has_high and has_low) else df['Close']
    low_n  = med.rolling(window=10).min()
    high_n = med.rolling(window=10).max()
    value  = 0.33 * 2 * ((med - low_n) / (high_n - low_n).replace(0, np.nan) - 0.5) + 0.67 * 0.5 # Dummy init
    # Simplified Fisher (avoiding complex recursive loop in pandas for speed)
    df['Fisher'] = 0.5 * np.log((1 + value) / (1 - value).replace(0, np.nan)).fillna(0)

    # Consecutive Up / Down days — measures trend persistence
    # e.g., 3 consecutive up days → momentum continuation signal
    daily_direction = np.sign(df['Close'].diff().fillna(0))
    consec_up   = [0] * len(df)
    consec_down = [0] * len(df)
    for i in range(1, len(df)):
        if daily_direction.iloc[i] > 0:
            consec_up[i]   = consec_up[i-1] + 1
            consec_down[i] = 0
        elif daily_direction.iloc[i] < 0:
            consec_down[i] = consec_down[i-1] + 1
            consec_up[i]   = 0
        else:
            consec_up[i]   = consec_up[i-1]
            consec_down[i] = consec_down[i-1]
    df['Consec_Up']   = consec_up
    df['Consec_Down'] = consec_down

    # RSI Slope — momentum of momentum: is RSI accelerating or decelerating?
    df['RSI_Slope'] = df['RSI'].diff(3).fillna(0)

    # BB Squeeze — True when BB is tightest in the last 20 days (pre-breakout signal)
    bb_width_min = df['BB_Width'].rolling(window=roll_w, min_periods=1).min()
    df['BB_Squeeze'] = (df['BB_Width'] <= bb_width_min * 1.1).astype(int)

    # Rolling VWAP ratio — price vs volume-weighted average price (20-period)
    # > 1.0 = price above VWAP (bullish); < 1.0 = below VWAP (bearish)
    if has_volume:
        typical = (df['High'] + df['Low'] + df['Close']) / 3 if (has_high and has_low) else df['Close']
        tpv = typical * df['Volume']
        vwap = tpv.rolling(window=roll_w, min_periods=1).sum() / \
               df['Volume'].rolling(window=roll_w, min_periods=1).sum().replace(0, np.nan)
        df['VWAP_Ratio'] = (df['Close'] / vwap.replace(0, np.nan)).fillna(1.0)
    else:
        df['VWAP_Ratio'] = 1.0

    # Volume surge — volume spike above 2× average (institutional activity)
    if has_volume:
        df['Volume_Surge'] = (df['Volume_Ratio'] > 2.0).astype(int)
    else:
        df['Volume_Surge'] = 0

    # ── Professional Institutional Features ────────────────────────────────
    
    # 1. Seasonality (Professional quant models use time-cycles)
    if 'Date' in df.columns:
        dt = pd.to_datetime(df['Date'])
        df['DayOfWeek'] = dt.dt.dayofweek / 6.0  # Normalized 0-1
        df['Month']     = (dt.dt.month - 1) / 11.0 # Normalized 0-1
    else:
        df['DayOfWeek'] = 0.5
        df['Month']     = 0.5

    # 2. RSI Divergence Approximation
    # Is price making a new high while RSI is not?
    price_high_20 = df['Close'] >= df['Close'].rolling(20).max()
    rsi_high_20   = df['RSI']   >= df['RSI'].rolling(20).max()
    df['RSI_Bear_Div'] = (price_high_20 & ~rsi_high_20).astype(int)
    
    price_low_20 = df['Close'] <= df['Close'].rolling(20).min()
    rsi_low_20   = df['RSI']   <= df['RSI'].rolling(20).min()
    df['RSI_Bull_Div'] = (price_low_20 & ~rsi_low_20).astype(int)

    # 3. Trend Acceleration (Curvature)
    df['Trend_Accel'] = df['EMA_9'].diff().diff().fillna(0)

    # 4. Keltner Channels (Better than BB in strong trends)
    if has_high and has_low:
        df['KC_Middle'] = EMAIndicator(close=df['Close'], window=20).ema_indicator()
        df['KC_Upper']  = df['KC_Middle'] + (2 * df['ATR'])
        df['KC_Lower']  = df['KC_Middle'] - (2 * df['ATR'])
        df['KC_pct_K']  = (df['Close'] - df['KC_Lower']) / (df['KC_Upper'] - df['KC_Lower']).replace(0, np.nan)
    else:
        df['KC_pct_K']  = 0.5

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
