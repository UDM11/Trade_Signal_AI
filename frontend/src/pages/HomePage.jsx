import React, { useState, useEffect, useCallback } from 'react';
import {
    Activity, Radio, TrendingUp, TrendingDown, BarChart2, DollarSign,
    Zap, ArrowRight, ChevronUp, ChevronDown, Wifi, WifiOff,
    BarChart3, Target, Shield, Brain, Layers,
} from 'lucide-react';
import { api } from '../api';

const SURFACE  = 'rgba(8,15,26,0.8)';
const BORDER   = 'rgba(255,255,255,0.07)';

function fmt(n, d = 2) {
    if (n == null || isNaN(n)) return '—';
    return Number(n).toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d });
}
function fmtVol(n) {
    if (!n) return '—';
    if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e7) return (n / 1e7).toFixed(2) + 'Cr';
    if (n >= 1e5) return (n / 1e5).toFixed(2) + 'L';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return String(Math.round(n));
}
function chgColor(v) {
    if (v > 0) return '#22c55e';
    if (v < 0) return '#ef4444';
    return '#64748b';
}

// ── Animated number ──────────────────────────────────────────────────────────
function StatCard({ label, value, sub, Icon, color, glow, border, trend }) {
    return (
        <div className="relative rounded-2xl overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
            style={{ background: SURFACE, border: `1px solid ${border}`, boxShadow: `0 4px 24px ${glow}` }}>
            <div className="absolute top-0 left-0 right-0 h-px"
                style={{ background: `linear-gradient(90deg, transparent, ${color}60, transparent)` }} />
            <div className="p-5">
                <div className="flex items-start justify-between mb-4">
                    <div className="p-2.5 rounded-xl" style={{ background: glow, border: `1px solid ${border}` }}>
                        <Icon className="w-4 h-4" style={{ color }} />
                    </div>
                    {trend != null && (
                        <span className="flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-lg"
                            style={{
                                color: trend >= 0 ? '#22c55e' : '#ef4444',
                                background: trend >= 0 ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
                                border: `1px solid ${trend >= 0 ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
                            }}>
                            {trend >= 0 ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                            {Math.abs(trend).toFixed(2)}%
                        </span>
                    )}
                </div>
                <p className="text-2xl font-black text-white tabular-nums leading-none mb-1">{value}</p>
                <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#475569' }}>{label}</p>
                {sub && <p className="text-[11px] mt-1" style={{ color: '#334155' }}>{sub}</p>}
            </div>
        </div>
    );
}

// ── Mover row ────────────────────────────────────────────────────────────────
function MoverRow({ stock, isGainer, rank, mode, onNavigate }) {
    const isVolume   = mode === 'volume';
    const isTurnover = mode === 'turnover';
    const cc = isVolume ? '#8b5cf6' : isTurnover ? '#f59e0b' : chgColor(stock.change_pct);
    return (
        <button onClick={() => onNavigate('live', stock.symbol)}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-left"
            style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}>
            <span className="w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-black shrink-0"
                style={{ background: 'rgba(255,255,255,0.05)', color: '#475569' }}>{rank}</span>
            <div className="flex-1 min-w-0">
                <p className="text-xs font-black text-white truncate">{stock.symbol}</p>
                <p className="text-[10px] tabular-nums" style={{ color: '#475569' }}>Rs. {fmt(stock.ltp)}</p>
            </div>
            <span className="text-sm font-black tabular-nums shrink-0" style={{ color: cc }}>
                {isVolume   ? fmtVol(stock.volume)
                : isTurnover ? `Rs.${fmtVol(stock.turnover)}`
                : `${isGainer ? '+' : ''}${fmt(stock.change_pct)}%`}
            </span>
        </button>
    );
}

// ── Feature card ─────────────────────────────────────────────────────────────
function FeatureCard({ Icon, color, glow, border, title, desc, badge, onClick }) {
    return (
        <button onClick={onClick}
            className="group relative rounded-2xl overflow-hidden text-left w-full transition-all duration-200 hover:-translate-y-1"
            style={{ background: SURFACE, border: `1px solid ${border}`, boxShadow: `0 4px 24px ${glow}` }}>
            <div className="absolute top-0 left-0 right-0 h-px"
                style={{ background: `linear-gradient(90deg, transparent, ${color}50, transparent)` }} />
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                style={{ background: `radial-gradient(ellipse at top left, ${glow} 0%, transparent 60%)` }} />
            <div className="relative p-6">
                <div className="flex items-start justify-between mb-4">
                    <div className="p-3 rounded-xl" style={{ background: glow, border: `1px solid ${border}` }}>
                        <Icon className="w-5 h-5" style={{ color }} />
                    </div>
                    {badge && (
                        <span className="text-[10px] font-black px-2 py-1 rounded-full uppercase tracking-wider"
                            style={{ background: glow, color, border: `1px solid ${border}` }}>{badge}</span>
                    )}
                </div>
                <h3 className="text-base font-black text-white mb-1.5">{title}</h3>
                <p className="text-xs leading-relaxed" style={{ color: '#475569' }}>{desc}</p>
                <div className="mt-4 flex items-center gap-1.5 text-xs font-bold" style={{ color }}>
                    Open <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
                </div>
            </div>
        </button>
    );
}

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
        <div className="space-y-2">
            <div className="flex items-center justify-between text-[10px] font-semibold" style={{ color: '#475569' }}>
                <span>Market Breadth</span>
                <span>{total} stocks</span>
            </div>
            <div className="h-2 rounded-full overflow-hidden flex gap-px">
                <div style={{ width: `${advPct}%`, background: '#22c55e', borderRadius: '4px 0 0 4px' }} />
                <div style={{ width: `${uncPct}%`, background: '#475569' }} />
                <div style={{ width: `${decPct}%`, background: '#ef4444', borderRadius: '0 4px 4px 0' }} />
            </div>
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-400">
                        <span className="w-2 h-2 rounded-full bg-emerald-400" />{adv} Up
                    </span>
                    <span className="flex items-center gap-1 text-[11px] font-bold" style={{ color: '#475569' }}>
                        <span className="w-2 h-2 rounded-full bg-slate-500" />{unc} Flat
                    </span>
                    <span className="flex items-center gap-1 text-[11px] font-bold text-red-400">
                        <span className="w-2 h-2 rounded-full bg-red-400" />{dec} Down
                    </span>
                </div>
                <span className="text-[11px] font-black" style={{ color: adv >= dec ? '#22c55e' : '#ef4444' }}>
                    {Math.round((adv / total) * 100)}% advancing
                </span>
            </div>
        </div>
    );
}

// ── Main HomePage ─────────────────────────────────────────────────────────────
export default function HomePage({ setPage }) {
    const [data,      setData]      = useState(null);
    const [loading,   setLoading]   = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const fetchData = useCallback(async (isRefresh = false) => {
        if (isRefresh) setRefreshing(true);
        try {
            const res = await api.getNepseLive();
            if (!res.data?.error) setData(res.data);
        } catch { /* silent */ } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);
    useEffect(() => {
        const id = setInterval(() => fetchData(true), 5_000);
        return () => clearInterval(id);
    }, [fetchData]);

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
                <div className="rounded-2xl p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-6"
                    style={{ background: SURFACE, border: `1px solid ${BORDER}` }}>
                    <div className="space-y-3 flex-1">
                        <div className="flex items-center gap-3">
                            <Bone w="w-10" h="h-10" extra="rounded-xl" />
                            <Bone w="w-32" h="h-7" extra="rounded-xl" />
                        </div>
                        <Bone w="w-64" h="h-9" />
                        <Bone w="w-48" h="h-5" />
                        <Bone w="w-80" h="h-4" />
                    </div>
                    <div className="rounded-2xl p-5 space-y-3 min-w-[200px]" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                        <Bone w="w-20" h="h-3" />
                        <Bone w="w-36" h="h-10" />
                        <Bone w="w-28" h="h-7" extra="rounded-lg" />
                    </div>
                </div>
                {/* Stats skeleton */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {[...Array(4)].map((_, i) => (
                        <div key={i} className="rounded-2xl p-5 space-y-3" style={{ background: SURFACE, border: `1px solid ${BORDER}` }}>
                            <div className="flex justify-between"><Bone w="w-10" h="h-10" extra="rounded-xl" /><Bone w="w-16" h="h-6" extra="rounded-lg" /></div>
                            <Bone w="w-28" h="h-7" />
                            <Bone w="w-20" h="h-3" />
                        </div>
                    ))}
                </div>
                {/* Movers skeleton */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {[...Array(4)].map((_, i) => (
                        <div key={i} className="rounded-2xl p-5 space-y-3" style={{ background: SURFACE, border: `1px solid ${BORDER}` }}>
                            <Bone w="w-32" h="h-4" />
                            {[...Array(5)].map((_, j) => <Bone key={j} h="h-10" extra="rounded-xl" />)}
                        </div>
                    ))}
                </div>
            </main>
        );
    }

    return (
        <main className="max-w-7xl mx-auto space-y-6">

            {/* ── Hero header ─────────────────────────────────────────────── */}
            <div className="relative rounded-2xl overflow-hidden p-6 sm:p-8"
                style={{ background: 'linear-gradient(135deg, rgba(8,15,26,0.95) 0%, rgba(15,25,50,0.95) 100%)', border: `1px solid ${BORDER}` }}>
                <div className="absolute inset-0 pointer-events-none"
                    style={{ background: 'radial-gradient(ellipse at 80% 50%, rgba(59,130,246,0.06) 0%, transparent 60%)' }} />
                <div className="absolute top-0 left-0 right-0 h-px"
                    style={{ background: 'linear-gradient(90deg, transparent, rgba(59,130,246,0.4), transparent)' }} />

                <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                    <div>
                        <div className="flex items-center gap-3 mb-3">
                            <div className="p-2.5 rounded-xl" style={{ background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.25)' }}>
                                <Activity className="w-5 h-5 text-blue-400" />
                            </div>
                            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl"
                                style={{ background: mktBg, border: `1px solid ${mktBorder}` }}>
                                {isOpen || isPreOpen
                                    ? <Wifi className="w-3.5 h-3.5" style={{ color: mktColor }} />
                                    : <WifiOff className="w-3.5 h-3.5" style={{ color: mktColor }} />}
                                <span className="text-xs font-black tracking-wide" style={{ color: mktColor }}>
                                    MARKET {status || (isOpen ? 'OPEN' : 'CLOSED')}
                                </span>
                                {(isOpen || isPreOpen) && <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: mktColor }} />}
                            </div>
                        </div>
                        <h1 className="text-3xl sm:text-4xl font-black text-white leading-tight mb-2">
                            Nepal Stock Exchange
                            <span className="block text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-400">
                                Market Overview
                            </span>
                        </h1>
                        <p className="text-sm" style={{ color: '#475569' }}>
                            Real-time NEPSE data · AI-powered trade signals · Live market analytics
                        </p>
                    </div>

                    {/* NEPSE Index hero block */}
                    {index?.value ? (
                        <div className="shrink-0 rounded-2xl p-5 min-w-[200px]"
                            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                            <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: '#475569' }}>NEPSE Index</p>
                            <p className="text-4xl font-black text-white tabular-nums leading-none">{fmt(index.value)}</p>
                            <div className="flex items-center gap-2 mt-2">
                                <span className="flex items-center gap-1 text-sm font-black px-2.5 py-1 rounded-lg tabular-nums"
                                    style={{
                                        color: idxColor,
                                        background: idxUp ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                                        border: `1px solid ${idxUp ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
                                    }}>
                                    {idxUp ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                    {idxUp ? '+' : ''}{fmt(index.change)} ({idxUp ? '+' : ''}{fmt(index.change_pct)}%)
                                </span>
                            </div>
                            <div className="mt-3" />
                        </div>
                    ) : (
                        <div className="shrink-0 rounded-2xl p-5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                            <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: '#475569' }}>NEPSE Index</p>
                            <p className="text-3xl font-black" style={{ color: '#1e293b' }}>—</p>
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                    { title: 'Top Gainers',  Icon: TrendingUp,   color: '#22c55e', glow: 'rgba(34,197,94,0.08)',   border: 'rgba(34,197,94,0.18)',   list: gainers,   isGainer: true,  mode: 'pct'      },
                    { title: 'Top Losers',   Icon: TrendingDown, color: '#ef4444', glow: 'rgba(239,68,68,0.08)',   border: 'rgba(239,68,68,0.18)',   list: losers,    isGainer: false, mode: 'pct'      },
                    { title: 'Top Turnover', Icon: DollarSign,   color: '#f59e0b', glow: 'rgba(245,158,11,0.08)',  border: 'rgba(245,158,11,0.18)',  list: turnovers, isGainer: null,  mode: 'turnover' },
                    { title: 'Top Volume',   Icon: BarChart2,    color: '#8b5cf6', glow: 'rgba(139,92,246,0.08)',  border: 'rgba(139,92,246,0.18)',  list: volumes,   isGainer: null,  mode: 'volume'   },
                ].map(({ title, Icon, color, glow, border, list, isGainer, mode }) => (
                    <div key={title} className="rounded-2xl overflow-hidden"
                        style={{ background: SURFACE, border: `1px solid ${BORDER}` }}>
                        <div className="absolute-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${color}40, transparent)` }} />
                        <div className="px-4 pt-4 pb-3 flex items-center justify-between border-b" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                            <div className="flex items-center gap-2.5">
                                <div className="p-1.5 rounded-lg" style={{ background: glow, border: `1px solid ${border}` }}>
                                    <Icon className="w-3.5 h-3.5" style={{ color }} />
                                </div>
                                <span className="text-sm font-black text-white">{title}</span>
                            </div>
                            <button onClick={() => goLive()}
                                className="flex items-center gap-1 text-[10px] font-bold transition-colors"
                                style={{ color: '#334155' }}
                                onMouseEnter={e => e.currentTarget.style.color = color}
                                onMouseLeave={e => e.currentTarget.style.color = '#334155'}>
                                View all <ArrowRight className="w-3 h-3" />
                            </button>
                        </div>
                        <div className="p-3 space-y-1.5">
                            {list.length > 0 ? list.map((s, i) => (
                                <MoverRow key={s.symbol} stock={s} isGainer={isGainer} rank={i + 1} mode={mode} onNavigate={goLive} />
                            )) : (
                                <div className="py-6 text-center text-xs" style={{ color: '#334155' }}>No data</div>
                            )}
                        </div>
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
