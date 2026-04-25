import React, { useState, useEffect } from 'react';
import {
    Activity, Radio, TrendingUp, TrendingDown, BarChart2, DollarSign,
    Zap, ArrowRight, ChevronUp, ChevronDown, Wifi, WifiOff,
    BarChart3, Target, Shield, Brain, Layers,
} from 'lucide-react';
import { fmt, fmtVol, chgColor } from '../utils/formatters';
import StatCard from '../components/ui/StatCard';
import MoverRow from '../components/ui/MoverRow';
import FeatureCard from '../components/ui/FeatureCard';
import { useMarketSocket } from '../hooks/useMarketSocket.jsx';

const SURFACE  = 'var(--color-glass)';
const BORDER   = 'var(--color-glass-border)';


// ── Skeleton bone ────────────────────────────────────────────────────────────
function Bone({ w = 'w-full', h = 'h-4', extra = '' }) {
    return (
        <div className={`${w} ${h} ${extra} rounded-lg animate-pulse`}
            style={{ background: 'rgba(255,255,255,0.06)' }} />
    );
}

// ── Breadth mini bar ─────────────────────────────────────────────────────────
function BreadthBar({ adv, dec, unc }) {
    const total = adv + dec + unc || 1;
    const advPct = (adv / total) * 100;
    const decPct = (dec / total) * 100;
    const uncPct = 100 - advPct - decPct;
    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between text-xs font-black uppercase tracking-widest text-slate-400">
                <span className="flex items-center gap-1.5"><Activity className="w-3.5 h-3.5" /> Market Breadth</span>
                <span>{total} stocks</span>
            </div>
            <div className="relative h-2.5 w-full rounded-full overflow-hidden flex gap-0.5 bg-white/5 p-px">
                <div className="relative h-full transition-all duration-1000 ease-out" style={{ width: `${advPct}%`, background: 'linear-gradient(90deg, #166534, #22c55e)', borderRadius: '99px', boxShadow: '0 0 10px rgba(34,197,94,0.4)' }} />
                <div className="relative h-full transition-all duration-1000 ease-out" style={{ width: `${uncPct}%`, background: '#475569', borderRadius: '99px' }} />
                <div className="relative h-full transition-all duration-1000 ease-out" style={{ width: `${decPct}%`, background: 'linear-gradient(90deg, #ef4444, #991b1b)', borderRadius: '99px', boxShadow: '0 0 10px rgba(239,68,68,0.4)' }} />
            </div>
            <div className="flex items-center justify-between pt-1">
                <div className="flex items-center gap-4">
                    <span className="flex items-center gap-1.5 text-xs font-black text-emerald-400 drop-shadow-sm">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />{adv} Up
                    </span>
                    <span className="flex items-center gap-1.5 text-xs font-black text-slate-500">
                        <span className="w-2 h-2 rounded-full bg-slate-600" />{unc} Flat
                    </span>
                    <span className="flex items-center gap-1.5 text-xs font-black text-red-400 drop-shadow-sm">
                        <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />{dec} Down
                    </span>
                </div>
                <div className="text-right">
                    <span className="text-sm font-black tabular-nums drop-shadow-md" style={{ color: adv >= dec ? '#22c55e' : '#ef4444' }}>
                        {Math.round((adv / total) * 100)}%
                    </span>
                    <span className="text-[9px] text-slate-500 font-bold uppercase block -mt-1 tracking-wider">{adv >= dec ? 'Bullish' : 'Bearish'}</span>
                </div>
            </div>
        </div>
    );
}

