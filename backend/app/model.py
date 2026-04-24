import warnings
import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestClassifier, VotingClassifier
from sklearn.preprocessing import LabelEncoder, StandardScaler
from sklearn.metrics import classification_report, accuracy_score
from sklearn.utils.class_weight import compute_sample_weight
import joblib
import os
import xgboost as xgb
import lightgbm as lgb

# LightGBM is fitted via VotingClassifier which passes numpy arrays without
# column names. This is harmless — suppress the sklearn compatibility warning.
warnings.filterwarnings(
    'ignore',
    message='X does not have valid feature names',
    category=UserWarning,
)

MODEL_PATH = "model_xgb.pkl"


def _safe_float_array(df_or_series) -> np.ndarray:
    """
    Convert a DataFrame (or Series) to a float64 numpy array, safely extracting
    the first scalar from any cell that is a numpy array / list / Series.
    """
    if isinstance(df_or_series, pd.Series):
        df_or_series = df_or_series.to_frame().T
    n, m = len(df_or_series), len(df_or_series.columns)
    out = np.zeros((n, m), dtype=np.float64)
    for j, col in enumerate(df_or_series.columns):
        for i, v in enumerate(df_or_series[col].values):
            try:
                flat = np.asarray(v, dtype=float).flat
                out[i, j] = next(flat, 0.0)
            except Exception:
                out[i, j] = 0.0
    return out


# ── Feature set (original 11 + 7 engineered + 14 advanced = 32 total) ─────────
FEATURES = [
    # ── Trend ────────────────────────────────────────────────────────────────
    'MACD', 'MACD_signal', 'MACD_diff', 'MACD_Cross',
    'MA_50', 'MA_200', 'EMA_9', 'EMA_21', 'EMA_Cross',
    'Above_MA50', 'Above_MA200', 'Close_Normalized',
    # ── Momentum ─────────────────────────────────────────────────────────────
    'RSI', 'RSI_Change',
    'Stoch_K', 'Stoch_D',
    'Momentum_5', 'Momentum_10', 'Price_Change_Pct',
    # ── Volatility ───────────────────────────────────────────────────────────
    'BB_High', 'BB_Low', 'BB_Width', 'BB_pct_B',
    'ATR', 'ATR_Ratio', 'Volatility',
    # ── Volume ───────────────────────────────────────────────────────────────
    'OBV_Ratio', 'Volume_Change', 'Volume_Ratio',
    # ── Price Action ─────────────────────────────────────────────────────────
    'Support', 'Resistance', 'Dist_Support', 'Dist_Resistance',
    'Candle_Body', 'Upper_Shadow', 'Lower_Shadow',
    # ── Market Structure ─────────────────────────────────────────────────────
    'ADX', 'ADX_pos', 'ADX_neg',
    'High52W_Ratio', 'Low52W_Ratio', 'Range52W_Pct',
]


def assign_labels(df: pd.DataFrame):
    """
    Dynamic volatility-based labeling using 5-period forward return.
      Return > +1σ  → BUY  (2)
      Return < -1σ  → SELL (0)
      Otherwise     → HOLD (1)
    Threshold is floored at 0.5% to avoid labelling noise as signals.
    """
    df = df.copy()
    df['Close'] = df['Close'].replace(0, np.nan)
    df = df.dropna(subset=['Close'])

    if len(df) < 10:
        raise ValueError(
            f"Not enough valid rows: only {len(df)} rows. "
            f"Need at least 20 rows of real OHLCV data."
        )

    df['Future_Close'] = df['Close'].shift(-5)
    df['Return']       = (df['Future_Close'] - df['Close']) / df['Close']

    threshold = df['Return'].std()
    if np.isnan(threshold) or threshold == 0:
        threshold = 0.005
    threshold = max(threshold, 0.005)

    conditions = [df['Return'] > threshold, df['Return'] < -threshold]
    choices    = [2, 0]
    df['Target'] = np.select(conditions, choices, default=1)
    df.dropna(subset=['Future_Close', 'Return'], inplace=True)
    return df, threshold


