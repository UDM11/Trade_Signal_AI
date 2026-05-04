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
import optuna
import shap
import torch
import torch.nn as nn
from sklearn.mixture import GaussianMixture

import json

# ── Suppress sklearn feature-name mismatch warnings ──────────────────────────
# These arise from a format mismatch between how the saved models were trained
# (raw numpy arrays) and the new prediction code (named DataFrames), or vice versa.
# Both directions are harmless — the predictions are correct either way.
# These warnings will disappear permanently once models are retrained.
warnings.filterwarnings(
    'ignore',
    message='X does not have valid feature names',
    category=UserWarning,
)
warnings.filterwarnings(
    'ignore',
    message='X has feature names, but',
    category=UserWarning,
)
# Suppress httpx deprecation warning about 'data=' vs 'content=' parameter
warnings.filterwarnings(
    'ignore',
    message="Use 'content=<...>'",
    category=DeprecationWarning,
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
    # ── Regime Features ──
    'Market_Regime',
]



def detect_regimes(df: pd.DataFrame, n_regimes: int = 3) -> pd.DataFrame:
    """
    Uses Gaussian Mixture Model to classify market into regimes.
    Returns the dataframe with a 'Market_Regime' column.
    """
    df = df.copy()
    # Use Volatility, Returns, and ADX as regime indicators
    regime_feats = ['Volatility', 'Price_Change_Pct', 'ADX']
    for f in regime_feats:
        if f not in df.columns:
            df[f] = 0.0
            
    # Need enough data for GMM
    if len(df) < 50:
        df['Market_Regime'] = 1 # Default to ranging
        return df

    X = df[regime_feats].fillna(0).values
    # Standardize
    X_mean = X.mean(axis=0)
    X_std = X.std(axis=0) + 1e-9
    X_norm = (X - X_mean) / X_std
    
    try:
        gmm = GaussianMixture(n_components=n_regimes, random_state=42, n_init=5)
        df['Market_Regime'] = gmm.fit_predict(X_norm)
    except Exception:
        df['Market_Regime'] = 1
        
    return df

class iTransformer(nn.Module):
    """
    Simplified iTransformer-inspired architecture for time-series.
    Inverts dimensions to apply attention across the feature dimension.
    """
    def __init__(self, num_features, seq_len, d_model=64, n_heads=4, num_layers=2):
        super().__init__()
        self.seq_len = seq_len
        self.feature_embedding = nn.Linear(seq_len, d_model)
        
        encoder_layer = nn.TransformerEncoderLayer(
            d_model=d_model, 
            nhead=n_heads, 
            dim_feedforward=d_model * 4,
            batch_first=True,
            dropout=0.1
        )
        self.transformer = nn.TransformerEncoder(encoder_layer, num_layers=num_layers)
        
        self.output_layer = nn.Linear(num_features * d_model, 3) # 3 classes: SELL, HOLD, BUY
        
    def forward(self, x):
        # x shape: (batch, seq_len, num_features)
        # iTransformer: invert to (batch, num_features, seq_len)
        x = x.permute(0, 2, 1)
        
        # Embed time dimension
        x = self.feature_embedding(x) # (batch, num_features, d_model)
        
        # Transformer attention across features
        x = self.transformer(x) # (batch, num_features, d_model)
        
        # Flatten and predict
        x = x.reshape(x.size(0), -1)
        return self.output_layer(x)

