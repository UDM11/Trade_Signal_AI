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
export default function BacktestResults({ stats }) {
    if (!stats) return null;

    const {
        return_pct, win_rate, total_trades,
        final_capital, initial_capital = STARTING,
        max_drawdown, sharpe_ratio,
        calmar_ratio, profit_factor, commission_paid,
        equity_curve,
    } = stats;

    const isProfit    = return_pct >= 0;
    const pnl         = final_capital - initial_capital;
    const pnlAbs      = Math.abs(pnl);
    const wins        = Math.round(total_trades * win_rate / 100);
    const losses      = total_trades - wins;
    // Use real profit_factor from backend if available, else approximate
    const profitFactor = profit_factor ?? (losses > 0 && wins > 0 ? (wins / losses) * 1.1 : 0);

    const rating = ratingOf(return_pct, win_rate, sharpe_ratio ?? 0);
    const RatingIcon = rating.icon;

    return (
        <div className="rounded-2xl overflow-hidden border border-white/5 shadow-2xl"
            style={{ background: '#080f1a' }}>

            {/* ── Header ──────────────────────────────────────────────────── */}
            <div className="px-5 sm:px-6 pt-5 pb-4 border-b border-white/5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl" style={{ background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.2)' }}>
                        <BarChart2 className="w-4 h-4 text-blue-400" />
                    </div>
                    <div>
                        <h2 className="text-sm font-bold text-white leading-tight">Strategy Backtest</h2>
                        <p className="text-[11px]" style={{ color: '#475569' }}>
                            Simulated on full dataset · Rs.&nbsp;{initial_capital.toLocaleString()} starting capital
                        </p>
                    </div>
                </div>

                {/* Return badge */}
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl shrink-0 text-sm font-black"
                    style={{ background: isProfit ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)', border: `1px solid ${isProfit ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`, color: isProfit ? '#10b981' : '#ef4444' }}>
                    {isProfit ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    {isProfit ? '+' : ''}{return_pct.toFixed(2)}%
                </div>
            </div>

            <div className="p-5 sm:p-6 space-y-4">

                {/* ── Equity Curve ──────────────────────────────────────────── */}
                <div className="rounded-xl border border-white/5 px-4 pt-3 pb-2 overflow-hidden"
                    style={{ background: 'rgba(255,255,255,0.02)' }}>
                    <div className="flex items-start justify-between mb-1">
                        <div>
                            <div className="flex items-center gap-1.5">
                                <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: '#475569' }}>Equity Curve</p>
                                {equity_curve?.length > 1 && (
                                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981' }}>
                                        REAL DATA
                                    </span>
                                )}
                            </div>
                            <p className="text-[11px] font-bold mt-0.5" style={{ color: isProfit ? '#10b981' : '#ef4444' }}>
                                {isProfit ? '+' : '−'}Rs.&nbsp;{pnlAbs.toLocaleString('en-IN', { maximumFractionDigits: 0 })} P&amp;L
                            </p>
                        </div>
                        <div className="text-right">
                            <p className="text-[10px]" style={{ color: '#475569' }}>Final</p>
                            <p className="text-xs font-black text-white">Rs.&nbsp;{final_capital.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
                        </div>
                    </div>
                    <EquityCurve returnPct={return_pct} trades={total_trades} winRate={win_rate} realCurve={equity_curve} />
                    <div className="flex justify-between text-[10px] mt-1" style={{ color: '#334155' }}>
                        <span>Rs.&nbsp;{initial_capital.toLocaleString()}</span>
                        <span>Rs.&nbsp;{final_capital.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                    </div>
                </div>

                {/* ── Primary metrics grid ──────────────────────────────────── */}
                <div className="grid grid-cols-2 gap-3">
                    <StatCell
                        icon={isProfit ? TrendingUp : TrendingDown}
                        label="Total Return"
                        value={return_pct}
                        prefix={isProfit ? '+' : ''}
                        suffix="%"
                        sub={`Rs. ${pnlAbs.toLocaleString('en-IN', { maximumFractionDigits: 0 })} ${isProfit ? 'profit' : 'loss'}`}
                        color={isProfit ? '#10b981' : '#ef4444'}
                        accent animated decimals={2}
                    />
                    <StatCell
                        icon={Crosshair}
                        label="Win Rate"
                        value={win_rate}
                        suffix="%"
                        sub={`${wins}W / ${losses}L of ${total_trades} trades`}
                        color={win_rate >= 55 ? '#10b981' : win_rate >= 45 ? '#eab308' : '#ef4444'}
                        accent animated decimals={1}
                    />
                    <StatCell
                        icon={Activity}
                        label="Total Trades"
                        value={total_trades}
                        sub="Buy → Sell cycles"
                        color="#3b82f6"
                        animated prefix="" suffix="" decimals={0}
                    />
                    <StatCell
                        icon={Wallet}
                        label="Final Capital"
                        value={final_capital}
                        prefix="Rs. "
                        suffix=""
                        sub={`Started Rs. ${initial_capital.toLocaleString()}`}
                        color="#94a3b8"
                        animated decimals={0}
                    />
                </div>

                {/* ── Secondary metrics ─────────────────────────────────────── */}
                <div className="grid grid-cols-2 gap-3">
                    {max_drawdown != null && (
                        <StatCell
                            icon={Shield}
                            label="Max Drawdown"
                            value={max_drawdown}
                            prefix="-"
                            suffix="%"
                            sub="Worst peak-to-trough drop"
                            color="#ef4444"
                            animated decimals={2}
                        />
                    )}
                    {sharpe_ratio != null && (
                        <StatCell
                            icon={Zap}
                            label="Sharpe Ratio"
                            value={sharpe_ratio}
                            sub={sharpe_ratio >= 1.5 ? 'Excellent risk-adj.' : sharpe_ratio >= 0.5 ? 'Acceptable' : 'Below average'}
                            color={sharpe_ratio >= 1.5 ? '#10b981' : sharpe_ratio >= 0.5 ? '#eab308' : '#ef4444'}
                            animated decimals={2}
                        />
                    )}
                    {calmar_ratio != null && (
                        <StatCell
                            icon={Layers}
                            label="Calmar Ratio"
                            value={calmar_ratio}
                            sub={calmar_ratio >= 1.5 ? 'Strong risk-adj. return' : calmar_ratio >= 0.5 ? 'Acceptable' : 'High drawdown risk'}
                            color={calmar_ratio >= 1.5 ? '#10b981' : calmar_ratio >= 0.5 ? '#eab308' : '#ef4444'}
                            animated decimals={2}
                        />
                    )}
                    <StatCell
                        icon={Percent}
                        label="Profit Factor"
                        value={profitFactor > 0 ? profitFactor.toFixed(2) : '—'}
                        sub={profitFactor >= 2 ? 'Strong edge' : profitFactor >= 1 ? 'Positive edge' : 'No edge'}
                        color={profitFactor >= 2 ? '#10b981' : profitFactor >= 1 ? '#eab308' : '#ef4444'}
                    />
                    {commission_paid != null && commission_paid > 0 && (
                        <StatCell
                            icon={Receipt}
                            label="Commission Paid"
                            value={`Rs. ${commission_paid.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
                            sub="NEPSE 0.4% per trade side"
                            color="#64748b"
                        />
                    )}
                </div>

                {/* ── Win/loss bar ──────────────────────────────────────────── */}
                <div className="rounded-xl p-4 border border-white/5"
                    style={{ background: 'rgba(255,255,255,0.02)' }}>
                    <p className="text-[10px] font-semibold uppercase tracking-widest mb-3" style={{ color: '#475569' }}>
                        Win / Loss Distribution
                    </p>
                    <WinLossBar winRate={win_rate} totalTrades={total_trades} />
                </div>

                {/* ── Strategy rating ───────────────────────────────────────── */}
                <div className="flex items-center gap-3 rounded-xl p-4 border"
                    style={{ background: rating.bg, borderColor: rating.border }}>
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 text-2xl font-black"
                        style={{ background: `${rating.color}20`, border: `1px solid ${rating.color}40`, color: rating.color }}>
                        {rating.grade}
                    </div>
                    <div className="flex-1">
                        <p className="text-sm font-black" style={{ color: rating.color }}>
                            {rating.label} Strategy
                        </p>
                        <p className="text-[11px] mt-0.5" style={{ color: '#475569' }}>
                            {rating.label === 'Excellent' && 'Strong returns, good win rate, solid risk-adjusted performance.'}
                            {rating.label === 'Good'      && 'Profitable strategy with room for optimization.'}
                            {rating.label === 'Average'   && 'Marginal performance — consider refining entry/exit rules.'}
                            {rating.label === 'Poor'      && 'Strategy underperformed — more data or tuning needed.'}
                        </p>
                    </div>
                    <RatingIcon className="w-5 h-5 shrink-0" style={{ color: rating.color }} />
                </div>

                {/* ── Disclaimer ────────────────────────────────────────────── */}
                <p className="text-[10px] text-center px-2 leading-relaxed" style={{ color: '#334155' }}>
                    Backtest is simulated on historical data and does not guarantee future results.
                    Past performance is not indicative of future returns.
                </p>
            </div>
        </div>
    );
}
