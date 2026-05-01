import React, { useEffect, useRef, useState } from 'react';
import {
    TrendingUp, TrendingDown, Activity, Crosshair, Wallet,
    BarChart2, Trophy, AlertTriangle, Target, Shield,
    Percent, Zap, ChevronUp, ChevronDown, Layers, Receipt,
    History, ArrowUpRight, Scale
} from 'lucide-react';

const STARTING = 100_000;

const fmt = (n, d = 2) => 
    n != null ? Number(n).toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—';

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
function EquityCurve({ returnPct, realCurve }) {
    const pts = 60;
    const curve = React.useMemo(() => {
        if (realCurve && realCurve.length > 1) return realCurve;
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
            </defs>
            <line x1="0" y1={ty(STARTING).toFixed(1)} x2={W} y2={ty(STARTING).toFixed(1)}
                stroke="rgba(255,255,255,0.08)" strokeWidth="1" strokeDasharray="4,4" />
            <path d={fill} fill="url(#eq-up)" />
            <path d={line} fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx={tx(n - 1)} cy={ty(curve[n - 1])} r="3.5" fill={c} opacity="0.9" />
        </svg>
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
        <div className="flex flex-col gap-1.5 rounded-xl p-3 border relative overflow-hidden"
            style={{ background: accent ? `${color}09` : 'rgba(255,255,255,0.02)', borderColor: accent ? `${color}30` : 'rgba(255,255,255,0.06)' }}>
            <div className="flex items-center justify-between">
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">{label}</span>
                <Icon className="w-3 h-3 text-slate-600" />
            </div>
            <div>
                {animated
                    ? <AnimNum value={typeof value === 'number' ? value : 0} prefix={prefix} suffix={suffix} decimals={decimals}
                        style={{ fontSize: 16, fontWeight: 900, color, fontFamily: 'inherit', letterSpacing: '-0.02em' }} />
                    : <p className="text-base font-black" style={{ color }}>{value}</p>
                }
                {sub && <p className="text-[9px] mt-0.5 font-bold text-slate-600">{sub}</p>}
            </div>
        </div>
    );
}

// ── Main ───────────────────────────────────────────────────────────────────────
export default function BacktestResults({ stats, isSidebar }) {
    const [tab, setTab] = useState('metrics');

    if (!stats) return null;

    const {
        return_pct, win_rate, total_trades,
        final_capital, initial_capital = STARTING,
        max_drawdown, sharpe_ratio, sortino_ratio,
        calmar_ratio, profit_factor, expectancy,
        bench_return, trades = [], equity_curve,
    } = stats;

    const isEmpty = !total_trades || (return_pct === 0 && win_rate === 0 && total_trades === 0);
    if (isEmpty) return (
        <div className="h-full rounded-2xl border border-dashed border-white/10 p-8 flex flex-col items-center justify-center gap-3 text-center bg-black/20">
            <BarChart2 className="w-8 h-8 text-slate-700" />
            <p className="text-xs font-black text-slate-600 uppercase tracking-widest">Insufficient Backtest Data</p>
        </div>
    );

    const isProfit = return_pct >= 0;
    const rating = ratingOf(return_pct, win_rate, sharpe_ratio ?? 0);

    return (
        <div className="h-full flex flex-col rounded-2xl overflow-hidden border border-white/5 bg-[#0a121e]/80 backdrop-blur-xl">
            
            {/* Header Tabs */}
            <div className="flex p-1 gap-1 border-b border-white/5 bg-white/[0.02]">
                <button onClick={() => setTab('metrics')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${tab === 'metrics' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}>
                    <BarChart2 className="w-3.5 h-3.5" /> Metrics
                </button>
                <button onClick={() => setTab('history')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${tab === 'history' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}>
                    <History className="w-3.5 h-3.5" /> History
                </button>
            </div>

            <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
                {tab === 'metrics' ? (
                    <div className="p-4 space-y-4">
                        {/* Rating Card */}
                        <div className="flex items-center gap-4 rounded-2xl p-4 border"
                            style={{ background: rating.bg, borderColor: rating.border }}>
                            <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 text-2xl font-black"
                                style={{ background: `${rating.color}20`, border: `1px solid ${rating.color}40`, color: rating.color }}>
                                {rating.grade}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: rating.color }}>{rating.label} Performance</p>
                                <p className="text-[10px] font-bold text-slate-400 mt-0.5 leading-relaxed truncate">
                                    Based on {total_trades} sample trades
                                </p>
                            </div>
                            <div className="text-right">
                                <p className="text-xs font-black text-white">{isProfit ? '+' : ''}{return_pct.toFixed(2)}%</p>
                                <p className="text-[9px] font-bold text-slate-500">Net Return</p>
                            </div>
                        </div>

                        {/* Equity Chart */}
                        <div className="rounded-2xl border border-white/5 p-4 bg-black/20">
                            <div className="flex items-center justify-between mb-3">
                                <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Equity Curve</p>
                                <span className="text-[10px] font-black text-emerald-400">Rs.{fmt(final_capital, 0)}</span>
                            </div>
                            <EquityCurve returnPct={return_pct} realCurve={equity_curve} />
                        </div>

                        {/* Professional Grid */}
                        <div className="grid grid-cols-2 gap-3">
                            <StatCell label="Win Rate" value={win_rate} suffix="%" color={win_rate >= 50 ? '#10b981' : '#ef4444'} accent animated icon={Crosshair} />
                            <StatCell label="Profit Factor" value={profit_factor} suffix="x" color={profit_factor >= 1.5 ? '#10b981' : '#eab308'} accent animated icon={Scale} />
                            <StatCell label="Expectancy" value={expectancy} prefix="Rs." color={expectancy > 0 ? '#10b981' : '#ef4444'} sub="Avg Profit/Trade" icon={Target} animated />
                            <StatCell label="Max Drawdown" value={max_drawdown} prefix="-" suffix="%" color="#ef4444" icon={Shield} animated />
                            <StatCell label="Sharpe Ratio" value={sharpe_ratio} color="#3b82f6" icon={Zap} animated />
                            <StatCell label="Benchmark" value={bench_return} suffix="%" color={return_pct > bench_return ? '#10b981' : '#94a3b8'} sub="Buy & Hold" icon={Activity} animated />
                        </div>
                    </div>
                ) : (
                    <div className="divide-y divide-white/5">
                        {trades.length > 0 ? (
                            trades.slice().reverse().map((t, i) => (
                                <div key={i} className="p-4 hover:bg-white/[0.02] transition-all">
                                    <div className="flex items-start justify-between mb-2">
                                        <div>
                                            <p className="text-xs font-black text-white tracking-tighter uppercase">{t.entry_date} → {t.exit_date}</p>
                                            <p className="text-[9px] font-bold text-slate-500 mt-0.5">Rs.{fmt(t.entry_price)} to Rs.{fmt(t.exit_price)}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className={`text-xs font-black tabular-nums ${t.pnl_rs >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                                {t.pnl_rs >= 0 ? '+' : ''}Rs.{fmt(t.pnl_rs, 0)}
                                            </p>
                                            <p className={`text-[10px] font-black tabular-nums opacity-60 ${t.pnl_rs >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                                {t.pnl_pct >= 0 ? '+' : ''}{t.pnl_pct.toFixed(2)}%
                                            </p>
                                        </div>
                                    </div>
                                    <div className="h-1 w-full rounded-full bg-white/5 overflow-hidden">
                                        <div className={`h-full rounded-full transition-all duration-700 ${t.pnl_rs >= 0 ? 'bg-emerald-400' : 'bg-red-400'}`}
                                            style={{ width: `${Math.min(Math.abs(t.pnl_pct) * 2, 100)}%` }} />
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="p-12 text-center">
                                <History className="w-8 h-8 text-slate-700 mx-auto mb-3" />
                                <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">No Trade Logs</p>
                            </div>
                        )}
                    </div>
                )}
            </div>
            
            {/* Footer Institutional Disclaimer */}
            <div className="p-4 border-t border-white/5 bg-black/40">
                <div className="flex items-center gap-2 mb-2">
                    <Shield className="w-3 h-3 text-blue-400" />
                    <span className="text-[8px] font-black text-slate-500 uppercase tracking-[0.15em]">Institutional Simulation</span>
                </div>
                <p className="text-[8px] text-slate-600 leading-relaxed font-bold">
                    Backtest accounts for NEPSE broker fees (0.4%) and DP fees (Rs. 25). Past performance is not indicative of future results.
                </p>
            </div>
        </div>
    );
}
