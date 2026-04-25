-- Supabase Schema for Trade Signal AI

CREATE TABLE IF NOT EXISTS stocks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    symbol VARCHAR(20) NOT NULL,
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS predictions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stock_id UUID REFERENCES stocks(id) ON DELETE CASCADE,
    prediction VARCHAR(10) NOT NULL, -- BUY, SELL, HOLD
    confidence_score DECIMAL(5,2) NOT NULL,
    model_used VARCHAR(50) NOT NULL,
    explanation TEXT NOT NULL,
    target_price FLOAT,
    stop_loss FLOAT,
    estimated_days INTEGER,
    target_pct FLOAT,
    stop_loss_pct FLOAT,
    risk_reward FLOAT,
    all_proba JSONB,
    indicators JSONB,
    model_metrics JSONB,
    ai_analysis JSONB,
    chart_data JSONB,
    signal_history JSONB,
    backtest_stats JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE predictions ADD COLUMN IF NOT EXISTS signal_history JSONB;
ALTER TABLE predictions ADD COLUMN IF NOT EXISTS target_price FLOAT;
ALTER TABLE predictions ADD COLUMN IF NOT EXISTS stop_loss FLOAT;
ALTER TABLE predictions ADD COLUMN IF NOT EXISTS estimated_days INTEGER;
ALTER TABLE predictions ADD COLUMN IF NOT EXISTS target_pct FLOAT;
ALTER TABLE predictions ADD COLUMN IF NOT EXISTS stop_loss_pct FLOAT;
ALTER TABLE predictions ADD COLUMN IF NOT EXISTS risk_reward FLOAT;
ALTER TABLE predictions ADD COLUMN IF NOT EXISTS all_proba JSONB;
ALTER TABLE predictions ADD COLUMN IF NOT EXISTS indicators JSONB;
ALTER TABLE predictions ADD COLUMN IF NOT EXISTS model_metrics JSONB;
CREATE TABLE IF NOT EXISTS daily_ohlcv (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stock_id UUID REFERENCES stocks(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    open FLOAT,
    high FLOAT,
    low FLOAT,
    close FLOAT,
    volume FLOAT,
    UNIQUE(stock_id, date)
);
