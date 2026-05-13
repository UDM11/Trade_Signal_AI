import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    TrendingUp, TrendingDown, Minus, RefreshCw, SlidersHorizontal,
    ChevronUp, ChevronDown, Search, X, Target, Shield, Zap,
    BarChart2, Activity, ArrowRight, Filter, LayoutGrid, List,
    ArrowUpNarrowWide, ArrowDownWideNarrow, Info
} from 'lucide-react';
import { fmt } from '../utils/formatters';
import { getCached, fetchPredictions, isStale } from '../cache/predictionsCache';
import StockDetailsPage from './stock-details';

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtPrice(n) { return n != null ? `Rs.${fmt(n)}` : '—'; }
function pct(n)      { return n != null ? `${+n >= 0 ? '+' : ''}${fmt(n)}%` : '—'; }

const SIG = {
    BUY:  { color: 'text-buy',  bg: 'bg-buy/15',  border: 'border-buy/30',  borderC: 'rgba(16,185,129,0.3)', Icon: TrendingUp   },
    SELL: { color: 'text-sell', bg: 'bg-sell/15', border: 'border-sell/30', borderC: 'rgba(239,68,68,0.3)', Icon: TrendingDown },
    HOLD: { color: 'text-hold', bg: 'bg-hold/15', border: 'border-hold/30', borderC: 'rgba(245,158,11,0.3)', Icon: Minus        },
};

const SORT_INIT = { key: 'confidence_score', dir: -1 };
const FILTER_DEFAULTS = { signal: 'ALL', minConf: 0, minRR: 0, minTarget: 0, maxSL: 20 };

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
        chartData:         record.chart_data       || (ai.sparkline ? ai.sparkline.map(v => ({ close: v })) : []),
        latest_close:      ai.latest_close         || (record.chart_data?.length ? record.chart_data[record.chart_data.length - 1]?.close : null),
        backtest:          record.backtest         || record.backtest_stats || null
    };
}

