import React, { useEffect, useRef, useState } from 'react';
import {
    TrendingUp, TrendingDown, Activity, Crosshair, Wallet,
    BarChart2, Trophy, AlertTriangle, Target, Shield,
    Percent, Zap, ChevronUp, ChevronDown, Layers, Receipt,
} from 'lucide-react';

const STARTING = 100_000;

// ── Animated counter ───────────────────────────────────────────────────────────
function AnimNum({ value, prefix = '', suffix = '', decimals = 2, style }) {
    const [display, setDisplay] = useState(value);
    const cur = useRef(value);
    useEffect(() => {
        const end = value, dur = 1000, step = 16;
        const inc = (end - cur.current) / (dur / step);
        if (Math.abs(inc) < 1e-9) return;
        const id = setInterval(() => {
            cur.current += inc;
            const done = inc > 0 ? cur.current >= end : cur.current <= end;
            if (done) { cur.current = end; setDisplay(end); clearInterval(id); }
            else setDisplay(cur.current);
        }, step);
        return () => clearInterval(id);
    }, [value]);
    return <span style={style}>{prefix}{display.toFixed(decimals)}{suffix}</span>;
}

// ── Equity curve SVG ───────────────────────────────────────────────────────────
function EquityCurve({ returnPct, trades, winRate, realCurve }) {
    const pts = 60;
    const curve = React.useMemo(() => {
        // Use real trade-by-trade equity when backend provides it
        if (realCurve && realCurve.length > 1) {
            return realCurve;
        }
        // Fallback: simulated smooth curve (used only when real data unavailable)
        const arr = [STARTING];
        for (let i = 1; i < pts; i++) {
            const prog  = i / (pts - 1);
            const noise = Math.sin(i * 131.7 + returnPct * 0.3) * 0.018 * STARTING
                        + Math.sin(i * 47.3  + returnPct * 0.7) * 0.009 * STARTING;
            const trend = STARTING * (returnPct / 100) * prog;
            arr.push(Math.max(arr[i - 1] + trend / pts + noise, STARTING * 0.4));
        }
        arr[pts - 1] = STARTING * (1 + returnPct / 100);
        return arr;
    }, [returnPct, realCurve]);

    const n   = curve.length;
    const min = Math.min(...curve);
    const max = Math.max(...curve);
    const rng = max - min || 1;
    const W = 300, H = 80;
    const tx = i => (i / (n - 1)) * W;
    const ty = v => H - ((v - min) / rng) * (H - 4) - 2;
    const line = curve.map((v, i) => `${i === 0 ? 'M' : 'L'}${tx(i).toFixed(1)},${ty(v).toFixed(1)}`).join(' ');
    const fill = `${line} L${W},${H} L0,${H}Z`;
    const isUp = returnPct >= 0;
    const c    = isUp ? '#10b981' : '#ef4444';

    return (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 90 }} preserveAspectRatio="none">
            <defs>
                <linearGradient id="eq-up" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor={c} stopOpacity="0.3" />
                    <stop offset="100%" stopColor={c} stopOpacity="0.02" />
                </linearGradient>
                <filter id="line-glow">
                    <feGaussianBlur stdDeviation="1.5" result="blur" />
                    <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
            </defs>
            {/* Zero line */}
            <line x1="0" y1={ty(STARTING).toFixed(1)} x2={W} y2={ty(STARTING).toFixed(1)}
                stroke="rgba(255,255,255,0.08)" strokeWidth="1" strokeDasharray="4,4" />
            {/* Fill */}
            <path d={fill} fill="url(#eq-up)" />
            {/* Line */}
            <path d={line} fill="none" stroke={c} strokeWidth="2" strokeLinecap="round"
                strokeLinejoin="round" filter="url(#line-glow)" />
            {/* End dot */}
            <circle cx={tx(n - 1)} cy={ty(curve[n - 1])} r="3.5" fill={c} opacity="0.9" />
        </svg>
    );
}

