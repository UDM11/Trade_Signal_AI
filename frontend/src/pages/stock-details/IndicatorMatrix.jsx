import React from 'react';
import { 
    Activity, TrendingUp, TrendingDown, Gauge, BarChart3, 
    Layers, Zap, Shield, Target, ArrowRightLeft, MousePointer2,
    Info, AlertCircle, CheckCircle2, Circle, Loader2
} from 'lucide-react';

const fmt = (n, d = 2) => 
    n != null ? Number(n).toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—';

const pct = (n) => n != null ? `${(n * 100).toFixed(2)}%` : '—';

function MatrixCell({ label, value, status, suffix = "" }) {
    const colors = {
        bull: { text: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
        bear: { text: 'text-rose-400',    bg: 'bg-rose-500/10',    border: 'border-rose-500/20' },
        neutral: { text: 'text-slate-400', bg: 'bg-white/5',       border: 'border-white/5' }
    };
    const c = colors[status] || colors.neutral;

    return (
        <div className={`flex flex-col gap-1.5 p-3 rounded-xl border ${c.border} ${c.bg} transition-all hover:scale-[1.02] hover:bg-opacity-20`}>
            <div className="flex items-center justify-between">
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{label}</span>
                <div className={`w-1.5 h-1.5 rounded-full ${c.text.replace('text-', 'bg-')} shadow-[0_0_8px_currentColor]`} />
            </div>
            <div className="flex items-baseline gap-1">
                <span className={`text-base font-black tabular-nums ${c.text}`}>{value}</span>
                {suffix && <span className="text-[10px] font-bold text-slate-600">{suffix}</span>}
            </div>
        </div>
    );
}

function MatrixSection({ title, icon: Icon, children }) {
    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2.5 px-1">
                <div className="p-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20">
                    <Icon className="w-4 h-4 text-blue-400" />
                </div>
                <h3 className="text-xs font-black text-white uppercase tracking-[0.2em]">{title}</h3>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
                {children}
            </div>
        </div>
    );
}