// ── Main HomePage ─────────────────────────────────────────────────────────────
export default function HomePage({ setPage }) {
    const [loading, setLoading] = useState(true);

    const { marketData: data, connected } = useMarketSocket();

    // Once socket sends first payload, stop showing skeleton
    useEffect(() => {
        if (data) setLoading(false);
    }, [data]);

    // Navigate to live page and optionally open a stock
    const goLive = (symbol) => {
        if (symbol) {
            window.history.pushState({}, '', `/live/${symbol}`);
        } else {
            window.history.pushState({}, '', '/live');
        }
        setPage('live');
    };

    const index   = data?.index;
    const summary = data?.summary;
    const isOpen  = data?.market_open;
    const status  = data?.market_status;
    const isPreOpen = status === 'PRE-OPEN';
    const mktColor  = isOpen ? '#22c55e' : isPreOpen ? '#f59e0b' : '#ef4444';
    const mktBg     = isOpen ? 'rgba(34,197,94,0.08)' : isPreOpen ? 'rgba(245,158,11,0.08)' : 'rgba(239,68,68,0.08)';
    const mktBorder = isOpen ? 'rgba(34,197,94,0.2)'  : isPreOpen ? 'rgba(245,158,11,0.2)'  : 'rgba(239,68,68,0.2)';
    const idxUp     = (index?.change ?? 0) >= 0;
    const idxColor  = idxUp ? '#22c55e' : '#ef4444';

    const gainers   = data?.gainers?.slice(0, 5)      ?? [];
    const losers    = data?.losers?.slice(0, 5)       ?? [];
    const turnovers = data?.top_turnovers?.slice(0, 5) ?? [];
    const volumes   = data?.top_volumes?.slice(0, 5)  ?? [];
    const adv = summary?.advancing ?? 0;
    const dec = summary?.declining ?? 0;
    const unc = summary?.unchanged ?? 0;

    if (loading) {
        return (
            <main className="max-w-7xl mx-auto space-y-6">
                {/* Hero skeleton */}
                <div className="rounded-3xl p-6 sm:p-10 flex flex-col sm:flex-row sm:items-center justify-between gap-8"
                    style={{ background: 'rgba(15,25,50,0.4)', border: `1px solid ${BORDER}` }}>
                    <div className="space-y-4 flex-1">
                        <div className="flex items-center gap-3 mb-2">
                            <Bone w="w-10" h="h-10" extra="rounded-xl" />
                            <Bone w="w-32" h="h-8" extra="rounded-xl" />
                        </div>
                        <Bone w="w-3/4 sm:w-80" h="h-10" />
                        <Bone w="w-1/2 sm:w-64" h="h-5" />
                        <div className="flex gap-3 pt-3">
                            <Bone w="w-28" h="h-10" extra="rounded-xl" />
                            <Bone w="w-32" h="h-10" extra="rounded-xl" />
                        </div>
                    </div>
                    <div className="rounded-3xl p-6 space-y-4 min-w-[240px]" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <Bone w="w-24" h="h-3" />
                        <Bone w="w-40" h="h-12" />
                        <Bone w="w-32" h="h-8" extra="rounded-xl" />
                    </div>
                </div>
                {/* Stats skeleton */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {[...Array(4)].map((_, i) => (
                        <div key={i} className="rounded-2xl p-5 space-y-4" style={{ background: SURFACE, border: `1px solid ${BORDER}` }}>
                            <div className="flex justify-between"><Bone w="w-10" h="h-10" extra="rounded-xl" /><Bone w="w-16" h="h-6" extra="rounded-lg" /></div>
                            <Bone w="w-32" h="h-8" />
                            <Bone w="w-24" h="h-3" />
                        </div>
                    ))}
                </div>
                {/* Movers skeleton */}
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
                    {[...Array(4)].map((_, i) => (
                        <div key={i} className="rounded-2xl p-5 space-y-4" style={{ background: SURFACE, border: `1px solid ${BORDER}` }}>
                            <div className="flex justify-between border-b border-white/5 pb-3">
                                <Bone w="w-32" h="h-5" />
                                <Bone w="w-16" h="h-4" />
                            </div>
                            {[...Array(5)].map((_, j) => <Bone key={j} h="h-11" extra="rounded-xl" />)}
                        </div>
                    ))}
                </div>
            </main>
        );
    }

    return (
        <main className="max-w-7xl mx-auto space-y-6">

            {/* ── Hero header ─────────────────────────────────────────────── */}
            <div className="group relative rounded-3xl overflow-hidden p-6 sm:p-10 shadow-2xl transition-all duration-500 hover:shadow-blue-500/10"
                style={{ 
                    background: 'linear-gradient(135deg, rgba(10,17,32,0.95) 0%, rgba(15,25,50,0.98) 100%)', 
                    border: `1px solid rgba(59,130,246,0.15)` 
                }}>
                {/* Immersive background glow */}
                <div className="absolute inset-0 pointer-events-none opacity-50 group-hover:opacity-100 transition-opacity duration-700"
                    style={{ background: 'radial-gradient(ellipse at 85% 10%, rgba(59,130,246,0.15) 0%, transparent 50%)' }} />
                <div className="absolute top-0 left-0 right-0 h-[2px] opacity-70"
                    style={{ background: 'linear-gradient(90deg, transparent, rgba(59,130,246,0.8), transparent)' }} />

                <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-8 z-10">
                    <div className="max-w-xl">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="p-2.5 rounded-xl shadow-[0_0_15px_rgba(59,130,246,0.3)] transition-transform duration-300 group-hover:scale-110" 
                                style={{ background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)' }}>
                                <Activity className="w-5 h-5 text-blue-400" />
                            </div>
                            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl backdrop-blur-sm shadow-sm transition-all duration-300 group-hover:shadow-md"
                                style={{ background: mktBg, border: `1px solid ${mktBorder}` }}>
                                {isOpen || isPreOpen
                                    ? <Wifi className="w-3.5 h-3.5 animate-pulse" style={{ color: mktColor }} />
                                    : <WifiOff className="w-3.5 h-3.5" style={{ color: mktColor }} />}
                                <span className="text-[11px] font-black tracking-widest uppercase drop-shadow-sm" style={{ color: mktColor }}>
                                    MARKET {status || (isOpen ? 'OPEN' : 'CLOSED')}
                                </span>
                            </div>
                        </div>
                        <h1 className="text-4xl sm:text-5xl font-black text-white leading-[1.1] mb-3 tracking-tight">
                            Nepal Stock Exchange
                            <span className="block text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-cyan-400 to-teal-400 drop-shadow-sm mt-1">
                                Market Overview
                            </span>
                        </h1>
                        <p className="text-sm sm:text-base font-medium text-slate-400 max-w-md leading-relaxed">
                            Real-time NEPSE data streaming, AI-powered trade signals, and live market breadth analytics.
                        </p>
                        
                        {/* Quick action buttons */}
                        <div className="flex items-center gap-3 mt-6">
                            <button onClick={() => setPage('dashboard')} className="px-5 py-2.5 rounded-xl text-sm font-black text-white shadow-[0_4px_20px_rgba(37,99,235,0.3)] transition-all hover:scale-105 active:scale-95 flex items-center gap-2"
                                style={{ background: 'linear-gradient(135deg, #2563eb, #1d4ed8)' }}>
                                <Brain className="w-4 h-4" /> AI Signals
                            </button>
                            <button onClick={() => goLive()} className="px-5 py-2.5 rounded-xl text-sm font-black transition-all hover:scale-105 active:scale-95 flex items-center gap-2 hover:bg-white/10"
                                style={{ background: 'rgba(255,255,255,0.05)', color: '#cbd5e1', border: '1px solid rgba(255,255,255,0.1)' }}>
                                <Radio className="w-4 h-4" /> Live Market
                            </button>
                        </div>
                    </div>

                    {/* NEPSE Index hero block */}
                    {index?.value ? (
                        <div className="shrink-0 rounded-3xl p-6 min-w-[240px] w-full sm:w-auto relative overflow-hidden group/idx transition-transform hover:-translate-y-1 hover:shadow-2xl"
                            style={{ 
                                background: 'rgba(255,255,255,0.02)', 
                                border: '1px solid rgba(255,255,255,0.05)',
                                boxShadow: 'inset 0 0 20px rgba(0,0,0,0.2)'
                            }}>
                            <div className="absolute inset-0 opacity-0 group-hover/idx:opacity-100 transition-opacity duration-500 pointer-events-none"
                                style={{ background: `radial-gradient(circle at top right, ${idxUp ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)'}, transparent 70%)` }} />
                            
                            <p className="text-[10px] font-black uppercase tracking-widest mb-1 relative z-10 text-slate-400">NEPSE Index</p>
                            <p className="text-5xl font-black text-white tabular-nums leading-none tracking-tight relative z-10 drop-shadow-md">{fmt(index.value)}</p>
                            
                            <div className="flex items-center gap-2 mt-4 relative z-10">
                                <span className="flex items-center gap-1.5 text-sm font-black px-3 py-1.5 rounded-xl tabular-nums shadow-sm"
                                    style={{
                                        color: idxColor,
                                        background: idxUp ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
                                        border: `1px solid ${idxUp ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)'}`,
                                    }}>
                                    {idxUp ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                    {idxUp ? '+' : ''}{fmt(index.change)} ({idxUp ? '+' : ''}{fmt(index.change_pct)}%)
                                </span>
                            </div>
                        </div>
                    ) : (
                        <div className="shrink-0 rounded-3xl p-6 w-full sm:w-auto min-w-[240px]" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                            <p className="text-[10px] font-black uppercase tracking-widest mb-2 text-slate-500">NEPSE Index</p>
                            <p className="text-4xl font-black text-slate-700">—</p>
                        </div>
                    )}
                </div>
            </div>

            {/* ── Stats row ───────────────────────────────────────────────── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                    label="Total Turnover" Icon={DollarSign} color="#3b82f6"
                    glow="rgba(59,130,246,0.1)" border="rgba(59,130,246,0.18)"
                    value={summary?.total_turnover ? `Rs.${fmtVol(summary.total_turnover)}` : '—'}
                    sub="Daily traded value"
                />
                <StatCard
                    label="Total Volume" Icon={BarChart2} color="#8b5cf6"
                    glow="rgba(139,92,246,0.1)" border="rgba(139,92,246,0.18)"
                    value={summary?.total_volume ? fmtVol(summary.total_volume) : '—'}
                    sub="Shares traded today"
                />
                <StatCard
                    label="Total Trades" Icon={Zap} color="#f59e0b"
                    glow="rgba(245,158,11,0.1)" border="rgba(245,158,11,0.18)"
                    value={summary?.total_trades ? fmtVol(summary.total_trades) : '—'}
                    sub="Transactions executed"
                />
                <StatCard
                    label="NEPSE Index" Icon={BarChart3} color={idxColor}
                    glow={idxUp ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)'}
                    border={idxUp ? 'rgba(34,197,94,0.18)' : 'rgba(239,68,68,0.18)'}
                    value={index?.value ? fmt(index.value) : '—'}
                    sub="Nepal Stock Exchange"
                    trend={index?.change_pct ?? null}
                />
            </div>

            {/* ── Market breadth ──────────────────────────────────────────── */}
            {(adv + dec + unc) > 0 && (
                <div className="rounded-2xl p-5" style={{ background: SURFACE, border: `1px solid ${BORDER}` }}>
                    <BreadthBar adv={adv} dec={dec} unc={unc} />
                </div>
            )}

            {/* ── Top movers ──────────────────────────────────────────────── */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
                {[
                    { title: 'Top Gainers',  Icon: TrendingUp,   color: '#22c55e', glow: 'rgba(34,197,94,0.1)',   border: 'rgba(34,197,94,0.2)',   list: gainers,   isGainer: true,  mode: 'pct'      },
                    { title: 'Top Losers',   Icon: TrendingDown, color: '#ef4444', glow: 'rgba(239,68,68,0.1)',   border: 'rgba(239,68,68,0.2)',   list: losers,    isGainer: false, mode: 'pct'      },
                    { title: 'Top Turnover', Icon: DollarSign,   color: '#f59e0b', glow: 'rgba(245,158,11,0.1)',  border: 'rgba(245,158,11,0.2)',  list: turnovers, isGainer: null,  mode: 'turnover' },
                    { title: 'Top Volume',   Icon: BarChart2,    color: '#8b5cf6', glow: 'rgba(139,92,246,0.1)',  border: 'rgba(139,92,246,0.2)',  list: volumes,   isGainer: null,  mode: 'volume'   },
                ].map(({ title, Icon, color, glow, border, list, isGainer, mode }) => (
                    <div key={title} className="group/card relative rounded-2xl overflow-hidden transition-all duration-300 hover:shadow-[0_8px_30px_rgba(0,0,0,0.3)] hover:-translate-y-0.5"
                        style={{ background: SURFACE, border: `1px solid ${BORDER}` }}>
                        <div className="absolute top-0 left-0 right-0 h-[2px] opacity-60 transition-opacity duration-300 group-hover/card:opacity-100" 
                            style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)` }} />
                        
                        <div className="px-5 pt-5 pb-3 flex items-center justify-between border-b" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-xl transition-transform duration-300 group-hover/card:scale-110 group-hover/card:shadow-lg" 
                                    style={{ background: glow, border: `1px solid ${border}`, boxShadow: `0 0 10px ${glow}` }}>
                                    <Icon className="w-4 h-4 drop-shadow-md" style={{ color }} />
                                </div>
                                <span className="text-sm font-black text-white tracking-wide">{title}</span>
                            </div>
                            <button onClick={() => goLive()}
                                className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest transition-all hover:scale-105"
                                style={{ color: '#475569' }}
                                onMouseEnter={e => e.currentTarget.style.color = color}
                                onMouseLeave={e => e.currentTarget.style.color = '#475569'}>
                                View all <ArrowRight className="w-3 h-3" />
                            </button>
                        </div>
                        <div className="p-3 space-y-1 relative z-10">
                            {list.length > 0 ? list.map((s, i) => (
                                <MoverRow key={s.symbol} stock={s} isGainer={isGainer} rank={i + 1} mode={mode} onNavigate={goLive} />
                            )) : (
                                <div className="py-8 flex flex-col items-center justify-center text-center opacity-50">
                                    <Activity className="w-6 h-6 mb-2 text-slate-500" />
                                    <span className="text-xs font-bold text-slate-400">No data available</span>
                                </div>
                            )}
                        </div>
                        {/* Soft backdrop radial glow inside the card */}
                        <div className="absolute inset-0 pointer-events-none opacity-0 group-hover/card:opacity-100 transition-opacity duration-500"
                            style={{ background: `radial-gradient(circle at 50% 100%, ${glow}, transparent 60%)` }} />
                    </div>
                ))}
            </div>

            {/* ── Feature cards ───────────────────────────────────────────── */}
            <div>
                <p className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: '#334155' }}>Quick Access</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <FeatureCard
                        Icon={Radio} color="#22c55e" glow="rgba(34,197,94,0.08)" border="rgba(34,197,94,0.18)"
                        title="Live Market" badge="Live"
                        desc="Real-time NEPSE stock prices, top gainers & losers, market breadth, and interactive charts for all listed stocks."
                        onClick={() => goLive()}
                    />
                    <FeatureCard
                        Icon={Brain} color="#3b82f6" glow="rgba(59,130,246,0.08)" border="rgba(59,130,246,0.18)"
                        title="AI Signal Generator" badge="AI"
                        desc="Upload a stock CSV and get BUY / SELL / HOLD predictions powered by XGBoost & RandomForest with OpenAI analysis."
                        onClick={() => setPage('dashboard')}
                    />
                    <FeatureCard
                        Icon={Target} color="#f59e0b" glow="rgba(245,158,11,0.08)" border="rgba(245,158,11,0.18)"
                        title="Price Targets" badge="Smart"
                        desc="AI-generated target prices, stop-loss levels, risk/reward ratios, and entry zones based on technical indicators."
                        onClick={() => setPage('dashboard')}
                    />
                    <FeatureCard
                        Icon={BarChart3} color="#8b5cf6" glow="rgba(139,92,246,0.08)" border="rgba(139,92,246,0.18)"
                        title="Interactive Charts" badge="Pro"
                        desc="Candlestick charts with signal overlays, volume bars, and historical price data for deep technical analysis."
                        onClick={() => setPage('dashboard')}
                    />
                    <FeatureCard
                        Icon={Shield} color="#06b6d4" glow="rgba(6,182,212,0.08)" border="rgba(6,182,212,0.18)"
                        title="Backtest Engine"
                        desc="Validate trading strategies against historical data with win rate, profit factor, and drawdown statistics."
                        onClick={() => setPage('dashboard')}
                    />
                    <FeatureCard
                        Icon={Layers} color="#ec4899" glow="rgba(236,72,153,0.08)" border="rgba(236,72,153,0.18)"
                        title="Prediction History"
                        desc="Browse all past AI predictions with confidence scores, signal outcomes, and full analysis reports."
                        onClick={() => setPage('dashboard')}
                    />
                </div>
            </div>

        </main>
    );
}