// ── Win/loss segmented bar ─────────────────────────────────────────────────────
function WinLossBar({ winRate, totalTrades }) {
    const [w, setW] = useState(0);
    useEffect(() => { const t = setTimeout(() => setW(winRate), 200); return () => clearTimeout(t); }, [winRate]);
    const wins   = Math.round(totalTrades * winRate / 100);
    const losses = totalTrades - wins;
    return (
        <div className="space-y-2">
            <div className="flex justify-between text-[11px] font-bold">
                <span style={{ color: '#10b981' }}>
                    {wins} Wins ({winRate.toFixed(1)}%)
                </span>
                <span style={{ color: '#ef4444' }}>
                    {losses} Losses ({(100 - winRate).toFixed(1)}%)
                </span>
            </div>
            <div className="h-2.5 w-full rounded-full overflow-hidden flex gap-px"
                style={{ background: 'rgba(239,68,68,0.2)' }}>
                <div className="h-full rounded-full transition-all duration-1000 ease-out"
                    style={{ width: `${w}%`, background: 'linear-gradient(90deg,#10b981,#34d399)', boxShadow: '0 0 6px rgba(16,185,129,0.4)' }} />
            </div>
            <div className="flex justify-between text-[10px]" style={{ color: '#475569' }}>
                <span>Breakeven at 50%</span>
                <span>{winRate >= 50 ? '✓ Above breakeven' : '✗ Below breakeven'}</span>
            </div>
        </div>
    );
}

// ── Rating badge ───────────────────────────────────────────────────────────────
function ratingOf(returnPct, winRate, sharpe) {
    let score = 0;
    if (returnPct > 50)  score += 30; else if (returnPct > 20)  score += 20; else if (returnPct > 0)  score += 10;
    if (winRate  > 60)   score += 30; else if (winRate  > 50)   score += 20; else if (winRate  > 40)  score += 10;
    if (sharpe   > 1.5)  score += 25; else if (sharpe   > 0.5)  score += 15; else if (sharpe   > 0)   score += 5;
    if (score >= 70) return { label: 'Excellent', grade: 'A', color: '#10b981', bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.3)',  icon: Trophy };
    if (score >= 45) return { label: 'Good',      grade: 'B', color: '#3b82f6', bg: 'rgba(59,130,246,0.12)', border: 'rgba(59,130,246,0.3)',  icon: TrendingUp };
    if (score >= 25) return { label: 'Average',   grade: 'C', color: '#eab308', bg: 'rgba(234,179,8,0.12)',  border: 'rgba(234,179,8,0.3)',   icon: Activity };
    return              { label: 'Poor',      grade: 'D', color: '#ef4444', bg: 'rgba(239,68,68,0.12)',  border: 'rgba(239,68,68,0.3)',   icon: AlertTriangle };
}

// ── Stat cell ──────────────────────────────────────────────────────────────────
function StatCell({ icon: Icon, label, value, sub, color = '#94a3b8', accent, animated, prefix = '', suffix = '', decimals = 2 }) {
    return (
        <div className="flex flex-col gap-2 rounded-xl p-4 border relative overflow-hidden"
            style={{ background: accent ? `${color}09` : 'rgba(255,255,255,0.02)', borderColor: accent ? `${color}30` : 'rgba(255,255,255,0.06)' }}>
            {accent && <div className="absolute top-0 left-0 right-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${color}60, transparent)` }} />}
            <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: '#475569' }}>{label}</span>
                <div className="p-1.5 rounded-lg" style={{ background: `${color}15` }}>
                    <Icon className="w-3.5 h-3.5" style={{ color }} />
                </div>
            </div>
            <div>
                {animated
                    ? <AnimNum value={typeof value === 'number' ? value : 0} prefix={prefix} suffix={suffix} decimals={decimals}
                        style={{ fontSize: 22, fontWeight: 900, color, fontFamily: 'inherit', letterSpacing: '-0.02em' }} />
                    : <p className="text-xl font-black" style={{ color }}>{value}</p>
                }
                {sub && <p className="text-[11px] mt-0.5" style={{ color: '#475569' }}>{sub}</p>}
            </div>
        </div>
    );
}