def train_or_load_model(df: pd.DataFrame) -> dict:
    """
    Trains a 3-model soft-voting ensemble (XGBoost + LightGBM + RandomForest) with:
      - Warmup-row exclusion (first 26 bars have incomplete RSI/MACD — skip them)
      - Dynamic volatility-based label thresholding
      - Class-imbalance correction via sample weights
      - StandardScaler feature normalization
    Returns (metrics_dict, artifacts_dict).
    """
    # ── Skip MACD warmup rows — first 26 bars have NaN RSI/MACD filled to 0.
    # Training on those corrupts the model with meaningless patterns.
    WARMUP = 26
    if len(df) > WARMUP * 2:
        df = df.iloc[WARMUP:].reset_index(drop=True)

    df, threshold = assign_labels(df)

    # Ensure every feature column exists (fills missing with 0)
    for f in FEATURES:
        if f not in df.columns:
            df[f] = 0.0

    X = _safe_float_array(df[FEATURES])
    y = df['Target'].values

    if len(X) < 10:
        raise ValueError(
            f"Not enough data after labeling: {len(X)} rows. "
            f"Upload a file with at least 20 rows of valid OHLCV data."
        )

    # ── Chronological train / test split (no shuffle — avoids look-ahead) ──
    test_size = 0.2 if len(X) > 50 else 0.3
    split     = int(len(X) * (1 - test_size))
    X_train, X_test = X[:split], X[split:]
    y_train, y_test = y[:split], y[split:]

    # ── Guarantee all 3 classes in training set ──────────────────────────
    missing_classes = set([0, 1, 2]) - set(np.unique(y_train))
    for mc in missing_classes:
        X_train = np.vstack([X_train, np.zeros(X_train.shape[1])])
        y_train = np.append(y_train, mc)

    # ── Label encoding (maps {0,1,2} → {0,1,2} — identity but ensures
    # consistent class ordering across all three classifiers) ────────────
    le = LabelEncoder()
    le.fit(y_train)
    y_train_enc = le.transform(y_train)

    known_mask  = np.isin(y_test, le.classes_)
    X_test      = X_test[known_mask]
    y_test      = y_test[known_mask]
    y_test_enc  = le.transform(y_test) if len(y_test) > 0 else np.array([])

    # ── Feature scaling ───────────────────────────────────────────────────
    scaler         = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled  = scaler.transform(X_test)

    # ── Class imbalance correction ─────────────────────────────────────────
    sample_weights = compute_sample_weight(class_weight='balanced', y=y_train_enc)

    # ── XGBoost ───────────────────────────────────────────────────────────
    xgb_model = xgb.XGBClassifier(
        n_estimators=400,
        max_depth=5,
        learning_rate=0.04,
        subsample=0.8,
        colsample_bytree=0.8,
        min_child_weight=3,
        gamma=0.1,
        reg_alpha=0.05,
        reg_lambda=1.0,
        random_state=42,
        eval_metric='mlogloss',
        verbosity=0,
    )

    # ── LightGBM ──────────────────────────────────────────────────────────
    lgb_model = lgb.LGBMClassifier(
        n_estimators=400,
        max_depth=5,
        learning_rate=0.04,
        subsample=0.8,
        colsample_bytree=0.8,
        min_child_samples=5,
        reg_alpha=0.05,
        reg_lambda=1.0,
        # class_weight omitted: sample_weights passed at fit() already handle
        # class imbalance — setting both doubles the correction and over-weights
        # rare classes, making the model too aggressive with BUY/SELL signals.
        random_state=42,
        verbosity=-1,
        force_row_wise=True,
    )

    # ── Random Forest ──────────────────────────────────────────────────────
    rf_model = RandomForestClassifier(
        n_estimators=300,
        max_depth=8,
        min_samples_split=5,
        min_samples_leaf=2,
        max_features='sqrt',
        # class_weight omitted: same reason as LightGBM above.
        random_state=42,
        n_jobs=-1,
    )

    # ── 3-model soft-voting ensemble ──────────────────────────────────────
    # XGB: 40%, LGB: 35%, RF: 25% — both gradient boosters outperform RF on
    # tabular data; LGB is slightly faster and handles categoricals better.
    ensemble = VotingClassifier(
        estimators=[('xgb', xgb_model), ('lgb', lgb_model), ('rf', rf_model)],
        voting='soft',
        weights=[4, 3.5, 2.5],
    )

    ensemble.fit(X_train_scaled, y_train_enc, sample_weight=sample_weights)

    # ── Evaluate on held-out test set ─────────────────────────────────────
    if len(X_test_scaled) > 0:
        y_pred = ensemble.predict(X_test_scaled)
        acc    = accuracy_score(y_test_enc, y_pred)
        if np.isnan(acc):
            acc = 0.0
        present_labels = list(range(len(le.classes_)))
        report = classification_report(
            y_test_enc, y_pred,
            labels=present_labels,
            target_names=[str(c) for c in le.classes_],
            output_dict=True,
            zero_division=0,
        )
    else:
        acc    = 0.0
        report = {str(c): {'precision': 0, 'recall': 0, 'f1-score': 0, 'support': 0} for c in le.classes_}

    label_map = {str(c): {0: 'SELL', 1: 'HOLD', 2: 'BUY'}.get(c, str(c)) for c in le.classes_}
    metrics = {
        'accuracy':       round(acc * 100, 2),
        'threshold_used': round(threshold * 100, 3),
        'per_class': {
            label_map[k]: {
                'precision': round(v['precision'] * 100, 1),
                'recall':    round(v['recall']    * 100, 1),
                'f1':        round(v['f1-score']  * 100, 1),
                'support':   int(v['support']),
            }
            for k, v in report.items() if k in label_map
        },
    }

    artifacts = {
        'model':          ensemble,
        'encoder':        le,
        'scaler':         scaler,
        'features':       FEATURES,
        'test_start_idx': len(X_train),
        'metrics':        metrics,
    }
    joblib.dump(artifacts, MODEL_PATH)
    return metrics, artifacts


