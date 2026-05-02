import pandas as pd
import numpy as np
import logging
import os
from datetime import datetime

logger = logging.getLogger(__name__)

def back_adjust_prices(df: pd.DataFrame, symbol: str, threshold: float = 0.12) -> pd.DataFrame:
    """
    Professional Price Adjustment Engine for NEPSE.
    Detects massive overnight gaps (>12%) that signify Bonus/Right shares.
    """
    if len(df) < 5:
        return df

    # Ensure chronological order
    df = df.sort_values('Date').reset_index(drop=True)
    
    # Work with a copy to be safe
    df_adj = df.copy()
    
    # Cumulative adjustment factor
    cumulative_factor = 1.0
    adjustments_made = 0
    
    # Iterate backwards from latest to earliest
    for i in range(len(df_adj) - 1, 0, -1):
        current_open = df_adj.loc[i, 'Open']
        prev_close = df_adj.loc[i-1, 'Close']
        
        if prev_close == 0 or pd.isna(prev_close):
            continue
            
        # NEPSE Logic: If price opens significantly lower than previous close
        # but the volume is normal or high, it's almost certainly a corporate action.
        actual_ratio = current_open / prev_close
        
        # Check if the drop exceeds our threshold (e.g. 12% drop)
        if actual_ratio < (1.0 - threshold):
            # We assume this is a split/bonus/right adjustment
            # The adjustment factor for all previous data is current_open / prev_close
            cumulative_factor *= actual_ratio
            adjustments_made += 1
            logger.info(f"Detected potential corporate action at {df_adj.loc[i, 'Date']}: Ratio {actual_ratio:.4f}")

        # Apply the cumulative factor to the historical rows (i-1 and earlier)
        if cumulative_factor != 1.0:
            for col in ['Open', 'High', 'Low', 'Close']:
                df_adj.loc[i-1, col] = round(df_adj.loc[i-1, col] * actual_ratio if actual_ratio < (1.0 - threshold) else df_adj.loc[i-1, col], 2)
                # Note: The logic above is slightly simplified for the one-pass loop. 
                # Let's do it properly:
                
    # Re-implementing more robustly:
    df_clean = df.copy()
    cumulative_adj = 1.0
    for i in range(len(df_clean) - 1, 0, -1):
        c_open = df_clean.loc[i, 'Open']
        p_close = df_clean.loc[i-1, 'Close']
        
        # Professional Safeguard: Only adjust if both prices are valid and non-zero
        # And only if the ratio is reasonable (NEPSE corporate actions rarely exceed 90% drop in one day)
        if p_close > 0 and c_open > 0:  # Skip if Open is 0 (missing data, not a real gap)
            ratio = c_open / p_close
            if ratio < (1.0 - threshold) and ratio > 0.1:
                cumulative_adj *= ratio
                adjustments_made += 1
            
        if cumulative_adj != 1.0:
            for col in ['Open', 'High', 'Low', 'Close']:
                df_clean.loc[i-1, col] = round(df_clean.loc[i-1, col] * cumulative_adj, 2)
                
    if adjustments_made > 0:
        logger.info(f"Price Adjustment: Applied {adjustments_made} corporate action corrections for {symbol}.")
        
    return df_clean

def import_and_clean_history(symbol: str, raw_data: list) -> pd.DataFrame:
    """
    Orchestrates the conversion of raw API data into a cleaned, 
    adjusted, and indicator-ready DataFrame.
    """
    df = pd.DataFrame(raw_data)
    if df.empty:
        return df
        
    # Normalize column names (case-insensitive)
    col_map = {}
    for col in df.columns:
        cl = col.lower()
        if cl == 'close':               col_map[col] = 'Close'
        elif cl == 'open':              col_map[col] = 'Open'
        elif cl == 'high':              col_map[col] = 'High'
        elif cl == 'low':               col_map[col] = 'Low'
        elif cl in ['volume', 'qty', 'value']: col_map[col] = 'Volume'
    df.rename(columns=col_map, inplace=True)

    # Convert dates
    if 'time' in df.columns:
        df['Date'] = pd.to_datetime(df['time'])
    elif 'date' in df.columns:
        df['Date'] = pd.to_datetime(df['date'])
        
    # Ensure numeric types
    for col in ['Open', 'High', 'Low', 'Close', 'Volume']:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0)
            
    # 1. Apply Corporate Action Adjustments
    df = back_adjust_prices(df, symbol)
    
    return df
