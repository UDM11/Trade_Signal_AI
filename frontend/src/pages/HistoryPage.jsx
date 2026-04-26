import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { 
    Search, RefreshCw, SlidersHorizontal, AlertCircle,
    Activity, TrendingUp, Target, Shield
} from 'lucide-react';
import { api } from '../api';
import StockDetailsPage from './stock-details';
import { HistoryCard } from '../components/history/HistoryComponents';

const SURFACE  = 'var(--color-glass)';
const BORDER   = 'var(--color-glass-border)';


function buildResult(record) {
    const ai = record.ai_analysis || {};
    return {
        symbol:            record.stocks?.symbol || record.symbol || 'UNKNOWN',
        prediction:        record.prediction,
        confidence:        record.confidence_score ?? record.confidence,
        explanation:       record.explanation,
        target_price:      record.target_price      ?? null,
        stop_loss:         record.stop_loss          ?? null,
        estimated_days:    record.estimated_days     ?? null,
        target_pct:        record.target_pct         ?? null,
        stop_loss_pct:     record.stop_loss_pct      ?? null,
        risk_reward:       record.risk_reward         ?? null,
        all_proba:         record.all_proba           ?? null,
        indicators:        record.indicators          ?? null,
        model_metrics:     record.model_metrics       ?? null,
        ideal_entry:       ai.ideal_entry          ?? null,
        entry_zone_low:    ai.entry_zone_low       ?? null,
        entry_zone_high:   ai.entry_zone_high      ?? null,
        entry_condition:   ai.entry_condition      ?? null,
        target2:           ai.target2              ?? null,
        trailing_stop:     ai.trailing_stop        ?? null,
        signal_history:    record.signal_history   || [],
        chartData:         record.chart_data       || [],
        backtest:          record.backtest         || record.backtest_stats || null
    };
}

const REFRESH_SEC = 1;