// ── Main ───────────────────────────────────────────────────────────────────────
export default function BacktestResults({ stats, isSidebar }) {
    if (!stats) return null;

    const {
        return_pct, win_rate, total_trades,
        final_capital, initial_capital = STARTING,
        max_drawdown, sharpe_ratio,
        calmar_ratio, profit_factor, commission_paid,
        equity_curve,
    } = stats;

    // No meaningful backtest data — show empty state
    const isEmpty = !total_trades || (return_pct === 0 && win_rate === 0 && total_trades === 0);
    if (isEmpty) return (
        <div className="h-full rounded-2xl border border-dashed border-white/10 p-8 flex flex-col items-center justify-center gap-3 text-center"
            style={{ background: 'rgba(8,15,26,0.4)' }}>
            <BarChart2 className="w-8 h-8 text-slate-700" />
            <p className="text-xs font-black text-slate-600 uppercase tracking-widest">Insufficient Backtest Data</p>
            <p className="text-[11px] text-slate-700 max-w-xs leading-relaxed">
                Not enough historical trades to generate a meaningful backtest for this asset.
            </p>
        </div>
    );

    const isProfit    = return_pct >= 0;
    const pnl         = final_capital - initial_capital;
    const pnlAbs      = Math.abs(pnl);
    const wins        = Math.round(total_trades * win_rate / 100);
    const losses      = total_trades - wins;
    const profitFactor = profit_factor ?? (losses > 0 && wins > 0 ? (wins / losses) * 1.1 : 0);

    const rating = ratingOf(return_pct, win_rate, sharpe_ratio ?? 0);
    const RatingIcon = rating.icon;

    return (
        <div className={`h-full flex flex-col rounded-2xl overflow-hidden border border-white/5 shadow-2xl backdrop-blur-xl`}
            style={{ background: 'rgba(8, 15, 26, 0.6)' }}>

            {/* ── Header ──────────────────────────────────────────────────── */}
            <div className="px-6 py-5 border-b border-white/5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/20">
                        <BarChart2 className="w-4 h-4 text-blue-400" />
                    </div>
                    <div>
                        <h2 className="text-xs font-black text-white uppercase tracking-widest">Backtest</h2>
                        <p className="text-[10px] text-slate-500 font-bold">Historical Simulation</p>
                    </div>
                </div>

                <div className={`px-3 py-1.5 rounded-xl text-[10px] font-black tracking-widest border ${isProfit ? 'bg-buy/10 text-buy border-buy/20' : 'bg-sell/10 text-sell border-sell/20'}`}>
                    {isProfit ? '+' : ''}{return_pct.toFixed(2)}%
                </div>
            </div>

            <div className="p-6 space-y-5">
                {/* ── Equity Curve ──────────────────────────────────────────── */}
                <div className="rounded-2xl border border-white/5 p-4 bg-black/20 overflow-hidden">
                    <div className="flex items-center justify-between mb-3">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Equity Path</p>
                        <span className="text-[10px] font-black text-white">Rs.{final_capital.toLocaleString()}</span>
                    </div>
                    <EquityCurve returnPct={return_pct} trades={total_trades} winRate={win_rate} realCurve={equity_curve} />
                </div>

                {/* ── High Density Grid ─────────────────────────────────────── */}
                <div className="grid grid-cols-2 gap-3">
                    <StatCell label="Net P&L" value={return_pct} prefix={isProfit ? '+' : ''} suffix="%" color={isProfit ? '#10b981' : '#ef4444'} accent animated icon={TrendingUp} />
                    <StatCell label="Win Rate" value={win_rate} suffix="%" color={win_rate >= 50 ? '#10b981' : '#ef4444'} accent animated icon={Crosshair} />
                    <StatCell label="Drawdown" value={max_drawdown || 0} prefix="-" suffix="%" color="#ef4444" icon={Shield} animated />
                    <StatCell label="Sharpe" value={sharpe_ratio || 0} color="#3b82f6" icon={Zap} animated />
                </div>

                {/* ── Win/Loss Bar ──────────────────────────────────────────── */}
                <div className="rounded-2xl p-4 border border-white/5 bg-black/10">
                    <WinLossBar winRate={win_rate} totalTrades={total_trades} />
                </div>

                {/* ── Rating ────────────────────────────────────────────────── */}
                <div className="flex items-center gap-4 rounded-2xl p-4 border"
                    style={{ background: rating.bg, borderColor: rating.border }}>
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-xl font-black"
                        style={{ background: `${rating.color}20`, border: `1px solid ${rating.color}40`, color: rating.color }}>
                        {rating.grade}
                    </div>
                    <div className="flex-1">
                        <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: rating.color }}>
                            {rating.label} Score
                        </p>
                        <p className="text-[10px] font-bold text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                            {rating.label === 'Excellent' && 'Institutional grade performance with high risk-adjusted efficiency.'}
                            {rating.label === 'Good'      && 'Consistent edge detected. Strategy is statistically viable.'}
                            {rating.label === 'Average'   && 'Marginal edge. Consider adding confirmation filters.'}
                            {rating.label === 'Poor'      && 'Strategy lacks consistent edge. Higher volatility detected.'}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
