import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

// Used by HistoryTable
export const SIGNAL = {
    BUY:  { color: 'text-buy',  bg: 'bg-buy/10',  border: 'border-buy/30',  bar: 'bg-buy',  glow: 'shadow-[0_0_16px_rgba(16,185,129,0.15)]',  icon: TrendingUp  },
    SELL: { color: 'text-sell', bg: 'bg-sell/10', border: 'border-sell/30', bar: 'bg-sell', glow: 'shadow-[0_0_16px_rgba(239,68,68,0.15)]',    icon: TrendingDown },
    HOLD: { color: 'text-hold', bg: 'bg-hold/10', border: 'border-hold/30', bar: 'bg-hold', glow: 'shadow-[0_0_16px_rgba(234,179,8,0.15)]',    icon: Minus       },
};

// Used by PredictionResult
export const SIG = {
    BUY:  { color: '#10b981', dimColor: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.3)',  label: 'Bullish Signal',  icon: TrendingUp,   tier: ['STRONG BUY',  'BUY',  'WEAK BUY'],   structureColor: '#10b981' },
    SELL: { color: '#ef4444', dimColor: 'rgba(239,68,68,0.12)',  border: 'rgba(239,68,68,0.3)',   label: 'Bearish Signal',  icon: TrendingDown, tier: ['STRONG SELL', 'SELL', 'WEAK SELL'], structureColor: '#ef4444' },
    HOLD: { color: '#eab308', dimColor: 'rgba(234,179,8,0.12)',  border: 'rgba(234,179,8,0.3)',   label: 'Neutral — Watch', icon: Minus,        tier: ['STRONG HOLD', 'HOLD', 'WEAK HOLD'], structureColor: '#eab308' },
};

export const STRUCTURE_COLOR = { BULLISH: '#10b981', BEARISH: '#ef4444', RANGING: '#eab308' };
export const STRUCTURE_BG    = { BULLISH: 'rgba(16,185,129,0.1)', BEARISH: 'rgba(239,68,68,0.1)', RANGING: 'rgba(234,179,8,0.1)' };

export const signalTier = (prediction, confidence) => {
    const tiers = SIG[prediction]?.tier ?? SIG.HOLD.tier;
    if (confidence >= 75) return tiers[0];
    if (confidence >= 50) return tiers[1];
    return tiers[2];
};

// Live market theme
export const SURFACE = 'rgba(8, 15, 26, 0.7)';
export const BORDER  = 'rgba(255, 255, 255, 0.08)';