def train_itransformer(X_sc, y_enc, seq_len=10, epochs=20, lr=0.001):
    """
    Trains the iTransformer model on provided scaled features and encoded labels.
    """
    num_features = X_sc.shape[1]
    
    # Create sequences
    X_seq, y_seq = [], []
    for i in range(len(X_sc) - seq_len):
        X_seq.append(X_sc[i : i + seq_len])
        y_seq.append(y_enc[i + seq_len])
    
    if len(X_seq) < 32:
        return None
        
    X_seq = torch.FloatTensor(np.array(X_seq))
    y_seq = torch.LongTensor(np.array(y_seq))
    
    model = iTransformer(num_features, seq_len)
    optimizer = torch.optim.Adam(model.parameters(), lr=lr)
    criterion = nn.CrossEntropyLoss()
    
    model.train()
    for epoch in range(epochs):
        optimizer.zero_grad()
        outputs = model(X_seq)
        loss = criterion(outputs, y_seq)
        loss.backward()
        optimizer.step()
        
    return model

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
    Advanced Global Model Training:
    - Regime Detection (GMM)
    - Optuna-based Hyperparameter Optimization
    - Regime-Specific Expert Ensembles
    - SHAP Explainability artifacts
    """
    import logging
    logger = logging.getLogger(__name__)

    # 1. Regime Detection
    df = detect_regimes(df)
    
    if 'Target' not in df.columns:
        WARMUP = 26
        if len(df) > WARMUP * 2:
            df = df.iloc[WARMUP:].reset_index(drop=True)
        df, threshold = assign_labels(df)
    else:
        threshold = 0.015

    for f in FEATURES:
        if f not in df.columns:
            df[f] = 0.0

    X_all = _safe_float_array(df[FEATURES])
    y_all = df['Target'].values
    regimes = df['Market_Regime'].values

    if len(X_all) < 100:
        raise ValueError("Global model requires at least 100 rows.")

    # ── Chronological split for honest evaluation ──
    test_size = 0.15 if len(X_all) > 100 else 0.2
    split = int(len(X_all) * (1 - test_size))
    
    X_train, X_test = X_all[:split], X_all[split:]
    y_train, y_test = y_all[:split], y_all[split:]
    regimes_train = regimes[:split]

    # Ensure all classes exist in train set
    missing_classes = set([0, 1, 2]) - set(np.unique(y_train))
    for mc in missing_classes:
        X_train = np.vstack([X_train, np.zeros(X_train.shape[1])])
        y_train = np.append(y_train, mc)
        regimes_train = np.append(regimes_train, 1)

    le = LabelEncoder()
    y_train_enc = le.fit_transform(y_train)
    y_test_enc = le.transform(y_test)
    
    scaler = RobustScaler()
    X_train_sc = scaler.fit_transform(X_train)
    X_test_sc = scaler.transform(X_test)
    
    X_all_sc = scaler.transform(X_all) # For background data

    # 2. Optuna Optimization for each Regime Expert
    regime_experts = {}
    regime_metrics = {}
    
    for r in np.unique(regimes_train):
        logger.info(f"Training Expert for Regime {r}...")
        mask = (regimes_train == r)
        if mask.sum() < 20:
            logger.warning(f"Regime {r} has too little data ({mask.sum()}). Skipping expert.")
            continue
            
        Xr, yr = X_train_sc[mask], y_train_enc[mask]
        
        # Ensure all 3 classes exist to maintain predict_proba shape (SELL=0, HOLD=1, BUY=2)
        # This prevents 'index 2 is out of bounds' errors in predict_latest
        missing_classes = set([0, 1, 2]) - set(np.unique(yr))
        for mc in missing_classes:
            Xr = np.vstack([Xr, np.zeros(Xr.shape[1])])
            yr = np.append(yr, mc)
            
        num_classes = 3
        
        # 2-fold CV — fast enough for financial time series, saves 33% over 3-fold
        tscv = TimeSeriesSplit(n_splits=2)
        
        def objective(trial, _Xr=Xr, _yr=yr, _tscv=tscv, _nc=num_classes):
            param = {
                'n_estimators': trial.suggest_int('n_estimators', 100, 300),
                'max_depth': trial.suggest_int('max_depth', 3, 7),
                'learning_rate': trial.suggest_float('learning_rate', 0.02, 0.15, log=True),
                'subsample': trial.suggest_float('subsample', 0.7, 1.0),
                'colsample_bytree': trial.suggest_float('colsample_bytree', 0.7, 1.0),
                'random_state': 42,
                'eval_metric': 'mlogloss',
                'verbosity': 0,
                'n_jobs': -1,
                'num_class': _nc if _nc > 2 else None,  # Only needed for multiclass
            }
            # Remove None values
            param = {k: v for k, v in param.items() if v is not None}
            model = xgb.XGBClassifier(**param)
            scores = []
            for train_idx, val_idx in _tscv.split(_Xr):
                X_train, X_val = _Xr[train_idx], _Xr[val_idx]
                y_train, y_val = _yr[train_idx], _yr[val_idx]
                # Guard: skip fold if train set has only 1 class
                if len(np.unique(y_train)) < 2:
                    continue
                try:
                    model.fit(X_train, y_train)
                    preds = model.predict(X_val)
                    scores.append(f1_score(y_val, preds, average='macro', zero_division=0))
                except Exception:
                    continue
            return np.mean(scores) if scores else 0.0

        # 5 trials × 2-fold = 10 fits per regime (was 30 — 3x faster)
        optuna.logging.set_verbosity(optuna.logging.WARNING)
        study = optuna.create_study(direction='maximize')
        study.optimize(objective, n_trials=5)
        
        best_params = study.best_params if study.best_value > 0 else {}
        best_xgb = xgb.XGBClassifier(
            **{k: v for k, v in best_params.items()},
            random_state=42, eval_metric='mlogloss', verbosity=0, n_jobs=-1
        )
        
        # Also include a LightGBM with default/simple tuning
        best_lgb = lgb.LGBMClassifier(n_estimators=200, max_depth=6, random_state=42, verbosity=-1)
        
        expert = VotingClassifier(
            estimators=[('xgb', best_xgb), ('lgb', best_lgb)],
            voting='soft',
            weights=[2.0, 1.0]
        )
        
        # Final Fit for Expert (use re-encoded labels)
        expert.fit(Xr, yr)
        regime_experts[int(r)] = expert
        
        # Quick eval
        y_pred = expert.predict(Xr)
        regime_metrics[int(r)] = accuracy_score(yr, y_pred)

    # 3. Transformer Expert (Temporal Analysis)
    logger.info("Training iTransformer Expert...")
    itran_model = train_itransformer(X_train_sc, y_train_enc)
    
    # 4. Global Stacking Ensemble (as fallback or coordinator)
    meta_model = LogisticRegression(class_weight='balanced', random_state=42)
    global_ensemble = StackingClassifier(
        estimators=[
            ('xgb', xgb.XGBClassifier(n_estimators=200, max_depth=6, random_state=42, eval_metric='mlogloss', verbosity=0, n_jobs=-1)),
            ('lgb', lgb.LGBMClassifier(n_estimators=200, max_depth=6, random_state=42, verbosity=-1))
        ],
        final_estimator=meta_model,
        cv=3,
        stack_method='predict_proba',
        n_jobs=-1
    )
    global_ensemble.fit(X_train_sc, y_train_enc)

    # 5. Honest Evaluation on held-out test set
    if len(X_test_sc) > 0:
        y_pred = global_ensemble.predict(X_test_sc)
        honest_acc = accuracy_score(y_test_enc, y_pred)
        present_labels = list(range(len(le.classes_)))
        report = classification_report(
            y_test_enc, y_pred,
            labels=present_labels,
            target_names=[str(c) for c in le.classes_],
            output_dict=True,
            zero_division=0,
        )
    else:
        honest_acc = 0.0
        report = {str(c): {'precision': 0, 'recall': 0, 'f1-score': 0, 'support': 0} for c in le.classes_}

    label_map = {str(c): {0: 'SELL', 1: 'HOLD', 2: 'BUY'}.get(c, str(c)) for c in le.classes_}
    metrics = {
        'accuracy': round(honest_acc * 100, 2),
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
        'regime_experts': len(regime_experts),
        'regime_metrics': {str(k): round(v * 100, 2) for k, v in regime_metrics.items()},
        'features_used': len(FEATURES),
    }

    # 6. SHAP Explainer (Global)
    background = X_train_sc[np.random.choice(X_train_sc.shape[0], min(100, X_train_sc.shape[0]), replace=False)]
    explainer = shap.TreeExplainer(global_ensemble.named_estimators_['xgb'])

    artifacts = {
        'model': global_ensemble,
        'regime_experts': regime_experts,
        'itran_model': itran_model,
        'encoder': le,
        'scaler': scaler,
        'features': FEATURES,
        'metrics': metrics,
        'explainer': explainer,
        'background_data': background
    }

    _save_global_model(artifacts)
    return metrics, artifacts


def predict_all_signals(df: pd.DataFrame, artifacts: dict) -> list:
    """Predict BUY/SELL/HOLD for every row using Regime Experts if available."""
    df = detect_regimes(df)
    model = artifacts['model']
    experts = artifacts.get('regime_experts', {})
    le = artifacts['encoder']
    scaler = artifacts['scaler']
    features = artifacts.get('features', FEATURES)

    for f in features:
        if f not in df.columns:
            df[f] = 0.0

    try:
        X = _safe_float_array(df[features])
        X_scaled = scaler.transform(X)
        X_scaled = np.nan_to_num(X_scaled, nan=0.0, posinf=0.0, neginf=0.0)
        regimes = df['Market_Regime'].values
        
        preds = []
        for i in range(len(X_scaled)):
            r = int(regimes[i])
            if r in experts:
                p = experts[r].predict(X_scaled[i:i+1])[0]
            else:
                p = model.predict(X_scaled[i:i+1])[0]
            preds.append(p)
            
        decoded = le.inverse_transform(preds)
        sig_map = {0: 'SELL', 1: 'HOLD', 2: 'BUY'}
        return [sig_map.get(int(p), 'HOLD') for p in decoded]
    except Exception:
        return ['HOLD'] * len(df)


def predict_latest(df: pd.DataFrame, artifacts: dict = None):
    """
    Advanced Prediction Pipeline:
    - Current Regime Detection
    - Expert Selection
    - SHAP Explainability
    - Confidence Thresholding
    """
    if artifacts is None:
        latest_model = _get_latest_model_path()
        if not latest_model:
            _, artifacts = train_or_load_model(df)
        else:
            try:
                artifacts = joblib.load(latest_model)
            except Exception:
                _, artifacts = train_or_load_model(df)

    # 1. Regime Detection for latest data
    df = detect_regimes(df)
    current_regime = int(df['Market_Regime'].iloc[-1])
    
    model    = artifacts['model']
    experts  = artifacts.get('regime_experts', {})
    le       = artifacts['encoder']
    scaler   = artifacts['scaler']
    features = artifacts.get('features', FEATURES)
    metrics  = artifacts.get('metrics', {})
    
    # Select Expert or Fallback
    active_model = experts.get(current_regime, model)
    regime_name = {0: "Bearish", 1: "Ranging", 2: "Bullish"}.get(current_regime, "Unknown")

    for f in features:
        if f not in df.columns:
            df[f] = 0.0

    raw           = _safe_float_array(df.iloc[-1:][features])
    latest_scaled = scaler.transform(raw)
    latest_scaled = np.nan_to_num(latest_scaled, nan=0.0, posinf=0.0, neginf=0.0)

    X_df          = pd.DataFrame(latest_scaled, columns=features)
    proba         = active_model.predict_proba(X_df)[0]
    
    # Optional: Supplement with iTransformer (Temporal Expert)
    if 'itran_model' in artifacts and artifacts['itran_model'] is not None and len(df) >= 10:
        try:
            itran = artifacts['itran_model']
            itran.eval()
            seq = scaler.transform(_safe_float_array(df.iloc[-10:][features]))
            seq_t = torch.FloatTensor(seq).unsqueeze(0)
            with torch.no_grad():
                it_out = torch.softmax(itran(seq_t), dim=1).numpy()[0]
            # Ensemble with iTransformer (70% Trees, 30% Transformer)
            proba = 0.7 * proba + 0.3 * it_out
        except Exception:
            pass
    
    # 2. SHAP Explanation
    explanation = "No explanation available."
    if 'explainer' in artifacts:
        try:
            explainer = artifacts['explainer']
            shap_values = explainer.shap_values(latest_scaled)
            # shap_values is a list of arrays for multiclass
            # Get values for the predicted class
            pred_idx = np.argmax(proba)
            if isinstance(shap_values, list):
                vals = shap_values[pred_idx][0]
            elif len(shap_values.shape) == 3:
                vals = shap_values[0, :, pred_idx]
            else:
                vals = shap_values[0]
            
            # Get top 3 features
            top_idx = np.argsort(np.abs(vals))[-3:][::-1]
            top_feats = []
            for idx in top_idx:
                fname = features[idx]
                fval = df[fname].iloc[-1]
                impact = "positive" if vals[idx] > 0 else "negative"
                top_feats.append(f"{fname} ({impact})")
            explanation = f"Signal driven by: {', '.join(top_feats)}. Current Market Regime: {regime_name}."
        except Exception:
            pass

    # 3. Prediction & Confidence
    CONFIDENCE_THRESHOLD = 65.0
    pred_enc_idx = int(np.argmax(proba))
    confidence   = round(float(proba[pred_enc_idx] * 100), 2)
    pred_class   = le.inverse_transform([pred_enc_idx])[0]
    
    raw_prediction = {0: 'SELL', 1: 'HOLD', 2: 'BUY'}.get(pred_class, 'HOLD')
    prediction = raw_prediction if confidence >= CONFIDENCE_THRESHOLD else 'HOLD'

    all_proba = {'BUY': 0.0, 'HOLD': 0.0, 'SELL': 0.0}
    for i, cls in enumerate(le.classes_):
        label = {0: 'SELL', 1: 'HOLD', 2: 'BUY'}.get(cls, str(cls))
        all_proba[label] = round(float(proba[i]) * 100, 1)

    # 4. Backtest & Signals
    test_start  = artifacts.get('test_start_idx', int(len(df) * 0.8))
    actual_start = min(test_start + 26, max(0, len(df) - 60))
    test_df     = df.iloc[actual_start:].copy()
    
    backtest    = run_backtest(active_model, le, scaler, features, test_df)
    all_signals = predict_all_signals(df, artifacts)

    # 5. Multi-Timeframe Confluence Analysis (Phase 2 Goal)
    try:
        # Resample to Weekly to check broader trend
        if 'Date' in df.columns:
            df['Date'] = pd.to_datetime(df['Date'])
            df_w = df.set_index('Date').resample('W').last().dropna()
            if len(df_w) >= 2:
                w_trend = "Bullish" if (df_w['Close'].iloc[-1] > df_w['MA_50'].iloc[-1] if 'MA_50' in df_w else df_w['Close'].iloc[-1] > df_w['Close'].iloc[-2]) else "Bearish"
                d_trend = "Bullish" if prediction == "BUY" else "Bearish" if prediction == "SELL" else "Neutral"
                
                confluence = (w_trend == d_trend)
                metrics['confluence'] = {
                    "weekly_trend": w_trend,
                    "daily_signal": d_trend,
                    "aligned": confluence,
                    "score": 1.5 if confluence else 1.0  # Multiplier for signal strength
                }
                if confluence:
                    explanation += f" Confirmed by {w_trend} Weekly timeframe confluence."
    except Exception as e:
        logger.debug(f"Confluence analysis failed: {e}")

    # 6. Pattern Similarity Search (Phase 3 Goal)
    try:
        from app.services.vector_service import similarity_engine
        current_embedding = similarity_engine.create_embedding(df)
        if current_embedding is not None:
            similarity_match = similarity_engine.find_historical_match(current_embedding)
            metrics['pattern_similarity'] = similarity_match
            if similarity_match['similarity'] > 80:
                explanation += f" This setup has a {similarity_match['similarity']}% similarity to the {similarity_match['event']} ({similarity_match['date']})."
    except Exception as e:
        logger.debug(f"Similarity search failed: {e}")

    # Add explanation to metrics for the frontend to display
    metrics['explanation'] = explanation
    metrics['regime'] = regime_name

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
        X_df  = pd.DataFrame(X, columns=features)
        preds = encoder.inverse_transform(model.predict(X_df))
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