export default function HistoryPage() {
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [filterSignal, setFilterSignal] = useState('ALL');
    const [sortBy, setSortBy] = useState('date');
    const [selected, setSelected] = useState(null);
    const [lastRefreshed, setLastRefreshed] = useState(null);
    const [countdown, setCountdown] = useState(REFRESH_SEC);
    const countdownRef = useRef(REFRESH_SEC);

    const fetchHistory = useCallback(async (isBackground = false) => {
        if (!isBackground) setLoading(true);
        try {
            const res = await api.getHistory();
            setHistory(res.data.data || []);
            setLastRefreshed(new Date());
            countdownRef.current = REFRESH_SEC;
            setCountdown(REFRESH_SEC);
        } catch (e) {
            console.error('Failed to fetch history:', e);
        } finally {
            if (!isBackground) setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchHistory();
        // Auto-refresh every REFRESH_SEC seconds
        const refreshTimer = setInterval(() => fetchHistory(true), REFRESH_SEC * 1000);
        // Countdown ticker every second
        const tickTimer = setInterval(() => {
            countdownRef.current = Math.max(0, countdownRef.current - 1);
            setCountdown(countdownRef.current);
        }, 1000);
        return () => {
            clearInterval(refreshTimer);
            clearInterval(tickTimer);
        };
    }, [fetchHistory]);

    const filteredHistory = useMemo(() => {
        let list = history.filter(r => {
            const sym = (r.stocks?.symbol || r.symbol || '').toLowerCase();
            return sym.includes(search.toLowerCase()) && (filterSignal === 'ALL' || r.prediction === filterSignal);
        });
        if (sortBy === 'date')       list = [...list].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        if (sortBy === 'confidence') list = [...list].sort((a, b) => b.confidence_score - a.confidence_score);
        if (sortBy === 'symbol')     list = [...list].sort((a, b) => (a.stocks?.symbol || a.symbol || '').localeCompare(b.stocks?.symbol || b.symbol || ''));
        return list;
    }, [history, search, filterSignal, sortBy]);

    // Derived stats (same pattern as ScreenerPage)
    const stats = useMemo(() => {
        const buys = filteredHistory.filter(r => r.prediction === 'BUY').length;
        const avgConf = filteredHistory.length
            ? filteredHistory.reduce((s, r) => s + +(r.confidence_score ?? 0), 0) / filteredHistory.length
            : 0;
        const rrList = filteredHistory.filter(r => r.risk_reward != null);
        const avgRR = rrList.length
            ? rrList.reduce((s, r) => s + +r.risk_reward, 0) / rrList.length
            : 0;
        return { total: filteredHistory.length, buys, avgConf, avgRR };
    }, [filteredHistory]);

    // Handle browser back button
    useEffect(() => {
        const onPop = () => {
            const match = window.location.pathname.match(/^\/history\/(.+)$/);
            if (!match) setSelected(null);
        };
        window.addEventListener('popstate', onPop);
        return () => window.removeEventListener('popstate', onPop);
    }, []);

    const handleSelect = (record) => {
        const result = buildResult(record);
        setSelected(result);
        const sym = record.stocks?.symbol || record.symbol || 'UNKNOWN';
        window.history.pushState({ sym }, '', `/history/${sym}`);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleBack = () => {
        setSelected(null);
        window.history.pushState({}, '', '/history');
    };

    // ── Stock detail view ──────────────────────────────────────────────────────
    if (selected) {
        return (
            <main className="max-w-7xl mx-auto space-y-6 pb-20 pt-6 px-4 sm:px-6 md:px-8">
                <StockDetailsPage selected={selected} onBack={handleBack} />
            </main>
        );
    }

    // ── List view ──────────────────────────────────────────────────────────────
    return (
        <main className="max-w-7xl mx-auto space-y-6 pb-20 pt-6 px-4 sm:px-6 md:px-8">
            
            {/* ── Header Section ─────────────────────────────────────────────────── */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 px-1">
                <div>
                    <h1 className="text-3xl font-black text-white tracking-tight">Trade History</h1>
                    <p className="text-sm text-slate-500 mt-1 uppercase tracking-widest font-bold">Past Signals & AI Predictions</p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20">
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                            <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500"></span>
                        </span>
                        <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest">Live Sync Active</span>
                    </div>
                </div>
            </div>

            {/* ── Consolidated Control Panel ─────────────────────────────────── */}
            {loading ? (
                /* Full panel skeleton */
                <div className="p-5 sm:p-7 rounded-3xl shadow-2xl relative overflow-hidden" style={{ background: SURFACE, border: `1px solid ${BORDER}` }}>
                    {/* Row 1 skeleton: search + controls */}
                    <div className="flex flex-col lg:flex-row gap-4 items-stretch lg:items-center relative z-10">
                        {/* Search bar skeleton */}
                        <div className="flex-1 h-12 rounded-xl bg-white/5 animate-pulse" />
                        {/* Controls skeleton */}
                        <div className="flex items-center gap-3 shrink-0">
                            {/* Filter pills group */}
                            <div className="flex items-center gap-1 p-1 rounded-xl bg-white/5 animate-pulse h-12 w-64" />
                            {/* Sort */}
                            <div className="h-12 w-32 rounded-xl bg-white/5 animate-pulse" />
                            {/* Refresh btn */}
                            <div className="h-12 w-12 rounded-xl bg-white/5 animate-pulse" />
                        </div>
                    </div>

                    {/* Divider */}
                    <div className="h-px w-full bg-white/5 mt-6 mb-6 relative z-10" />

                    {/* Row 2 skeleton: stats */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6 relative z-10">
                        {[
                            { label: 'Matched',      w: 'w-12' },
                            { label: 'Buy Signals',  w: 'w-10' },
                            { label: 'Avg Conf.',    w: 'w-16' },
                            { label: 'Avg R/R',      w: 'w-14' },
                        ].map(({ label, w }) => (
                            <div key={label} className="space-y-2">
                                <div className="h-2.5 w-24 rounded-md bg-white/5 animate-pulse" />
                                <div className={`h-8 ${w} rounded-lg bg-white/10 animate-pulse`} />
                            </div>
                        ))}
                    </div>
                </div>
            ) : (
                /* Real control panel */
                <div className="p-5 sm:p-7 rounded-3xl shadow-2xl relative overflow-hidden group/panel" style={{ background: SURFACE, border: `1px solid ${BORDER}` }}>
                    <div className="absolute inset-0 pointer-events-none opacity-0 group-hover/panel:opacity-100 transition-opacity duration-1000"
                        style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(59,130,246,0.06) 0%, transparent 60%)' }} />
                    <div className="absolute top-0 left-0 right-0 h-px opacity-30"
                        style={{ background: 'linear-gradient(90deg, transparent, rgba(59,130,246,0.3), transparent)' }} />

                    {/* Row 1: Search + Signal filters + Sort + Refresh */}
                    <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center">

                        {/* Search Input */}
                        <div className="relative flex-1 group z-10">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-blue-400 transition-colors pointer-events-none" />
                            <input
                                type="text"
                                placeholder="Quick search symbol (e.g. NABIL)..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="w-full bg-white/5 border border-white/5 rounded-xl py-3 pl-12 pr-4 text-sm font-bold text-white outline-none focus:border-blue-500/40 focus:bg-white/10 transition-all placeholder:text-slate-600 hover:bg-white/10"
                            />
                        </div>

                        {/* Controls Row */}
                        <div className="flex items-center gap-3 overflow-x-auto no-scrollbar shrink-0 z-10">

                            {/* Signal Filter Pills */}
                            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0 z-10">
                                {['ALL', 'BUY', 'SELL', 'HOLD'].map((s) => {
                                    const active = filterSignal === s;
                                    const c = s === 'BUY' ? '#22c55e' : s === 'SELL' ? '#ef4444' : s === 'HOLD' ? '#f59e0b' : null;
                                    const count = history.filter(r => r.prediction === s).length;
                                    const allCount = history.length;

                                    return (
                                        <button
                                            key={s}
                                            onClick={() => setFilterSignal(s)}
                                            className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shrink-0 border"
                                            style={{
                                                background: active ? (c ? `${c}18` : 'rgba(255,255,255,0.08)') : 'transparent',
                                                color: active ? (c || '#fff') : '#64748b',
                                                borderColor: active ? (c ? `${c}40` : 'rgba(255,255,255,0.15)') : 'transparent',
                                            }}
                                        >
                                            {s} {active && <span className="ml-1 opacity-60">{s === 'ALL' ? allCount : count}</span>}
                                        </button>
                                    );
                                })}
                            </div>


                            {/* Sort Toggle */}
                            <button onClick={() => setSortBy(sortBy === 'date' ? 'confidence' : sortBy === 'confidence' ? 'symbol' : 'date')}
                                className="flex items-center gap-2 px-4 py-3 rounded-xl bg-white/5 border border-white/5 text-slate-400 hover:text-white hover:bg-white/10 transition-all text-[10px] font-black uppercase tracking-widest shrink-0 shadow-sm">
                                <SlidersHorizontal className="w-3.5 h-3.5" />
                                <span>Sort: {sortBy}</span>
                            </button>

                            {/* Refresh */}
                            <button
                                onClick={fetchHistory}
                                title="Refresh"
                                className="p-3 rounded-xl bg-white/5 border border-white/5 text-slate-500 hover:text-white hover:bg-white/10 transition-all shrink-0 group/refresh"
                            >
                                <RefreshCw className="w-4 h-4 group-hover/refresh:rotate-180 transition-transform duration-500" />
                            </button>
                        </div>
                    </div>

                    {/* Row 2: Live Stats (Signal Style) */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-6 pt-6 border-t border-white/10 relative z-10">
                        {[
                            { label: 'Matched',     value: stats.total,              color: '#fff',     Icon: Activity },
                            { label: 'Buy Signals', value: stats.buys,               color: '#22c55e',  Icon: TrendingUp },
                            { label: 'Avg Conf.',   value: `${stats.avgConf.toFixed(0)}%`, color: '#60a5fa', Icon: Target },
                            { label: 'Avg R/R',     value: `${stats.avgRR.toFixed(1)}x`,  color: '#f59e0b', Icon: Shield },
                        ].map(({ label, value, color, Icon: StatIcon }) => (
                            <div key={label} className="flex items-center gap-3 transition-all group-hover/panel:translate-x-1">
                                <div className="p-2 rounded-xl shrink-0"
                                    style={{ background: `${color}12`, border: `1px solid ${color}20` }}>
                                    <StatIcon className="w-4 h-4" style={{ color }} />
                                </div>
                                <div>
                                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest drop-shadow-sm">{label}</p>
                                    <p className="text-xl font-black tabular-nums leading-none transition-all group-hover/panel:scale-110 origin-left" style={{ color }}>{value}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ── Results Grid ───────────────────────────────────────────────── */}
            {loading ? (
                <div className="flex flex-col gap-4">
                    {[1, 2, 3, 4, 5].map(i => (
                        <div
                            key={i}
                            className="relative rounded-2xl overflow-hidden"
                            style={{ background: SURFACE, border: `1px solid ${BORDER}` }}
                        >
                            {/* Left bar skeleton */}
                            <div className="absolute left-0 top-0 bottom-0 w-[4px] bg-white/10 animate-pulse" />

                            {/* Top accent line */}
                            <div className="absolute top-0 left-0 right-0 h-[2px] bg-white/5 animate-pulse" />

                            <div className="pl-5 pr-4 pt-4 pb-3 flex flex-col gap-4">
                                {/* Row 1: Symbol + sparkline/badge */}
                                <div className="flex items-start justify-between gap-4">
                                    {/* Symbol + timestamp */}
                                    <div className="space-y-2">
                                        <div className="h-5 w-24 rounded-lg bg-white/10 animate-pulse" />
                                        <div className="h-3 w-36 rounded-md bg-white/5 animate-pulse" />
                                    </div>
                                    {/* Sparkline + badge */}
                                    <div className="flex items-center gap-3">
                                        <div className="hidden sm:block h-8 w-20 rounded-lg bg-white/5 animate-pulse" />
                                        <div className="h-7 w-20 rounded-xl bg-white/10 animate-pulse" />
                                    </div>
                                </div>

                                {/* Row 2: Stats grid — 5 columns matching real card */}
                                <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-x-4 gap-y-3">
                                    {[1, 2, 3, 4, 5].map(j => (
                                        <div key={j} className="space-y-1.5">
                                            <div className="h-2.5 w-16 rounded-md bg-white/5 animate-pulse" />
                                            <div className="h-4 w-20 rounded-md bg-white/10 animate-pulse" />
                                            <div className="h-2.5 w-10 rounded-md bg-white/5 animate-pulse" />
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Bottom confidence bar */}
                            <div>
                                <div className="h-[3px] w-full bg-white/5">
                                    <div
                                        className="h-full bg-white/10 animate-pulse"
                                        style={{ width: `${45 + i * 10}%` }}
                                    />
                                </div>
                                <div className="flex items-center justify-between px-5 py-2.5">
                                    <div className="h-2.5 w-16 rounded-md bg-white/5 animate-pulse" />
                                    <div className="h-3 w-12 rounded-md bg-white/10 animate-pulse" />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            ) : filteredHistory.length > 0 ? (
                <div className="grid grid-cols-1 gap-4">
                    {filteredHistory.map((record) => (
                        <HistoryCard
                            key={record.id}
                            record={record}
                            onClick={() => handleSelect(record)}
                        />
                    ))}
                </div>
            ) : (
                <div className="flex flex-col items-center justify-center py-32 text-center rounded-3xl relative overflow-hidden" style={{ background: SURFACE, border: `1px solid ${BORDER}` }}>
                    <div className="absolute inset-0 pointer-events-none opacity-20"
                        style={{ background: 'radial-gradient(circle at center, rgba(59,130,246,0.1) 0%, transparent 50%)' }} />
                    <div className="p-6 rounded-3xl bg-white/5 mb-5 shadow-inner">
                        <AlertCircle className="w-12 h-12 text-slate-600" />
                    </div>
                    <h3 className="text-2xl font-black text-white mb-2 drop-shadow-md tracking-tight">No Records Found</h3>
                    <p className="text-slate-500 max-w-sm text-sm font-medium leading-relaxed">
                        No prediction history matches your current search or filter criteria. Try adjusting your parameters.
                    </p>
                </div>
            )}
        </main>
    );
}
