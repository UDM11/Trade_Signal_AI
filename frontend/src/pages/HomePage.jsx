import React, { useState } from 'react';
import {
    Activity, Radio, TrendingUp, TrendingDown, BarChart2, DollarSign,
    Zap, ArrowRight, ChevronUp, ChevronDown, Wifi, WifiOff,
    BarChart3, Target, Brain, Search, Globe, Sparkles
} from 'lucide-react';
import { fmt, fmtVol, chgColor } from '../utils/formatters';
import StatCard from '../components/ui/StatCard';
import MoverRow from '../components/ui/MoverRow';
import FeatureCard from '../components/ui/FeatureCard';
import { useMarketSocket } from '../hooks/useMarketSocket.jsx';

const SURFACE = 'var(--color-glass)';
const BORDER  = 'var(--color-glass-border)';

function Bone({ w = 'w-full', h = 'h-4', extra = '' }) {
    return (
        <div className={`${w} ${h} ${extra} rounded-lg animate-pulse`}
            style={{ background: 'rgba(255,255,255,0.06)' }} />
    );
}

export default function HomePage({ setPage }) {
    const [searchQuery, setSearchQuery] = useState('');
    const { marketData: data, connected } = useMarketSocket();

    const loading = !data;

    const goLive = (symbol) => setPage('live', symbol);

    const handleSearchSubmit = (e) => {
        e.preventDefault();
        if (searchQuery.trim()) goLive(searchQuery.trim().toUpperCase());
    };

    const index   = data?.index;
    const summary = data?.summary;
    const isOpen  = data?.market_open;
    const status  = data?.market_status;
    const isPreOpen  = status === 'PRE-OPEN';
    const mktColor   = isOpen ? '#22c55e' : isPreOpen ? '#f59e0b' : '#ef4444';
    const mktBg      = isOpen ? 'rgba(34,197,94,0.08)' : isPreOpen ? 'rgba(245,158,11,0.08)' : 'rgba(239,68,68,0.08)';
    const mktBorder  = isOpen ? 'rgba(34,197,94,0.2)'  : isPreOpen ? 'rgba(245,158,11,0.2)'  : 'rgba(239,68,68,0.2)';
    const idxUp      = (index?.change ?? 0) >= 0;
    const idxColor   = idxUp ? '#22c55e' : '#ef4444';

    const gainers   = data?.gainers?.slice(0, 5)       ?? [];
    const losers    = data?.losers?.slice(0, 5)        ?? [];
    const turnovers = data?.top_turnovers?.slice(0, 5) ?? [];
    const volumes   = data?.top_volumes?.slice(0, 5)   ?? [];
    const adv = summary?.advancing ?? 0;
    const dec = summary?.declining ?? 0;
    const unc = summary?.unchanged ?? 0;
    const totalBreadth = adv + dec + unc || 1;
    const upPct = Math.round((adv / totalBreadth) * 100);

    if (loading) return <HomeSkeleton />;

    return (
        <main className="max-w-400 mx-auto space-y-6 sm:space-y-8 lg:space-y-10 pb-16 sm:pb-20 lg:pb-24 px-2 sm:px-4 lg:px-6 animate-in fade-in duration-700">

            {/* ── Hero ─────────────────────────────────────────────────────── */}
            <div className="group relative rounded-xl sm:rounded-2xl lg:rounded-3xl overflow-hidden p-4 sm:p-8 lg:p-14 shadow-2xl transition-all duration-700 hover:shadow-blue-500/20"
                style={{
                    background: 'linear-gradient(135deg, rgba(8,12,24,0.98) 0%, rgba(15,25,50,0.99) 100%)',
                    border: '1px solid rgba(59,130,246,0.15)'
                }}>

                {/* BG decorations */}
                <div className="absolute inset-0 pointer-events-none opacity-40 group-hover:opacity-60 transition-opacity duration-1000"
                    style={{ background: 'radial-gradient(ellipse at 85% 10%, rgba(59,130,246,0.2) 0%, transparent 50%)' }} />
                <div className="absolute -bottom-24 -left-24 w-72 sm:w-96 h-72 sm:h-96 bg-blue-600/10 rounded-full blur-[80px] sm:blur-[100px] pointer-events-none" />
                <div className="absolute top-0 left-0 right-0 h-[2px] opacity-80"
                    style={{ background: 'linear-gradient(90deg, transparent, rgba(59,130,246,0.8), transparent)' }} />

                <div className="relative flex flex-col lg:flex-row lg:items-center justify-between gap-5 sm:gap-8 lg:gap-12 z-10">

                    {/* Left: Text + Search */}
                    <div className="flex-1 min-w-0 space-y-3.5 sm:space-y-6 lg:space-y-8">

                        {/* Badges */}
                        <div className="flex flex-wrap items-center gap-1.5 sm:gap-3">
                            <div className="flex items-center gap-1 sm:gap-2 px-2.5 sm:px-4 py-1 sm:py-2 rounded-md sm:rounded-lg backdrop-blur-md shadow-xl transition-all duration-500"
                                style={{ background: mktBg, border: `1px solid ${mktBorder}` }}>
                                {isOpen || isPreOpen
                                    ? <Wifi className="w-3 h-3 sm:w-4 sm:h-4 animate-pulse" style={{ color: mktColor }} />
                                    : <WifiOff className="w-3 h-3 sm:w-4 sm:h-4" style={{ color: mktColor }} />}
                                <span className="text-[8px] sm:text-[11px] font-black tracking-[0.2em] sm:tracking-[0.3em] uppercase" style={{ color: mktColor }}>
                                    {status || (isOpen ? 'MARKET OPEN' : 'MARKET CLOSED')}
                                </span>
                            </div>
                            <div className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-slate-400">
                                <Globe className="w-4 h-4 text-blue-400" />
                                <span className="text-[11px] font-black tracking-[0.2em] uppercase">NEPSE Terminal v4.2</span>
                            </div>
                        </div>

                        {/* Heading */}
                        <div className="space-y-1.5 sm:space-y-3 lg:space-y-4">
                            <h1 className="text-2xl sm:text-5xl lg:text-7xl font-black text-white leading-[1.05] tracking-tighter">
                                Trade Signal <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-cyan-400 to-emerald-400">AI</span>
                                <br />
                                <span className="text-lg sm:text-4xl lg:text-5xl opacity-90">Precision Terminal</span>
                            </h1>
                            <p className="text-[11px] sm:text-base lg:text-lg font-medium text-slate-400 max-w-xl leading-relaxed">
                                Nepal's premier institutional-grade trading platform. Harness ensemble neural networks for high-probability NEPSE stock predictions.
                            </p>
                        </div>

                        {/* Search */}
                        <form onSubmit={handleSearchSubmit} className="relative max-w-xl">
                            {/* Mobile: stacked layout */}
                            <div className="flex flex-col sm:flex-row gap-2 sm:gap-0">
                                <input
                                    type="text"
                                    placeholder="ENTER SYMBOL (E.G. NICA)"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full bg-surface border border-white/10 rounded-lg sm:rounded-xl py-2 sm:py-5 pl-3.5 sm:pl-6 pr-4 sm:pr-44 text-[10px] sm:text-sm font-black text-white tracking-widest focus:outline-none focus:border-blue-500/50 focus:bg-white/3 transition-all placeholder:text-slate-600 shadow-inner uppercase"
                                />
                                <button
                                    type="submit"
                                    className="w-full sm:w-auto sm:absolute sm:right-2.5 sm:top-2.5 sm:bottom-2.5 px-5 sm:px-8 py-2.5 sm:py-0 rounded-md sm:rounded-lg bg-blue-600 text-[9px] sm:text-[11px] font-black text-white uppercase tracking-[0.2em] hover:bg-blue-500 transition-all active:scale-95 shadow-xl shadow-blue-600/30"
                                >
                                    Analyze Asset
                                </button>
                            </div>
                        </form>
                    </div>

                    {/* Right: NEPSE Index card */}
                    {index?.value ? (
                        <div onClick={() => goLive('NEPSE')}
                            className="shrink-0 cursor-pointer rounded-xl sm:rounded-2xl p-4 sm:p-7 lg:p-10 w-full lg:w-auto lg:min-w-[320px] relative overflow-hidden group/idx transition-all duration-500 hover:-translate-y-2 hover:shadow-[0_20px_50px_rgba(0,0,0,0.5)]"
                            style={{
                                background: 'rgba(255,255,255,0.02)',
                                border: '1px solid rgba(255,255,255,0.05)',
                                boxShadow: 'inset 0 0 30px rgba(0,0,0,0.3)'
                            }}>
                            <div className="absolute inset-0 opacity-0 group-hover/idx:opacity-100 transition-opacity duration-700 pointer-events-none"
                                style={{ background: `radial-gradient(circle at top right, ${idxUp ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)'}, transparent 70%)` }} />

                            <div className="relative z-10 flex flex-col gap-3 sm:gap-5 lg:gap-6">
                                <div className="flex items-center justify-between">
                                    <p className="text-[9px] sm:text-[11px] font-black uppercase tracking-[0.2em] sm:tracking-[0.4em] text-slate-500">NEPSE Index</p>
                                    <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-white/5 border border-white/10">
                                        <div className={`w-1 h-1 rounded-full animate-pulse ${idxUp ? 'bg-emerald-400' : 'bg-red-400'}`} />
                                        <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Live</span>
                                    </div>
                                </div>

                                <div className="space-y-0.5">
                                    <p className="text-3xl sm:text-5xl lg:text-6xl font-black text-white tabular-nums tracking-tighter drop-shadow-2xl">
                                        {fmt(index.value)}
                                    </p>
                                    <div className="flex items-center gap-2 mt-1 sm:mt-4">
                                        <span className="flex items-center gap-1 sm:gap-2 text-xs sm:text-base font-black px-2.5 sm:px-4 py-1 sm:py-2 rounded-md sm:rounded-lg tabular-nums shadow-lg"
                                            style={{
                                                color: idxColor,
                                                background: idxUp ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                                                border: `1px solid ${idxUp ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
                                            }}>
                                            {idxUp ? <ChevronUp className="w-3.5 h-3.5 sm:w-5 sm:h-5" /> : <ChevronDown className="w-3.5 h-3.5 sm:w-5 sm:h-5" />}
                                            {idxUp ? '+' : ''}{fmt(index.change)} ({idxUp ? '+' : ''}{fmt(index.change_pct)}%)
                                        </span>
                                    </div>
                                </div>

                                <div className="pt-3 sm:pt-6 border-t border-white/5 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest">Turnover</span>
                                        <span className="text-[10px] sm:text-xs font-black text-white">Rs.{fmtVol(summary?.total_turnover || 0)}</span>
                                    </div>
                                    <ArrowRight className="w-3.5 h-3.5 sm:w-5 sm:h-5 text-slate-700 group-hover/idx:text-blue-500 group-hover/idx:translate-x-1 transition-all" />
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="shrink-0 rounded-3xl sm:rounded-[40px] p-6 sm:p-10 w-full lg:w-auto lg:min-w-[320px]"
                            style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                            <Bone w="w-32" h="h-4" />
                            <Bone w="w-48" h="h-16" extra="mt-6" />
                        </div>
                    )}
                </div>
            </div>

            {/* ── Stats Row ────────────────────────────────────────────────── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6">
                <StatCard
                    label="Volume Traded" Icon={BarChart2} color="#8b5cf6"
                    glow="rgba(139,92,246,0.1)" border="rgba(139,92,246,0.18)"
                    value={summary?.total_volume ? fmtVol(summary.total_volume) : '—'}
                    sub="Shares active today"
                />
                <StatCard
                    label="Transaction Count" Icon={Zap} color="#f59e0b"
                    glow="rgba(245,158,11,0.1)" border="rgba(245,158,11,0.18)"
                    value={summary?.total_trades ? fmtVol(summary.total_trades) : '—'}
                    sub="Executed trade sequences"
                />
                <StatCard
                    label="Market Breadth" Icon={BarChart3} color={idxColor}
                    glow={idxUp ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)'}
                    border={idxUp ? 'rgba(34,197,94,0.18)' : 'rgba(239,68,68,0.18)'}
                    value={`${upPct}% Bullish`}
                    sub={`${adv} ADV / ${dec} DEC`}
                    trend={index?.change_pct ?? null}
                />
                <StatCard
                    label="Network Latency" Icon={Wifi} color="#10b981"
                    glow="rgba(16,185,129,0.1)" border="rgba(16,185,129,0.18)"
                    value={connected ? '24ms' : 'Offline'}
                    sub="Real-time WebSocket active"
                />
            </div>

            {/* ── Alpha Movers ──────────────────────────────────────────────── */}
            <div className="space-y-4 sm:space-y-5 lg:space-y-6">
                <div className="flex items-center justify-between px-1 sm:px-2">
                    <div className="flex items-center gap-2 sm:gap-3">
                        <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-blue-400" />
                        <h3 className="text-lg sm:text-xl lg:text-2xl font-black text-white tracking-tight uppercase">Alpha Movers</h3>
                    </div>
                    <button onClick={() => goLive()} className="text-[9px] sm:text-[10px] font-black text-blue-400 uppercase tracking-widest hover:text-blue-300 transition-colors flex items-center gap-1.5">
                        View Live <ArrowRight className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                    </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4 lg:gap-6">
                    {[
                        { title: 'Top Gainers',  Icon: TrendingUp,   color: '#22c55e', glow: 'rgba(34,197,94,0.1)',  border: 'rgba(34,197,94,0.2)',  list: gainers,   isGainer: true,  mode: 'pct'      },
                        { title: 'Top Losers',   Icon: TrendingDown, color: '#ef4444', glow: 'rgba(239,68,68,0.1)',  border: 'rgba(239,68,68,0.2)',  list: losers,    isGainer: false, mode: 'pct'      },
                        { title: 'Top Turnover', Icon: DollarSign,   color: '#f59e0b', glow: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.2)', list: turnovers, isGainer: null,  mode: 'turnover' },
                        { title: 'Top Volume',   Icon: BarChart2,    color: '#8b5cf6', glow: 'rgba(139,92,246,0.1)', border: 'rgba(139,92,246,0.2)', list: volumes,   isGainer: null,  mode: 'volume'   },
                    ].map(({ title, Icon, color, glow, border, list, isGainer, mode }) => (
                        <div key={title}
                            className="group/card relative rounded-xl sm:rounded-2xl overflow-hidden transition-all duration-500 hover:shadow-[0_16px_40px_rgba(0,0,0,0.4)] hover:-translate-y-1 sm:hover:-translate-y-2"
                            style={{ background: SURFACE, border: `1px solid ${BORDER}` }}>
                            <div className="absolute top-0 left-0 right-0 h-0.5 sm:h-0.75 opacity-60 group-hover/card:opacity-100 transition-opacity"
                                style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)` }} />

                            <div className="px-4 sm:px-5 lg:px-6 pt-4 sm:pt-5 lg:pt-6 pb-3 sm:pb-4 flex items-center gap-2 sm:gap-3 border-b" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                                <div className="p-2 sm:p-2.5 rounded-lg sm:rounded-xl group-hover/card:scale-110 transition-transform shadow-lg"
                                    style={{ background: glow, border: `1px solid ${border}` }}>
                                    <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" style={{ color }} />
                                </div>
                                <span className="text-[10px] sm:text-[11px] font-black text-white tracking-[0.15em] sm:tracking-[0.2em] uppercase">{title}</span>
                            </div>

                            <div className="p-2.5 sm:p-3 lg:p-4 space-y-1 relative z-10">
                                {list.length > 0 ? list.map((s, i) => (
                                    <MoverRow
                                        key={s.symbol}
                                        stock={s}
                                        isGainer={isGainer}
                                        rank={i + 1}
                                        mode={mode}
                                        onNavigate={goLive}
                                    />
                                )) : (
                                    <div className="py-8 sm:py-12 flex flex-col items-center justify-center text-center opacity-30">
                                        <Activity className="w-6 h-6 sm:w-8 sm:h-8 mb-2 sm:mb-3" />
                                        <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-slate-500">Awaiting Data Sync</span>
                                    </div>
                                )}
                            </div>
                            <div className="absolute inset-0 pointer-events-none opacity-0 group-hover/card:opacity-100 transition-opacity duration-700"
                                style={{ background: `radial-gradient(circle at 50% 100%, ${glow}, transparent 70%)` }} />
                        </div>
                    ))}
                </div>
            </div>

            {/* ── Feature Cards ─────────────────────────────────────────────── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-6">
                <FeatureCard
                    Icon={Radio} color="#22c55e" glow="rgba(34,197,94,0.08)" border="rgba(34,197,94,0.18)"
                    title="Live Market" badge="Institutional"
                    desc="High-frequency WebSocket data stream with precision breadth analysis and depth mapping."
                    onClick={() => goLive()}
                />
                <FeatureCard
                    Icon={Brain} color="#3b82f6" glow="rgba(59,130,246,0.08)" border="rgba(59,130,246,0.18)"
                    title="Neural Signal Core" badge="Alpha"
                    desc="Ensemble voting engine processing 200+ symbols to extract institutional-grade alpha signals."
                    onClick={() => setPage('dashboard')}
                />
                <FeatureCard
                    Icon={Target} color="#f59e0b" glow="rgba(245,158,11,0.08)" border="rgba(245,158,11,0.18)"
                    title="Objective Targets" badge="v4.2"
                    desc="Probabilistic price objectives and risk guardrails calculated through deep pattern recognition."
                    onClick={() => setPage('dashboard')}
                />
            </div>

        </main>
    );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────
function HomeSkeleton() {
    return (
        <main className="max-w-400 mx-auto space-y-6 sm:space-y-8 lg:space-y-10 px-2 sm:px-4 lg:px-6">
            <div className="rounded-3xl sm:rounded-[48px] p-5 sm:p-10 lg:p-14 flex flex-col lg:flex-row lg:items-center justify-between gap-8"
                style={{ background: 'rgba(15,25,50,0.4)', border: '1px solid rgba(59,130,246,0.1)' }}>
                <div className="space-y-4 sm:space-y-6 flex-1">
                    <Bone w="w-36 sm:w-48" h="h-8 sm:h-10" extra="rounded-2xl" />
                    <Bone w="w-3/4" h="h-14 sm:h-20" />
                    <Bone w="w-1/2" h="h-5 sm:h-6" />
                    <Bone w="w-full sm:w-96" h="h-10 sm:h-14" extra="rounded-2xl" />
                </div>
                <div className="rounded-3xl sm:rounded-[40px] p-5 sm:p-10 w-full lg:w-auto lg:min-w-[320px]"
                    style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <Bone w="w-28 sm:w-32" h="h-4" />
                    <Bone w="w-40 sm:w-48" h="h-12 sm:h-16" extra="mt-4 sm:mt-6" />
                </div>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6">
                {[...Array(4)].map((_, i) => (
                    <div key={i} className="rounded-2xl p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6"
                        style={{ background: 'var(--color-glass)', border: '1px solid var(--color-glass-border)' }}>
                        <Bone w="w-10 sm:w-12" h="h-10 sm:h-12" extra="rounded-xl" />
                        <Bone w="w-24 sm:w-32" h="h-6 sm:h-8" />
                    </div>
                ))}
            </div>
        </main>
    );
}
