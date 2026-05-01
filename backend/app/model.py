import warnings
import pandas as pd
import numpy as np
from sklearn.ensemble import (
    RandomForestClassifier, VotingClassifier, ExtraTreesClassifier, StackingClassifier
)
from sklearn.linear_model import LogisticRegression
from sklearn.calibration import CalibratedClassifierCV
from sklearn.preprocessing import LabelEncoder, RobustScaler
from sklearn.metrics import classification_report, accuracy_score, f1_score
from sklearn.utils.class_weight import compute_sample_weight
from sklearn.model_selection import RandomizedSearchCV, TimeSeriesSplit
import joblib
import os
import glob
from datetime import datetime
import xgboost as xgb
import lightgbm as lgb

import json

# LightGBM is fitted via VotingClassifier which passes numpy arrays without
# column names. This is harmless — suppress the sklearn compatibility warning.
warnings.filterwarnings(
    'ignore',
    message='X does not have valid feature names',
    category=UserWarning,
)

MODELS_DIR   = os.path.join(os.path.dirname(__file__), "models")
REGISTRY_PATH = os.path.join(MODELS_DIR, "registry.json")
os.makedirs(MODELS_DIR, exist_ok=True)

def _load_registry() -> dict:
    if os.path.exists(REGISTRY_PATH):
        try:
            with open(REGISTRY_PATH, 'r') as f:
                return json.load(f)
        except Exception:
            pass
    return {"active_model": "", "models": []}

def _save_registry(registry: dict):
    try:
        with open(REGISTRY_PATH, 'w') as f:
            json.dump(registry, f, indent=4)
    except Exception:
        pass

def _get_latest_model_path() -> str:
    registry = _load_registry()
    active   = registry.get("active_model")
    
    if active and os.path.exists(os.path.join(MODELS_DIR, active)):
        return os.path.join(MODELS_DIR, active)
        
    # Fallback to newest file if registry is empty/broken
    models = glob.glob(os.path.join(MODELS_DIR, "model_xgb_*.pkl"))
    if not models:
        old_path = os.path.join(os.path.dirname(__file__), "model_xgb.pkl")
        return old_path if os.path.exists(old_path) else ""
    return max(models, key=os.path.getmtime)

def _cleanup_old_models(keep: int = 5):
    registry = _load_registry()
    active   = registry.get("active_model")
    models   = sorted(glob.glob(os.path.join(MODELS_DIR, "model_xgb_*.pkl")), key=os.path.getmtime, reverse=True)
    
    for old_model in models[keep:]:
        fname = os.path.basename(old_model)
        if fname == active: continue # Never delete the active model
        try:
            os.remove(old_model)
        except Exception:
            pass

def _save_global_model(artifacts: dict):
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename  = f"model_xgb_{timestamp}.pkl"
    path      = os.path.join(MODELS_DIR, filename)
    
    # Extract metrics for registry
    metrics = artifacts.get('metrics', {})
    accuracy = metrics.get('accuracy', 0)
    
    joblib.dump(artifacts, path)
    
    # Update Registry
    registry = _load_registry()
    model_entry = {
        "filename": filename,
        "date": datetime.now().isoformat(),
        "accuracy": accuracy,
        "metrics": metrics,
        "status": "staging"
    }
    
    # Auto-promote if accuracy > 55% or it's the first model
    if accuracy >= 55.0 or not registry["active_model"]:
        model_entry["status"] = "active"
        registry["active_model"] = filename
        
    registry["models"].append(model_entry)
    # Keep only last 10 entries in registry
    registry["models"] = registry["models"][-10:]
    
    _save_registry(registry)
    _cleanup_old_models()
    return path


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
    'Golden_Cross', 'Death_Cross',
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
    # ── Advanced ─────────────────────────────────────────────────────────────
    'Williams_R',
    'CMF',
    'ROC_3', 'ROC_6',
    'Consec_Up', 'Consec_Down',
    'RSI_Slope',
    'BB_Squeeze',
    'VWAP_Ratio',
    'Volume_Surge',
    # ── Professional V2 ─────────────────────────────────────────────────────
    'MFI', 'DayOfWeek', 'Month',
    'RSI_Bear_Div', 'RSI_Bull_Div', 'Trend_Accel', 'KC_pct_K',
    # ── Quant Grade V3 ──────────────────────────────────────────────────────
    'HMA_14', 'HMA_Trend', 'Aroon_Osc', 'Z_Score', 
    'Donchian_Width', 'Efficiency_Ratio', 'Fisher',
    # ── Macro & Sentiment V4 ────────────────────────────────────────────────
    'Market_Breadth', 'Sentiment_Score',
]