export default function IndicatorMatrix({ indicators }) {
    if (!indicators) return (
        <div className="flex flex-col items-center justify-center py-20 text-slate-500 gap-4">
            <Loader2 className="w-10 h-10 animate-spin" />
            <p className="text-xs font-black uppercase tracking-widest">Synthesizing Technical Matrix...</p>
        </div>
    );

    const getStatus = (key, val) => {
        if (key === 'RSI') return val > 60 ? 'bull' : val < 40 ? 'bear' : 'neutral';
        if (key === 'MACD_diff') return val > 0 ? 'bull' : val < 0 ? 'bear' : 'neutral';
        if (key === 'EMA_Cross') return val === 1 ? 'bull' : 'bear';
        if (key === 'Above_MA50') return val === 1 ? 'bull' : 'bear';
        if (key === 'Above_MA200') return val === 1 ? 'bull' : 'bear';
        if (key === 'CMF') return val > 0 ? 'bull' : val < 0 ? 'bear' : 'neutral';
        if (key === 'Stoch_K') return val > 80 ? 'bull' : val < 20 ? 'bear' : 'neutral';
        if (key === 'Williams_R') return val > -20 ? 'bull' : val < -80 ? 'bear' : 'neutral';
        if (key === 'ROC_3' || key === 'ROC_6') return val > 0 ? 'bull' : val < 0 ? 'bear' : 'neutral';
        if (key === 'Volume_Surge') return val === 1 ? 'bull' : 'neutral';
        if (key === 'BB_Squeeze') return val === 1 ? 'neutral' : 'neutral';
        if (key === 'ADX') return val > 25 ? 'bull' : 'neutral';
        return 'neutral';
    };

    return (
        <div className="p-3 sm:p-6 space-y-8 sm:space-y-12 animate-in fade-in duration-700">
            {/* Header Synthesis */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 sm:gap-6 p-4 sm:p-6 rounded-2xl sm:rounded-3xl bg-blue-600/5 border border-blue-500/10">
                <div className="space-y-1">
                    <h2 className="text-xl sm:text-2xl font-black text-white tracking-tighter leading-tight">Technical DNA Matrix</h2>
                    <p className="text-[8px] sm:text-[10px] font-bold text-slate-500 uppercase tracking-widest">Multi-Factor Synthesis</p>
                </div>
                <div className="flex gap-2 sm:gap-4">
                    <div className="flex-1 md:flex-none flex flex-col items-center px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl sm:rounded-2xl bg-black/40 border border-white/5">
                        <span className="text-[7px] sm:text-[8px] font-black text-slate-500 uppercase mb-0.5 sm:mb-1">Momentum</span>
                        <span className="text-sm sm:text-lg font-black text-emerald-400">{(indicators.RSI > 50 ? 'BULL' : 'BEAR')}</span>
                    </div>
                    <div className="flex-1 md:flex-none flex flex-col items-center px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl sm:rounded-2xl bg-black/40 border border-white/5">
                        <span className="text-[7px] sm:text-[8px] font-black text-slate-500 uppercase mb-0.5 sm:mb-1">Volatility</span>
                        <span className="text-sm sm:text-lg font-black text-blue-400">{(indicators.BB_Width * 100).toFixed(1)}%</span>
                    </div>
                </div>
            </div>

            {/* 1. Momentum Cluster */}
            <MatrixSection title="Momentum Cluster" icon={Zap}>
                <MatrixCell label="RSI (14)" value={fmt(indicators.RSI, 1)} status={getStatus('RSI', indicators.RSI)} />
                <MatrixCell label="Stoch %K" value={fmt(indicators.Stoch_K, 1)} status={getStatus('Stoch_K', indicators.Stoch_K)} />
                <MatrixCell label="Stoch %D" value={fmt(indicators.Stoch_D, 1)} status="neutral" />
                <MatrixCell label="Williams %R" value={fmt(indicators.Williams_R, 1)} status={getStatus('Williams_R', indicators.Williams_R)} />
                <MatrixCell label="ROC (3D)" value={pct(indicators.ROC_3)} status={getStatus('ROC_3', indicators.ROC_3)} />
                <MatrixCell label="ROC (6D)" value={pct(indicators.ROC_6)} status={getStatus('ROC_6', indicators.ROC_6)} />
                <MatrixCell label="Momentum (5)" value={pct(indicators.Momentum_5)} status="neutral" />
                <MatrixCell label="RSI Slope" value={fmt(indicators.RSI_Slope, 1)} status="neutral" />
            </MatrixSection>

            {/* 2. Trend Architecture */}
            <MatrixSection title="Trend Architecture" icon={TrendingUp}>
                <MatrixCell label="EMA 9" value={fmt(indicators.EMA_9)} status={indicators.Close > indicators.EMA_9 ? 'bull' : 'bear'} />
                <MatrixCell label="EMA 21" value={fmt(indicators.EMA_21)} status={indicators.Close > indicators.EMA_21 ? 'bull' : 'bear'} />
                <MatrixCell label="MA 50" value={fmt(indicators.MA_50)} status={getStatus('Above_MA50', indicators.Above_MA50)} />
                <MatrixCell label="MA 200" value={fmt(indicators.MA_200)} status={getStatus('Above_MA200', indicators.Above_MA200)} />
                <MatrixCell label="ADX (Trend)" value={fmt(indicators.ADX, 1)} status={getStatus('ADX', indicators.ADX)} />
                <MatrixCell label="MACD Diff" value={fmt(indicators.MACD_diff, 2)} status={getStatus('MACD_diff', indicators.MACD_diff)} />
                <MatrixCell label="EMA Cross" value={indicators.EMA_Cross === 1 ? "BULL" : "BEAR"} status={getStatus('EMA_Cross', indicators.EMA_Cross)} />
            </MatrixSection>

            {/* 3. Volatility & Risk */}
            <MatrixSection title="Volatility Dynamics" icon={Shield}>
                <MatrixCell label="ATR" value={fmt(indicators.ATR, 1)} status="neutral" />
                <MatrixCell label="ATR Ratio" value={pct(indicators.ATR_Ratio)} status="neutral" />
                <MatrixCell label="BB Width" value={pct(indicators.BB_Width)} status="neutral" />
                <MatrixCell label="BB %B" value={fmt(indicators.BB_pct_B, 2)} status="neutral" />
                <MatrixCell label="BB Squeeze" value={indicators.BB_Squeeze === 1 ? "ACTIVE" : "NO"} status={indicators.BB_Squeeze === 1 ? "bull" : "neutral"} />
                <MatrixCell label="Daily Vol." value={pct(indicators.Volatility)} status="neutral" />
            </MatrixSection>

            {/* 4. Volume & Liquidity */}
            <MatrixSection title="Liquidity & Flow" icon={BarChart3}>
                <MatrixCell label="Chaikin (CMF)" value={fmt(indicators.CMF, 2)} status={getStatus('CMF', indicators.CMF)} />
                <MatrixCell label="OBV Ratio" value={fmt(indicators.OBV_Ratio, 2)} status={indicators.OBV_Ratio > 1 ? 'bull' : 'bear'} />
                <MatrixCell label="Vol. Ratio" value={fmt(indicators.Volume_Ratio, 1)} status={indicators.Volume_Ratio > 1.2 ? 'bull' : 'neutral'} />
                <MatrixCell label="Vol. Surge" value={indicators.Volume_Surge === 1 ? "YES" : "NO"} status={indicators.Volume_Surge === 1 ? "bull" : "neutral"} />
                <MatrixCell label="VWAP Ratio" value={fmt(indicators.VWAP_Ratio, 2)} status={indicators.VWAP_Ratio > 1 ? 'bull' : 'bear'} />
            </MatrixSection>

            {/* 5. Structure & Levels */}
            <MatrixSection title="Structure & Levels" icon={Layers}>
                <MatrixCell label="Support" value={fmt(indicators.Support, 0)} status="neutral" />
                <MatrixCell label="Resistance" value={fmt(indicators.Resistance, 0)} status="neutral" />
                <MatrixCell label="Candle Body" value={pct(indicators.Candle_Body)} status={indicators.Candle_Body > 0 ? 'bull' : 'bear'} />
                <MatrixCell label="Consec. Trend" value={indicators.Consec_Up || indicators.Consec_Down} status={indicators.Consec_Up > 0 ? 'bull' : 'bear'} suffix="DAYS" />
            </MatrixSection>

            <div className="flex gap-2 sm:gap-3 p-3 sm:p-4 rounded-xl sm:rounded-2xl bg-blue-500/5 border border-blue-500/10">
                <Info className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
                <p className="text-[9px] sm:text-[11px] text-slate-400 leading-relaxed font-medium">
                    DNA Matrix synthesizes <span className="text-white font-bold">40+ signals</span>. Green indicators represent bullish convergence, red represents bearish distribution.
                </p>
            </div>
        </div>
    );
}