def predict_all_signals(df: pd.DataFrame, artifacts: dict) -> list:
    """Predict BUY/SELL/HOLD for every row. Returns a list of signal strings."""
    model    = artifacts['model']
    le       = artifacts['encoder']
    scaler   = artifacts['scaler']
    features = artifacts.get('features', FEATURES)

    for f in features:
        if f not in df.columns:
            df[f] = 0.0

    try:
        X         = _safe_float_array(df[features])
        X_scaled  = scaler.transform(X)
        X_scaled  = np.nan_to_num(X_scaled, nan=0.0, posinf=0.0, neginf=0.0)
        enc_preds = model.predict(X_scaled)
        preds     = le.inverse_transform(enc_preds)
        sig_map   = {0: 'SELL', 1: 'HOLD', 2: 'BUY'}
        return [sig_map.get(int(p), 'HOLD') for p in preds]
    except Exception:
        return ['HOLD'] * len(df)


def predict_latest(df: pd.DataFrame, artifacts: dict = None):
    """
    Predicts the BUY/SELL/HOLD signal for the most recent row.
    Accepts freshly trained artifacts directly (avoids stale disk model).
    Falls back to disk, retraining if the saved format is outdated.
    Returns (prediction, confidence_pct, backtest_stats, model_metrics, all_proba, all_signals).
    """
    if artifacts is None:
        if not os.path.exists(MODEL_PATH):
            _, artifacts = train_or_load_model(df)
        else:
            artifacts = joblib.load(MODEL_PATH)
            if 'scaler' not in artifacts:
                _, artifacts = train_or_load_model(df)

    model    = artifacts['model']
    le       = artifacts['encoder']
    scaler   = artifacts['scaler']
    features = artifacts.get('features', FEATURES)
    metrics  = artifacts.get('metrics', {})

    for f in features:
        if f not in df.columns:
            df[f] = 0.0

    raw           = _safe_float_array(df.iloc[-1:][features])
    latest_scaled = scaler.transform(raw)
    latest_scaled = np.nan_to_num(latest_scaled, nan=0.0, posinf=0.0, neginf=0.0)

    proba = model.predict_proba(latest_scaled)[0]
    if np.any(np.isnan(proba)):
        proba = np.ones(len(proba)) / len(proba)

    pred_enc_idx = int(np.argmax(proba))
    confidence   = round(float(proba[pred_enc_idx] * 100), 2)
    pred_class   = le.inverse_transform([pred_enc_idx])[0]
    prediction   = {0: 'SELL', 1: 'HOLD', 2: 'BUY'}.get(pred_class, 'HOLD')

    all_proba = {'BUY': 0.0, 'HOLD': 0.0, 'SELL': 0.0}
    for i, cls in enumerate(le.classes_):
        label = {0: 'SELL', 1: 'HOLD', 2: 'BUY'}.get(cls, str(cls))
        all_proba[label] = round(float(proba[i]) * 100, 1)

    test_start  = artifacts.get('test_start_idx', int(len(df) * 0.8))
    # test_start_idx was computed on the warmup-skipped df (rows 26+).
    # Applying it to the full df without offset causes training rows to appear
    # in the backtest — look-ahead bias inflating every backtest metric.
    # Offset by WARMUP so the backtest only sees true out-of-sample rows.
    WARMUP      = 26
    actual_start = (WARMUP + test_start) if len(df) > WARMUP * 2 else test_start
    actual_start = min(actual_start, max(0, len(df) - 10))
    test_df     = df.iloc[actual_start:].copy()
    backtest    = run_backtest(model, le, scaler, features, test_df)
    all_signals = predict_all_signals(df, artifacts)

    return prediction, confidence, backtest, metrics, all_proba, all_signals