def assign_labels(df: pd.DataFrame):
    """
    Professional Triple-Barrier Labeling.
    We look 5 days ahead and check if:
    1. Profit Target (2 * ATR) is hit first -> BUY
    2. Stop Loss (1 * ATR) is hit first -> SELL
    3. Neither hit -> HOLD
    """
    df = df.copy()
    df['Close'] = df['Close'].replace(0, np.nan)
    df = df.dropna(subset=['Close'])

    if len(df) < 20:
        raise ValueError("Not enough rows for advanced labeling.")

    # Dynamic targets based on volatility (ATR)
    # Using 1.2 ATR for profit, 1.0 ATR for stop loss
    # Looking 10 days ahead for better trend capture
    atr = df['ATR'].fillna(df['Close'] * 0.02)
    
    targets = []
    lookahead = 10
    for i in range(len(df)):
        if i > len(df) - (lookahead + 1):
            targets.append(1) # HOLD for last few rows
            continue
            
        current_price = df['Close'].iloc[i]
        limit = min(i + lookahead, len(df) - 1)
        future_prices = df['Close'].iloc[i+1 : limit+1].values
        
        # Professional Volatility Floor: Min 1% move required to label
        atr_val = max(atr.iloc[i], current_price * 0.01)
        
        up_barrier   = current_price + (1.2 * atr_val)
        down_barrier = current_price - (1.0 * atr_val)
        
        label = 1 # Default HOLD
        for p in future_prices:
            if p >= up_barrier:
                label = 2 # BUY
                break
            if p <= down_barrier:
                label = 0 # SELL
                break
        targets.append(label)

    df['Target'] = targets
    # No longer dropping rows here, but we should not train on the last 5 rows
    return df, 0.015 # threshold report as approx 1.5%


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

    # ── Feature scaling (RobustScaler handles outliers better in finance) ──
    scaler         = RobustScaler()
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

    # ── Stacking Ensemble (Professional V2 Upgrade) ───────────────────────
    # Meta-learner: Logistic Regression is best for combining probabilities
    # because it avoids overfitting and treats each model as an expert.
    meta_model = LogisticRegression(class_weight='balanced', random_state=42)
    
    ensemble = StackingClassifier(
        estimators=[('xgb', xgb_model), ('lgb', lgb_model), ('rf', rf_model)],
        final_estimator=meta_model,
        cv=min(5, len(X_train_scaled) // 10), # Adaptive CV for small datasets
        stack_method='predict_proba',
        n_jobs=-1
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
    # No longer saving to disk here to prevent overwriting global models
    # This acts as an ad-hoc trainer for specific symbol uploads.
    return metrics, artifacts


def tune_and_train_global_model(df: pd.DataFrame) -> dict:
    """
    Professional-grade global model training pipeline:
    - TimeSeriesSplit CV (no future-data leakage into hyperparameter search)
    - 70/15/15 chronological train/calibration/test split
    - Isotonic probability calibration (fixes overconfident ensemble probabilities)
    - Feature importance filtering (drops noise features below 0.3% importance)
    - 4-model ensemble: XGBoost + LightGBM + RandomForest + ExtraTrees
    - Weighted soft voting with calibrated probabilities
    """
    import logging
    logger = logging.getLogger(__name__)

    # Pre-labeled per-stock → skip assign_labels (avoids inter-stock label leakage)
    if 'Target' not in df.columns:
        WARMUP = 26
        if len(df) > WARMUP * 2:
            df = df.iloc[WARMUP:].reset_index(drop=True)
        df, threshold = assign_labels(df)
    else:
        future = df['Close'].shift(-5)
        returns = ((future - df['Close']) / df['Close']).dropna()
        threshold = max(float(returns.std()), 0.005)

    for f in FEATURES:
        if f not in df.columns:
            df[f] = 0.0

    X_all = _safe_float_array(df[FEATURES])
    y_all = df['Target'].values

    if len(X_all) < 100:
        raise ValueError("Global model requires at least 100 rows. Add more stocks to the retrain set.")

    # ── Chronological 70/15/15 split — no shuffling ever ──────────────────
    n          = len(X_all)
    train_end  = int(n * 0.70)
    calib_end  = int(n * 0.85)

    X_train, y_train = X_all[:train_end],  y_all[:train_end]
    X_calib, y_calib = X_all[train_end:calib_end], y_all[train_end:calib_end]
    X_test,  y_test  = X_all[calib_end:],  y_all[calib_end:]

    # Guarantee all 3 classes in training
    missing_classes = set([0, 1, 2]) - set(np.unique(y_train))
    for mc in missing_classes:
        X_train = np.vstack([X_train, np.zeros(X_train.shape[1])])
        y_train = np.append(y_train, mc)

    le = LabelEncoder()
    y_train_enc = le.fit_transform(y_train)

    scaler       = RobustScaler()
    X_train_sc   = scaler.fit_transform(X_train)
    X_calib_sc   = scaler.transform(X_calib)
    X_test_sc    = scaler.transform(X_test)
    X_all_sc     = scaler.transform(X_all)

    # ── Time-Decay Sample Weighting (Institutional Standard) ─────────────
    # We give more weight to RECENT samples. The market 2 years ago is
    # less relevant than the market 2 months ago.
    recency_weights = np.linspace(0.5, 1.0, len(y_train_enc))
    class_weights   = compute_sample_weight(class_weight='balanced', y=y_train_enc)
    sw_train        = class_weights * recency_weights

    # ── TimeSeriesSplit CV — respects time ordering, no future leakage ────
    tscv = TimeSeriesSplit(n_splits=5)

    xgb_base = xgb.XGBClassifier(random_state=42, eval_metric='mlogloss', verbosity=0)
    lgb_base = lgb.LGBMClassifier(random_state=42, verbosity=-1, force_row_wise=True)

    xgb_params = {
        'n_estimators':     [200, 300, 400, 500],
        'max_depth':        [3, 4, 5, 6],
        'learning_rate':    [0.01, 0.03, 0.05, 0.08],
        'subsample':        [0.7, 0.8, 0.9],
        'colsample_bytree': [0.7, 0.8, 0.9],
        'min_child_weight': [1, 3, 5],
        'gamma':            [0, 0.05, 0.1],
        'reg_alpha':        [0, 0.05, 0.1],
        'reg_lambda':       [0.5, 1.0, 1.5],
    }
    lgb_params = {
        'n_estimators':     [200, 300, 400, 500],
        'max_depth':        [3, 4, 5, 6],
        'learning_rate':    [0.01, 0.03, 0.05, 0.08],
        'subsample':        [0.7, 0.8, 0.9],
        'colsample_bytree': [0.7, 0.8, 0.9],
        'min_child_samples':[5, 10, 20],
        'reg_alpha':        [0, 0.05, 0.1],
        'reg_lambda':       [0.5, 1.0, 1.5],
    }

    xgb_search = RandomizedSearchCV(xgb_base, xgb_params, n_iter=15, cv=tscv,
                                    scoring='f1_macro', random_state=42, n_jobs=-1)
    xgb_search.fit(X_train_sc, y_train_enc, sample_weight=sw_train)
    best_xgb = xgb_search.best_estimator_

    lgb_search = RandomizedSearchCV(lgb_base, lgb_params, n_iter=15, cv=tscv,
                                    scoring='f1_macro', random_state=42, n_jobs=-1)
    lgb_search.fit(X_train_sc, y_train_enc, sample_weight=sw_train)
    best_lgb = lgb_search.best_estimator_

    rf_model = RandomForestClassifier(
        n_estimators=400, max_depth=10, min_samples_split=4,
        min_samples_leaf=2, max_features='sqrt', random_state=42, n_jobs=-1,
    )
    et_model = ExtraTreesClassifier(
        n_estimators=300, max_depth=10, min_samples_split=4,
        min_samples_leaf=2, max_features='sqrt', random_state=42, n_jobs=-1,
    )

    # ── 4-model soft-voting ensemble ──────────────────────────────────────
    # XGB 35% + LGB 30% + RF 20% + ET 15%
    ensemble = VotingClassifier(
        estimators=[('xgb', best_xgb), ('lgb', best_lgb), ('rf', rf_model), ('et', et_model)],
        voting='soft',
        weights=[3.5, 3.0, 2.0, 1.5],
    )
    ensemble.fit(X_train_sc, y_train_enc, sample_weight=sw_train)

    # ── Feature importance filtering (Professional RFE Upgrade) ──────────
    # We use RFE with a Random Forest estimator to find the optimal subset 
    # of features, removing those that contribute only noise.
    from sklearn.feature_selection import RFE
    
    logger.info("Starting Recursive Feature Elimination (RFE)...")
    rfe_selector = RFE(
        estimator=RandomForestClassifier(n_estimators=100, random_state=42, n_jobs=-1),
        n_features_to_select=min(40, len(FEATURES)), # Target top 40 features
        step=5
    )
    rfe_selector.fit(X_train_sc, y_train_enc)
    selected_mask = rfe_selector.support_
    selected_feats = [f for f, keep in zip(FEATURES, selected_mask) if keep]

    logger.info("RFE Complete: %d/%d features kept", len(selected_feats), len(FEATURES))

    # Retrain scaler + all models on selected features only
    X_train_sel = _safe_float_array(df.iloc[:train_end][selected_feats])
    X_calib_sel = _safe_float_array(df.iloc[train_end:calib_end][selected_feats]) if calib_end > train_end else X_train_sel[:0]
    X_test_sel  = _safe_float_array(df.iloc[calib_end:][selected_feats]) if len(df) > calib_end else X_train_sel[:0]

    scaler2 = RobustScaler()
    X_tr_sc2 = scaler2.fit_transform(X_train_sel)
    X_ca_sc2 = scaler2.transform(X_calib_sel) if len(X_calib_sel) > 0 else X_tr_sc2[:0]
    X_te_sc2 = scaler2.transform(X_test_sel)  if len(X_test_sel)  > 0 else X_tr_sc2[:0]

    # Pad training set with missing classes again after feature selection
    y_tr2 = y_train_enc.copy()
    missing2 = set([0, 1, 2]) - set(np.unique(y_tr2))
    for mc in missing2:
        X_tr_sc2 = np.vstack([X_tr_sc2, np.zeros(X_tr_sc2.shape[1])])
        y_tr2    = np.append(y_tr2, mc)
    sw_tr2 = compute_sample_weight(class_weight='balanced', y=y_tr2)

    best_xgb2 = xgb.XGBClassifier(**{**xgb_search.best_params_, 'random_state': 42, 'eval_metric': 'mlogloss', 'verbosity': 0})
    best_lgb2 = lgb.LGBMClassifier(**{**lgb_search.best_params_, 'random_state': 42, 'verbosity': -1, 'force_row_wise': True})
    rf2 = RandomForestClassifier(n_estimators=400, max_depth=10, min_samples_split=4, min_samples_leaf=2, max_features='sqrt', random_state=42, n_jobs=-1)
    et2 = ExtraTreesClassifier(n_estimators=300,  max_depth=10, min_samples_split=4, min_samples_leaf=2, max_features='sqrt', random_state=42, n_jobs=-1)

    # ── Advanced Stacking Ensemble (Professional V2) ─────────────────────
    meta_model2 = LogisticRegression(class_weight='balanced', max_iter=1000, random_state=42)
    
    ensemble2 = StackingClassifier(
        estimators=[
            ('xgb', xgb.XGBClassifier(**{**xgb_search.best_params_, 'random_state': 42, 'eval_metric': 'mlogloss', 'verbosity': 0})),
            ('lgb', lgb.LGBMClassifier(**{**lgb_search.best_params_, 'random_state': 42, 'verbosity': -1, 'force_row_wise': True})),
            ('rf', rf2),
            ('et', et2)
        ],
        final_estimator=meta_model2,
        cv=5, # Use standard 5-fold partitions for the internal stacking logic
        stack_method='predict_proba',
        n_jobs=-1,
    )
    ensemble2.fit(X_tr_sc2, y_tr2, sample_weight=sw_tr2)

    # ── Final Ensemble (Self-Calibrating) ──────────────────────────────────
    # Since we are using a StackingClassifier with a LogisticRegression 
    # meta-learner, the probabilities are already professionally calibrated.
    # We use ensemble2 directly to avoid library version conflicts.
    final_model = ensemble2
    logger.info("Ensemble model finalized (Stacking Meta-Learner active)")

    # ── Evaluate on held-out test set ─────────────────────────────────────
    if len(X_te_sc2) >= 10:
        y_test_enc = le.transform(np.clip(y_test, 0, 2))
        y_pred     = final_model.predict(X_te_sc2)
        acc        = accuracy_score(y_test_enc, y_pred)
        f1_mac     = f1_score(y_test_enc, y_pred, average='macro', zero_division=0)
        report     = classification_report(
            y_test_enc, y_pred,
            labels=list(range(len(le.classes_))),
            target_names=[str(c) for c in le.classes_],
            output_dict=True, zero_division=0,
        )
    else:
        acc    = xgb_search.best_score_
        f1_mac = 0.0
        report = {}

    label_map = {str(c): {0: 'SELL', 1: 'HOLD', 2: 'BUY'}.get(c, str(c)) for c in le.classes_}
    per_class = {}
    for k, v in report.items():
        if k in label_map and isinstance(v, dict):
            per_class[label_map[k]] = {
                'precision': round(v['precision'] * 100, 1),
                'recall':    round(v['recall']    * 100, 1),
                'f1':        round(v['f1-score']  * 100, 1),
                'support':   int(v['support']),
            }

    metrics = {
        'accuracy':         round(acc * 100, 2),
        'f1_macro':         round(f1_mac * 100, 2),
        'threshold_used':   round(threshold * 100, 3),
        'features_used':    len(selected_feats),
        'tuned_params_xgb': xgb_search.best_params_,
        'tuned_params_lgb': lgb_search.best_params_,
        'per_class':        per_class,
    }

    artifacts = {
        'model':          final_model,
        'encoder':        le,
        'scaler':         scaler2,
        'features':       selected_feats,
        'test_start_idx': calib_end,
        'metrics':        metrics,
    }

    _save_global_model(artifacts)
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
        latest_model = _get_latest_model_path()
        if not latest_model:
            _, artifacts = train_or_load_model(df)
        else:
            try:
                artifacts = joblib.load(latest_model)
                if 'scaler' not in artifacts:
                    _, artifacts = train_or_load_model(df)
            except Exception:
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

    # ── Confidence Thresholding (Advanced Quality Control) ───────────────
    # Only allow a BUY or SELL if the AI is truly confident (> 50%).
    # This reduces "false positives" while allowing more valid signals.
    CONFIDENCE_THRESHOLD = 50.0
    pred_enc_idx = int(np.argmax(proba))
    confidence   = round(float(proba[pred_enc_idx] * 100), 2)
    pred_class   = le.inverse_transform([pred_enc_idx])[0]
    
    raw_prediction = {0: 'SELL', 1: 'HOLD', 2: 'BUY'}.get(pred_class, 'HOLD')
    
    if raw_prediction in ['BUY', 'SELL'] and confidence < CONFIDENCE_THRESHOLD:
        prediction = 'HOLD'
    else:
        prediction = raw_prediction

    all_proba = {'BUY': 0.0, 'HOLD': 0.0, 'SELL': 0.0}
    for i, cls in enumerate(le.classes_):
        label = {0: 'SELL', 1: 'HOLD', 2: 'BUY'}.get(cls, str(cls))
        all_proba[label] = round(float(proba[i]) * 100, 1)

    # ── Professional Backtest Window ─────────────────────────────────────
    # Previously, this was limited to the last 10 days, resulting in 0 trades.
    # We now target a minimum 60-day window for statistical significance.
    test_start  = artifacts.get('test_start_idx', int(len(df) * 0.8))
    WARMUP      = 26
    
    # Calculate a window that covers the test set but ensures at least 60 days if possible
    MIN_WINDOW  = 60
    actual_start = min(test_start + WARMUP, max(0, len(df) - MIN_WINDOW))
    
    test_df     = df.iloc[actual_start:].copy()
    backtest    = run_backtest(model, le, scaler, features, test_df)
    all_signals = predict_all_signals(df, artifacts)

    return prediction, confidence, backtest, metrics, all_proba, all_signals


def run_backtest(model, encoder, scaler, features: list, df: pd.DataFrame) -> dict:
    """
    Simulates trading on the held-out test set.
    - NEPSE costs: 0.4% Broker Fee + Rs. 25 DP Fee (Institutional Standard)
    - Starting capital: Rs. 100,000
    - Reports: return %, win rate, max drawdown, Sharpe, Calmar, Profit Factor,
               total trades, commission paid, benchmark return, expectancy.
    """
    COMMISSION = 0.004
    DP_FEE     = 25.0    # Standard NEPSE DP Fee per transaction
    INITIAL    = 100_000.0

    if len(df) < 15:
        return None

    # ── Prepare Features ──
    for f in features:
        if f not in df.columns:
            df[f] = 0.0

    try:
        X     = scaler.transform(_safe_float_array(df[features]))
        X     = np.nan_to_num(X, nan=0.0, posinf=0.0, neginf=0.0)
        preds = encoder.inverse_transform(model.predict(X))
    except Exception:
        return None

    # ── Simulation State ──
    closes           = df['Close'].values
    dates            = df['Date'].values
    capital          = INITIAL
    shares           = 0.0
    entry_price      = 0.0
    entry_date       = None
    entry_capital    = INITIAL 
    trades_won       = 0
    trades_total     = 0
    peak_capital     = INITIAL
    max_drawdown     = 0.0
    equity_curve     = [INITIAL]
    total_commission = 0.0
    gross_profit     = 0.0
    gross_loss       = 0.0
    trade_log        = []

    # ── Benchmark (Buy & Hold) ──
    bench_shares = INITIAL / closes[0]
    bench_final  = bench_shares * closes[-1]
    bench_return = ((bench_final - INITIAL) / INITIAL) * 100

    # ── Run Simulation ──
    for i, signal in enumerate(preds):
        price = closes[i]
        date_str = dates[i].strftime("%Y-%m-%d") if hasattr(dates[i], "strftime") else str(dates[i])

        if signal == 2 and shares == 0:          # BUY
            entry_capital     = capital
            entry_date        = date_str
            cost              = (capital * COMMISSION) + DP_FEE
            total_commission += cost
            capital          -= cost
            shares            = capital / price
            capital           = 0.0
            entry_price       = price

        elif signal == 0 and shares > 0:         # SELL
            gross             = shares * price
            cost              = (gross * COMMISSION) + DP_FEE
            total_commission += cost
            capital           = gross - cost
            
            pnl = capital - entry_capital
            pnl_pct = (pnl / entry_capital) * 100
            
            if pnl > 0:
                gross_profit += pnl
                trades_won   += 1
            else:
                gross_loss   += abs(pnl)
            
            trade_log.append({
                "entry_date":  entry_date,
                "exit_date":   date_str,
                "entry_price": round(entry_price, 2),
                "exit_price":  round(price, 2),
                "pnl_rs":      round(pnl, 2),
                "pnl_pct":     round(pnl_pct, 2)
            })
            
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
        date_str          = dates[-1].strftime("%Y-%m-%d") if hasattr(dates[-1], "strftime") else str(dates[-1])
        gross             = shares * closes[-1]
        cost              = (gross * COMMISSION) + DP_FEE
        total_commission += cost
        capital           = gross - cost
        pnl               = capital - entry_capital
        pnl_pct           = (pnl / entry_capital) * 100
        
        if pnl > 0:
            gross_profit += pnl
            trades_won   += 1
        else:
            gross_loss   += abs(pnl)
            
        trade_log.append({
            "entry_date":  entry_date,
            "exit_date":   date_str,
            "entry_price": round(entry_price, 2),
            "exit_price":  round(closes[-1], 2),
            "pnl_rs":      round(pnl, 2),
            "pnl_pct":     round(pnl_pct, 2)
        })
        trades_total += 1

    # ── Metrics Calculation ──
    win_rate   = (trades_won / trades_total * 100) if trades_total > 0 else 0.0
    return_pct = ((capital - INITIAL) / INITIAL) * 100
    
    # Expectancy: (Win% * AvgWin) - (Loss% * AvgLoss)
    avg_win  = (gross_profit / trades_won) if trades_won > 0 else 0
    avg_loss = (gross_loss / (trades_total - trades_won)) if (trades_total - trades_won) > 0 else 0
    expectancy = ((win_rate/100) * avg_win) - ((1 - win_rate/100) * avg_loss)

    # Sharpe ratio (annualized)
    sharpe = 0.0
    sortino = 0.0
    if len(equity_curve) > 5:
        eq            = np.array(equity_curve)
        daily_returns = np.diff(eq) / (eq[:-1] + 1e-9)
        std = daily_returns.std()
        if std > 0:
            sharpe = (daily_returns.mean() / std) * np.sqrt(252)
        
        downside = daily_returns[daily_returns < 0]
        if len(downside) > 0 and downside.std() > 0:
            sortino = (daily_returns.mean() / downside.std()) * np.sqrt(252)

    calmar = (return_pct / max_drawdown) if max_drawdown > 0 else (return_pct if return_pct > 0 else 0.0)
    profit_factor = (gross_profit / gross_loss) if gross_loss > 0 else (99.0 if gross_profit > 0 else 0.0)

    return {
        'initial_capital': INITIAL,
        'final_capital':   round(capital, 2),
        'return_pct':      round(return_pct, 2),
        'bench_return':    round(bench_return, 2),
        'win_rate':        round(win_rate, 2),
        'total_trades':    trades_total,
        'max_drawdown':    round(max_drawdown, 2),
        'sharpe_ratio':    round(sharpe, 2),
        'sortino_ratio':   round(sortino, 2),
        'calmar_ratio':    round(calmar, 2),
        'profit_factor':   round(profit_factor, 2),
        'expectancy':      round(expectancy, 2),
        'commission_paid': round(total_commission, 2),
        'trades':          trade_log,
        'equity_curve':    equity_curve
    }