// ── Filter Panel ──────────────────────────────────────────────────────────────
function FilterPanel({ filters, setFilters, counts, onReset }) {
    const set = (k, v) => setFilters(f => ({ ...f, [k]: v }));

    return (
        <div className="rounded-lg sm:rounded-xl p-3.5 sm:p-5 space-y-4 sm:space-y-7 shadow-2xl backdrop-blur-2xl transition-all duration-300"
            style={{ background: 'rgba(8, 15, 26, 0.8)', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
            <div className="flex items-center justify-between pb-2 sm:pb-4 border-b border-white/5">
                <div className="flex items-center gap-1.5 sm:gap-2.5">
                    <div className="p-1 sm:p-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20">
                        <Filter className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-blue-400" />
                    </div>
                    <span className="text-[9px] sm:text-xs font-black text-white uppercase tracking-widest">Global Filters</span>
                </div>
                <button onClick={onReset} className="text-[8px] sm:text-[10px] font-black text-slate-500 hover:text-white uppercase tracking-widest transition-colors py-1 px-2 rounded-lg hover:bg-white/5">
                    Reset
                </button>
            </div>

            {/* Signal Selection */}
            <div>
                <p className="text-[8px] sm:text-[10px] font-black uppercase tracking-widest mb-2 sm:mb-4 text-slate-500 flex items-center gap-1.5">
                    <Activity className="w-2.5 h-2.5 sm:w-3 sm:h-3" /> Market Signal
                </p>
                <div className="grid grid-cols-2 gap-1.5 sm:gap-2.5">
                    {['ALL', 'BUY', 'HOLD', 'SELL'].map(s => {
                        const active = filters.signal === s;
                        const cfg = SIG[s] || {};
                        return (
                            <button key={s} onClick={() => set('signal', s)}
                                className={`flex items-center justify-between px-2 sm:px-3 py-2 sm:py-3 rounded-lg text-[9px] sm:text-xs font-black transition-all border ${
                                    active ? 'bg-blue-600/15 border-blue-500/50 text-white shadow-[0_0_15px_rgba(59,130,246,0.1)]' : 'bg-white/5 border-transparent text-slate-400 hover:bg-white/10'
                                }`}>
                                <div className="flex items-center gap-1 sm:gap-2">
                                    {cfg.Icon && <cfg.Icon className={`w-2.5 sm:w-3.5 h-2.5 sm:h-3.5 ${active ? cfg.color : ''}`} />}
                                    <span className="tracking-tight">{s}</span>
                                </div>
                                {counts[s] > 0 && <span className="text-[7px] sm:text-[10px] font-bold opacity-40 tabular-nums">{counts[s]}</span>}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Advanced Parameter Sliders */}
            <div className="space-y-3 sm:space-y-6 pt-1">
                {[
                    { k: 'minConf',   l: 'Confidence', u: '%', min: 0, max: 99, step: 1,  c: '#3b82f6', icon: Zap },
                    { k: 'minRR',     l: 'Risk/Reward', u: 'x', min: 0, max: 5,  step: 0.1, c: '#8b5cf6', icon: Target },
                    { k: 'minTarget', l: 'Upside',     u: '%', min: 0, max: 30, step: 0.5, c: '#10b981', icon: TrendingUp },
                    { k: 'maxSL',     l: 'Risk Tol.',   u: '%', min: 1, max: 20, step: 0.5, c: '#ef4444', icon: Shield },
                ].map(s => (
                    <div key={s.k} className="space-y-1.5 sm:space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1 sm:gap-2">
                                <s.icon className="w-2 sm:w-3 h-2 sm:h-3 text-slate-500" />
                                <p className="text-[8px] sm:text-[10px] font-black uppercase tracking-widest text-slate-500">{s.l}</p>
                            </div>
                            <span className="text-[8px] sm:text-xs font-black text-white tabular-nums px-1.5 py-0.5 rounded-md bg-white/5 border border-white/10">
                                {s.k === 'minTarget' ? '≥ ' : s.k === 'maxSL' ? '≤ ' : ''}{filters[s.k]}{s.u}
                            </span>
                        </div>
                        <div className="relative h-3 sm:h-6 flex items-center">
                            <input type="range" min={s.min} max={s.max} step={s.step} value={filters[s.k]}
                                onChange={e => set(s.k, +e.target.value)}
                                className="w-full h-1 sm:h-1.5 rounded-full appearance-none cursor-pointer bg-white/10 hover:bg-white/15 transition-all outline-none"
                                style={{ accentColor: s.c }} />
                        </div>
                    </div>
                ))}
            </div>

            {/* Pro Tip */}
            <div className="p-2.5 sm:p-4 rounded-lg bg-blue-500/5 border border-blue-500/10 flex gap-2">
                <Info className="w-3 h-3 text-blue-400 shrink-0" />
                <p className="text-[8px] sm:text-[10px] text-slate-400 leading-tight font-medium">
                    Adjust parameters for setups. We recommend <span className="text-blue-400 font-bold">Conf &gt; 75%</span>.
                </p>
            </div>
        </div>
    );
}

import { SignalProbaStrip } from '../components/history/HistoryComponents';

// ── Heatmap Block ─────────────────────────────────────────────────────────────
const HeatmapBlock = React.memo(({ r, onClick }) => {
    const sig = SIG[r.prediction] || SIG.HOLD;
    const conf = +(r.confidence_score ?? 0);
    const sym = r.stocks?.symbol || r.symbol || '?';

    return (
        <button onClick={() => onClick(r)}
            className="group relative rounded-xl sm:rounded-2xl overflow-hidden transition-all duration-500 hover:-translate-y-1 hover:shadow-[0_15px_40px_rgba(0,0,0,0.5)] flex flex-col items-center justify-center p-3.5 text-center aspect-square sm:aspect-auto sm:h-36 animate-in fade-in zoom-in-95"
            style={{
                background: 'rgba(8, 15, 26, 0.4)',
                border: `1px solid ${sig.borderC}`,
            }}>
            <div className="absolute inset-0 pointer-events-none opacity-5 group-hover:opacity-20 transition-opacity duration-700"
                style={{ background: `radial-gradient(circle at center, ${sig.borderC}, transparent 80%)` }} />
            
            <div className="relative z-10 w-full">
                <p className="text-sm sm:text-base font-black text-white group-hover:scale-105 transition-transform duration-300 uppercase">{sym}</p>
                <div className="flex items-center justify-center gap-1 mt-1 mb-2">
                    <sig.Icon className={`w-2.5 h-2.5 ${sig.color}`} />
                    <p className={`text-[8px] sm:text-[10px] font-black uppercase tracking-widest ${sig.color}`}>{r.prediction}</p>
                </div>
                
                <SignalProbaStrip all_proba={r.all_proba} prediction={r.prediction} />
                <p className="text-[7px] sm:text-[9px] font-bold text-slate-500 mt-2 tracking-widest tabular-nums">{conf.toFixed(0)}% CONF</p>
            </div>
        </button>
    );
});

// ── Table Row ─────────────────────────────────────────────────────────────────
const TableRow = React.memo(({ r, rank, onSelect }) => {
    const sig = SIG[r.prediction] || SIG.HOLD;
    const sym = r.stocks?.symbol || r.symbol || '?';
    const conf = +(r.confidence_score ?? 0);
    const rr = r.risk_reward;
    const rrColor = rr >= 2 ? 'text-buy' : rr >= 1 ? 'text-hold' : 'text-sell';
    const latestClose = r.latest_close;

    return (
        <tr className="border-b transition-all cursor-pointer group hover:bg-white/[0.03] animate-in slide-in-from-right-4 fade-in duration-300"
            style={{ borderColor: 'rgba(255, 255, 255, 0.05)' }}
            onClick={() => onSelect(r)}>
            <td className="px-1.5 sm:px-5 py-3 sm:py-5 text-[9px] sm:text-[10px] font-black text-slate-600 tabular-nums">{rank}</td>
            <td className="px-1.5 sm:px-5 py-3 sm:py-5">
                <div className="flex items-center gap-1.5 sm:gap-4">
                    <div className={`w-0.5 h-6 sm:w-1 sm:h-10 rounded-full ${r.prediction === 'BUY' ? 'bg-buy' : r.prediction === 'SELL' ? 'bg-sell' : 'bg-hold'} opacity-30 group-hover:opacity-100 transition-all`} />
                    <div>
                        <span className="text-sm sm:text-base font-black text-white group-hover:text-blue-400 transition-colors uppercase tracking-tight block truncate max-w-[70px] sm:max-w-none">{sym}</span>
                        <span className="text-[8px] sm:text-[10px] font-bold text-slate-600 tracking-widest uppercase hidden xs:block">Equity</span>
                    </div>
                </div>
            </td>
            <td className="px-1.5 sm:px-5 py-3 sm:py-5">
                <div className={`flex items-center gap-1 sm:gap-2 w-fit px-1.5 sm:px-3.5 py-1 sm:py-2 rounded-md sm:rounded-xl border ${sig.border} ${sig.bg} shadow-sm sm:shadow-lg shadow-black/20`}>
                    <sig.Icon className={`w-2.5 h-2.5 sm:w-3.5 sm:h-3.5 ${sig.color}`} />
                    <span className={`text-[9px] sm:text-[10px] font-black tracking-widest uppercase ${sig.color}`}>{r.prediction === 'HOLD' ? 'HLD' : r.prediction}</span>
                </div>
            </td>
            <td className="px-3 sm:px-5 py-4 sm:py-5 hidden lg:table-cell">
                <div className="flex flex-col gap-1.5 min-w-[120px]">
                    <div className="flex items-center justify-between">
                        <span className={`text-xs font-black tabular-nums ${sig.color}`}>{conf.toFixed(1)}%</span>
                        <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">Ensemble Confidence</span>
                    </div>
                    <SignalProbaStrip all_proba={r.all_proba} prediction={r.prediction} />
                </div>
            </td>
            <td className="px-1.5 sm:px-5 py-3 sm:py-5">
                <span className="text-sm sm:text-base font-black tabular-nums text-white/90">{fmtPrice(latestClose)}</span>
            </td>
            <td className="px-3 sm:px-5 py-4 sm:py-5 hidden md:table-cell">
                <div className="flex flex-col">
                    <span className="text-xs sm:text-sm font-black text-buy tabular-nums">{fmtPrice(r.target_price)}</span>
                    <span className="text-[9px] font-bold text-buy/50 tabular-nums">{pct(r.target_pct)}</span>
                </div>
            </td>
            <td className="px-3 sm:px-5 py-4 sm:py-5 hidden xl:table-cell">
                <div className="flex flex-col">
                    <span className="text-sm font-black text-sell tabular-nums">{fmtPrice(r.stop_loss)}</span>
                    <span className="text-[10px] font-bold text-sell/50 tabular-nums">{r.stop_loss_pct != null ? `-${fmt(r.stop_loss_pct)}%` : '—'}</span>
                </div>
            </td>
            <td className="px-3 sm:px-5 py-4 sm:py-5 hidden md:table-cell">
                <div className="flex flex-col items-center">
                    <span className={`text-sm font-black tabular-nums ${rrColor}`}>{rr != null ? `${fmt(rr)}x` : '—'}</span>
                    <div className="flex gap-0.5 mt-1">
                        {[1, 2, 3].map(i => (
                            <div key={i} className={`w-2.5 h-1 rounded-full ${rr >= i ? rrColor.replace('text-', 'bg-') : 'bg-white/10'}`} />
                        ))}
                    </div>
                </div>
            </td>
            <td className="px-2 sm:px-5 py-3 sm:py-5 text-right">
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-white/5 border border-white/5 flex items-center justify-center group-hover:bg-blue-600 group-hover:border-blue-500 transition-all">
                    <ArrowRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-500 group-hover:text-white transition-colors" />
                </div>
            </td>
        </tr>
    );
});

// ── Skeleton Loader ───────────────────────────────────────────────────────────
function TableSkeleton() {
    return (
        <div className="rounded-xl overflow-hidden space-y-px animate-pulse bg-white/5">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(i => (
                <div key={i} className="flex items-center gap-4 px-6 py-5 border-b border-white/5">
                    <div className="w-4 h-4 bg-white/5 rounded" />
                    <div className="w-1 h-8 bg-white/5 rounded-full" />
                    <div className="flex-1 space-y-2">
                        <div className="w-24 h-4 bg-white/5 rounded" />
                        <div className="w-16 h-3 bg-white/5 rounded opacity-50" />
                    </div>
                    <div className="w-20 h-8 bg-white/5 rounded-lg" />
                    <div className="hidden lg:block w-32 h-10 bg-white/5 rounded" />
                    <div className="w-16 h-5 bg-white/5 rounded" />
                    <div className="w-8 h-8 bg-white/5 rounded-full" />
                </div>
            ))}
        </div>
    );
}

// ── Sort icon (outside component so React doesn't remount it every render) ────
function SortIcon({ col, sort }) {
    if (sort.key !== col) return <ChevronDown className="w-2.5 h-2.5 sm:w-3 sm:h-3 opacity-20" />;
    return sort.dir === -1
        ? <ArrowDownWideNarrow className="w-3 sm:w-3.5 h-3 sm:h-3.5 text-blue-400" />
        : <ArrowUpNarrowWide   className="w-3 sm:w-3.5 h-3 sm:h-3.5 text-blue-400" />;
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ScreenerPage({ onSelectStock }) {
    const [records, setRecords]       = useState(() => getCached() || []);
    const [loading, setLoading]       = useState(!getCached());
    const [filters, setFilters]       = useState(FILTER_DEFAULTS);
    const [sort, setSort]             = useState(SORT_INIT);
    const [search, setSearch]         = useState('');
    const [view, setView]             = useState('table');
    const [showFilters, setShowFilters] = useState(true);
    const [selected, setSelected]     = useState(null);
    const [displayLimit, setDisplayLimit] = useState(30); // Pagination for performance

    const handleSelect = (record) => {
        const sym = record.stocks?.symbol || record.symbol || 'UNKNOWN';
        setSelected(buildResult(record));
        window.history.pushState({ sym }, '', `/screener/${sym}`);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleBack = () => {
        setSelected(null);
        window.history.pushState({}, '', '/screener');
    };

    useEffect(() => {
        const onPop = () => {
            const match = window.location.pathname.match(/^\/screener\/(.+)$/);
            if (!match) setSelected(null);
        };
        window.addEventListener('popstate', onPop);
        return () => window.removeEventListener('popstate', onPop);
    }, []);

    const fetchData = useCallback(async (isBackground = false) => {
        if (!isBackground && !getCached()) setLoading(true);
        try {
            const data = await fetchPredictions();
            setRecords(data);
        } catch { /* silent */ } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (isStale()) fetchData(!!getCached());
        const tid = setInterval(() => fetchData(true), 30_000);

        // Check if we should auto-open a stock from URL
        const match = window.location.pathname.match(/^\/screener\/(.+)$/);
        if (match && records.length) {
            const sym = match[1].toUpperCase();
            const rec = records.find(r => (r.stocks?.symbol || r.symbol || '').toUpperCase() === sym);
            if (rec) setSelected(buildResult(rec));
        }

        return () => clearInterval(tid);
    }, [fetchData, records.length]);

    const filtered = useMemo(() => {
        let list = records.filter(r => {
            const sym = (r.stocks?.symbol || r.symbol || '').toUpperCase();
            const conf = +(r.confidence_score ?? 0);
            const rr   = +(r.risk_reward ?? 0);
            const tgt = Math.abs(+(r.target_pct ?? 0));
            const sl  = r.stop_loss_pct != null ? Math.abs(+(r.stop_loss_pct)) : 0;

            return (
                (filters.signal === 'ALL' || r.prediction === filters.signal) &&
                conf >= filters.minConf &&
                rr   >= filters.minRR &&
                tgt  >= filters.minTarget &&
                sl   <= filters.maxSL &&
                (!search || sym.includes(search.toUpperCase()))
            );
        });

        list = [...list].sort((a, b) => {
            if (sort.key === 'symbol') {
                const as = (a.stocks?.symbol || a.symbol || '').toUpperCase();
                const bs = (b.stocks?.symbol || b.symbol || '').toUpperCase();
                return sort.dir * as.localeCompare(bs);
            }
            const av = a[sort.key] ?? a.ai_analysis?.[sort.key] ?? 0;
            const bv = b[sort.key] ?? b.ai_analysis?.[sort.key] ?? 0;
            return sort.dir * (bv > av ? 1 : bv < av ? -1 : 0);
        });

        return list;
    }, [records, filters, sort, search]);

    const handleSort = (key) => {
        setSort(prev => ({
            key,
            dir: prev.key === key ? -prev.dir : -1
        }));
    };

    const stats = useMemo(() => {
        const buys = filtered.filter(r => r.prediction === 'BUY').length;
        const avgConf = filtered.length ? filtered.reduce((s, r) => s + +(r.confidence_score ?? 0), 0) / filtered.length : 0;
        const avgRR = (() => { const v = filtered.filter(r => r.risk_reward != null); return v.length ? v.reduce((s, r) => s + +r.risk_reward, 0) / v.length : 0; })();
        return { total: filtered.length, buys, avgConf, avgRR };
    }, [filtered]);

    if (selected) {
        return (
            <main className="max-w-[1600px] mx-auto px-0 sm:px-8 pt-4 sm:pt-8 pb-32">
                <StockDetailsPage selected={selected} onBack={handleBack} />
            </main>
        );
    }

    if (loading && !records.length) {
        return (
            <main className="max-w-[1600px] mx-auto p-4 sm:p-8 space-y-6 sm:space-y-10">
                <div className="h-44 bg-white/5 rounded-3xl w-full animate-pulse" />
                <div className="flex flex-col lg:flex-row gap-8">
                    <div className="w-72 h-[500px] bg-white/5 rounded-2xl animate-pulse hidden lg:block" />
                    <div className="flex-1">
                        <TableSkeleton />
                    </div>
                </div>
            </main>
        );
    }

    return (
        <main className="max-w-[1600px] mx-auto px-4 sm:px-8 pt-4 sm:pt-8 pb-32">
            {/* ── Elite Header Dashboard ────────────────────────────────────── */}
            <div className="relative p-3 sm:p-5 rounded-lg sm:rounded-xl shadow-2xl mb-4 sm:mb-8 overflow-hidden" 
                style={{ background: 'rgba(8, 15, 26, 0.6)', border: '1px solid rgba(255, 255, 255, 0.05)', backdropFilter: 'blur(40px)' }}>
                <div className="absolute top-0 left-0 right-0 h-[2px] opacity-40" style={{ background: 'linear-gradient(90deg, transparent, #3b82f6, transparent)' }} />
                
                <div className="flex flex-col lg:flex-row gap-3 sm:gap-5 items-center relative z-10">
                    <div className="flex-1 w-full">
                        <div className="relative group">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 text-slate-500 group-focus-within:text-blue-400 transition-colors" />
                            <input
                                type="text"
                                placeholder="Search symbol..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="w-full bg-white/5 border border-white/10 rounded-lg sm:rounded-xl py-1.5 sm:py-2.5 pl-10 sm:pl-14 pr-10 text-xs sm:text-base font-bold text-white outline-none focus:border-blue-500/50 focus:bg-white/10 transition-all placeholder:text-slate-600 shadow-inner"
                            />
                            {search && (
                                <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-white/10 rounded-full transition-colors">
                                    <X className="w-3 h-3 text-slate-500" />
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full lg:w-auto">
                        <div className="flex items-center gap-0.5 p-0.5 rounded-lg sm:rounded-xl bg-black/40 border border-white/5 shrink-0 w-full sm:w-auto">
                            {[
                                { k: 'table', icon: List, label: 'Table' },
                                { k: 'heatmap', icon: LayoutGrid, label: 'Grid' }
                            ].map(v => (
                                <button key={v.k} onClick={() => setView(v.k)}
                                    className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 sm:px-6 py-1.5 sm:py-2 rounded-md sm:rounded-lg text-[10px] sm:text-xs font-black uppercase tracking-widest transition-all ${
                                        view === v.k ? 'bg-blue-600 text-white shadow-xl shadow-blue-600/20' : 'text-slate-500 hover:text-white'
                                    }`}>
                                    <v.icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                    <span className="hidden xs:inline">{v.label}</span>
                                    <span className="xs:hidden uppercase">{v.k}</span>
                                </button>
                            ))}
                        </div>
                        
                        <div className="flex gap-1.5 w-full sm:w-auto">
                            <button onClick={() => setShowFilters(!showFilters)}
                                className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 sm:px-6 py-1.5 sm:py-2 rounded-lg border transition-all font-black text-[10px] sm:text-xs uppercase tracking-widest ${
                                    showFilters ? 'bg-blue-600/10 border-blue-500/30 text-blue-400 shadow-inner' : 'bg-white/5 border-white/10 text-slate-500 hover:text-white'
                                }`}>
                                <SlidersHorizontal className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                <span>Filters</span>
                            </button>
                        </div>
                    </div>
                </div>

                {/* KPI Ribbon */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-8 mt-3 sm:mt-5 pt-3 sm:pt-5 border-t border-white/5">
                    {[
                        { l: 'Matching', v: stats.total, c: 'text-white', icon: BarChart2 },
                        { l: 'High Conv.', v: stats.buys, c: 'text-buy', icon: TrendingUp },
                        { l: 'Avg Conf.', v: `${stats.avgConf.toFixed(0)}%`, c: 'text-blue-400', icon: Zap },
                        { l: 'Profit Factor', v: `${stats.avgRR.toFixed(1)}x`, c: 'text-hold', icon: Target },
                    ].map(s => (
                        <div key={s.l} className="flex items-center gap-3 sm:gap-4 group">
                            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-white/5 border border-white/5 flex items-center justify-center transition-transform shrink-0">
                                <s.icon className={`w-3.5 sm:w-4 h-3.5 sm:h-4 ${s.c}`} />
                            </div>
                            <div className="space-y-0.5 min-w-0">
                                <p className="text-[8px] sm:text-[10px] font-black text-slate-500 uppercase tracking-widest truncate">{s.l}</p>
                                <p className={`text-xs sm:text-xl font-black tabular-nums ${s.c}`}>{s.v}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* ── Main Layout Workspace ────────────────────────────────────── */}
            <div className="flex flex-col lg:flex-row gap-5 sm:gap-10 items-start">
                {/* Sidebar Param Filters */}
                {showFilters && (
                    <div className="w-full lg:w-72 shrink-0 lg:sticky lg:top-8 mb-6 lg:mb-0 animate-in slide-in-from-left-4 fade-in duration-500">
                        <FilterPanel 
                            filters={filters} 
                            setFilters={setFilters} 
                            counts={{ ALL: records.length, BUY: records.filter(r => r.prediction === 'BUY').length, SELL: records.filter(r => r.prediction === 'SELL').length, HOLD: records.filter(r => r.prediction === 'HOLD').length }}
                            onReset={() => setFilters(FILTER_DEFAULTS)}
                        />
                    </div>
                )}

                {/* Results Engine */}
                <div className="flex-1 w-full min-w-0">
                    {filtered.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-24 sm:py-48 text-center rounded-lg sm:rounded-xl p-6" 
                            style={{ background: 'rgba(8, 15, 26, 0.4)', border: '1px dashed rgba(255, 255, 255, 0.05)' }}>
                            <div className="p-6 rounded-2xl bg-white/5 mb-4 ring-1 ring-white/10">
                                <Search className="w-10 h-10 sm:w-16 sm:h-16 text-slate-800" />
                            </div>
                            <h3 className="text-lg sm:text-2xl font-black text-white mb-2">No Signals Found</h3>
                            <p className="text-[10px] sm:text-base text-slate-500 max-w-xs mx-auto leading-relaxed">
                                Try expanding your search or reducing the required confidence score.
                            </p>
                        </div>
                    ) : view === 'heatmap' ? (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-2.5 sm:gap-5 animate-in fade-in zoom-in-95 duration-500">
                            {filtered.map(r => (
                                <HeatmapBlock key={r.id} r={r} onClick={handleSelect} />
                            ))}
                        </div>
                    ) : (
                        <div className="rounded-lg sm:rounded-xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-700" 
                            style={{ background: 'rgba(8, 15, 26, 0.5)', border: '1px solid rgba(255, 255, 255, 0.05)', backdropFilter: 'blur(20px)' }}>
                            <div className="overflow-x-auto no-scrollbar">
                                <table className="w-full text-left border-collapse min-w-full">
                                    <thead>
                                        <tr className="border-b border-white/5" style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.03) 0%, transparent 100%)' }}>
                                            <th className="px-2 sm:px-5 py-4 sm:py-6 text-[9px] sm:text-[10px] font-black text-slate-500 uppercase tracking-widest">#</th>
                                            <th className="px-2 sm:px-5 py-4 sm:py-6 group cursor-pointer hover:bg-white/5 transition-colors" onClick={() => handleSort('symbol')}>
                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-[9px] sm:text-[10px] font-black text-slate-500 uppercase tracking-widest">Symbol</span>
                                                    <SortIcon sort={sort} col="symbol" />
                                                </div>
                                            </th>
                                            <th className="px-2 sm:px-5 py-4 sm:py-6 group cursor-pointer hover:bg-white/5 transition-colors" onClick={() => handleSort('prediction')}>
                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-[9px] sm:text-[10px] font-black text-slate-500 uppercase tracking-widest">Signal</span>
                                                    <SortIcon sort={sort} col="prediction" />
                                                </div>
                                            </th>
                                            <th className="px-3 sm:px-5 py-6 group cursor-pointer hover:bg-white/5 transition-colors hidden lg:table-cell" onClick={() => handleSort('confidence_score')}>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Confidence</span>
                                                    <SortIcon sort={sort} col="confidence_score" />
                                                </div>
                                            </th>
                                            <th className="px-2 sm:px-5 py-4 sm:py-6 text-[9px] sm:text-[10px] font-black text-slate-500 uppercase tracking-widest">LTP</th>
                                            <th className="px-3 sm:px-5 py-6 group cursor-pointer hover:bg-white/5 transition-colors hidden md:table-cell" onClick={() => handleSort('target_price')}>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Target</span>
                                                    <SortIcon sort={sort} col="target_price" />
                                                </div>
                                            </th>
                                            <th className="px-3 sm:px-5 py-6 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] hidden xl:table-cell">Stop Loss</th>
                                            <th className="px-3 sm:px-5 py-6 group cursor-pointer hover:bg-white/5 transition-colors hidden md:table-cell" onClick={() => handleSort('risk_reward')}>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">R/R</span>
                                                    <SortIcon sort={sort} col="risk_reward" />
                                                </div>
                                            </th>
                                            <th className="px-2 sm:px-5 py-4 sm:py-6"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5">
                                        {filtered.slice(0, displayLimit).map((r, i) => (
                                            <TableRow key={r.id} r={r} rank={i + 1} onSelect={handleSelect} />
                                        ))}
                                    </tbody>
                                </table>
                                {filtered.length > displayLimit && (
                                    <div className="p-8 flex justify-center">
                                        <button 
                                            onClick={() => setDisplayLimit(prev => prev + 50)}
                                            className="px-8 py-3 rounded-xl bg-blue-600 text-white font-black text-xs uppercase tracking-[0.2em] shadow-xl shadow-blue-600/20 hover:scale-105 transition-all"
                                        >
                                            Show More Signals
                                        </button>
                                    </div>
                                )}
                            </div>
                            
                            {/* Pro Bottom Navigation */}
                            <div className="px-3 sm:px-8 py-3 sm:py-6 border-t border-white/10 bg-black/40 flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-6">
                                <div className="flex items-center gap-2 sm:gap-4">
                                    <div className="flex -space-x-1 sm:-space-x-2">
                                        {filtered.slice(0, 3).map((r, i) => (
                                            <div key={i} className="w-5 h-5 sm:w-8 sm:h-8 rounded-full border border-[#050d1a] bg-blue-600 flex items-center justify-center text-[6px] sm:text-[8px] font-black text-white ring-1 ring-white/10">
                                                {(r.stocks?.symbol || r.symbol || '?')[0]}
                                            </div>
                                        ))}
                                    </div>
                                    <p className="text-[9px] sm:text-xs font-bold text-slate-400">
                                        <span className="text-white">{filtered.length}</span> institutional signals
                                    </p>
                                </div>
                                <div className="flex items-center gap-2 sm:gap-3">
                                    <div className="flex items-center gap-1.5 px-2 sm:px-4 py-1 sm:py-2 rounded-lg bg-blue-500/10 border border-blue-500/20">
                                        <Info className="w-2.5 sm:w-3.5 h-2.5 sm:h-3.5 text-blue-400" />
                                        <p className="text-[8px] sm:text-[10px] font-black text-blue-400 uppercase tracking-widest">
                                            Scan Active
                                        </p>
                                    </div>
                                    <p className="text-[8px] sm:text-[11px] font-black text-slate-500 uppercase tracking-widest">
                                        {filtered.length} / {records.length}
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </main>
    );
}