def run_backtest(model, encoder, scaler, features: list, df: pd.DataFrame) -> dict:
    """
    Simulates trading on the held-out test set.
    - NEPSE transaction costs: 0.4% per side (0.8% round-trip)
    - Starting capital: Rs. 100,000
    - Reports: return %, win rate, max drawdown, Sharpe, Calmar, Profit Factor,
               total trades, commission paid.
    """
    COMMISSION = 0.004
    INITIAL    = 100_000.0

    if len(df) < 10:
        return None

    for f in features:
        if f not in df.columns:
            df[f] = 0.0

    try:
        X     = scaler.transform(_safe_float_array(df[features]))
        X     = np.nan_to_num(X, nan=0.0, posinf=0.0, neginf=0.0)
        preds = encoder.inverse_transform(model.predict(X))
    except Exception:
        return None

    closes           = df['Close'].values
    capital          = INITIAL
    shares           = 0.0
    entry_price      = 0.0
    entry_capital    = 0.0   # capital spent to open position (before buy commission)
    trades_won       = 0
    trades_total     = 0
    peak_capital     = INITIAL
    max_drawdown     = 0.0
    equity_curve     = [INITIAL]
    total_commission = 0.0
    gross_profit     = 0.0
    gross_loss       = 0.0

    for i, signal in enumerate(preds):
        price = closes[i]

        if signal == 2 and shares == 0:          # BUY
            entry_capital     = capital           # record full capital before commission
            cost              = capital * COMMISSION
            total_commission += cost
            capital          -= cost
            shares            = capital / price
            capital           = 0.0
            entry_price       = price

        elif signal == 0 and shares > 0:         # SELL
            gross             = shares * price
            cost              = gross * COMMISSION
            total_commission += cost
            capital           = gross - cost
            # PnL = net sell proceeds minus original capital committed to buy.
            # Using (shares * entry_price) was wrong: it excluded the buy-side
            # commission, making every trade appear ~0.4% more profitable.
            pnl               = capital - entry_capital
            if pnl > 0:
                gross_profit += pnl
                trades_won   += 1
            else:
                gross_loss   += abs(pnl)
            shares        = 0.0
            trades_total += 1

        current_equity = capital + shares * price
        equity_curve.append(round(current_equity, 2))
        if current_equity > peak_capital:
            peak_capital = current_equity
        dd = (peak_capital - current_equity) / peak_capital * 100
        if dd > max_drawdown:
            max_drawdown = dd

    # Liquidate remaining position at last price
    if shares > 0:
        gross             = shares * closes[-1]
        cost              = gross * COMMISSION
        total_commission += cost
        capital           = gross - cost
        pnl               = capital - entry_capital
        if pnl > 0:
            gross_profit += pnl
            trades_won   += 1
        else:
            gross_loss   += abs(pnl)
        trades_total += 1

    win_rate   = (trades_won / trades_total * 100) if trades_total > 0 else 0.0
    return_pct = ((capital - INITIAL) / INITIAL) * 100

    # Sharpe ratio (annualized, daily data assumed)
    if len(equity_curve) > 2:
        eq            = np.array(equity_curve)
        daily_returns = np.diff(eq) / eq[:-1]
        sharpe        = (daily_returns.mean() / (daily_returns.std() + 1e-9)) * np.sqrt(252)
    else:
        sharpe = 0.0

    # Calmar ratio: annualized return / max drawdown (higher = better risk-adj.)
    calmar = (return_pct / max_drawdown) if max_drawdown > 0 else 0.0

    # Profit Factor: gross profit / gross loss (>1 = profitable overall)
    profit_factor = (gross_profit / gross_loss) if gross_loss > 0 else (float('inf') if gross_profit > 0 else 0.0)
    if profit_factor == float('inf'):
        profit_factor = 99.0  # cap for JSON serialization

    return {
        'initial_capital': INITIAL,
        'final_capital':   round(capital, 2),
        'return_pct':      round(return_pct, 2),
        'win_rate':        round(win_rate, 2),
        'total_trades':    trades_total,
        'max_drawdown':    round(max_drawdown, 2),
        'sharpe_ratio':    round(float(sharpe), 2),
        'calmar_ratio':    round(float(calmar), 2),
        'profit_factor':   round(float(profit_factor), 2),
        'commission_paid': round(total_commission, 2),
        'equity_curve':    equity_curve,  # real trade-by-trade equity for chart
    }
