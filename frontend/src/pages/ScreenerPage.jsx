import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    TrendingUp, TrendingDown, Minus, RefreshCw, SlidersHorizontal,
    ChevronUp, ChevronDown, Search, X, Target, Shield, Zap,
    BarChart2, Activity, ArrowRight, Filter, LayoutGrid, List
} from 'lucide-react';
import { api } from '../api';
import { fmt } from '../utils/formatters';

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

// ── Filter Panel ──────────────────────────────────────────────────────────────
function FilterPanel({ filters, setFilters, counts, onReset }) {
    const set = (k, v) => setFilters(f => ({ ...f, [k]: v }));

    return (
        <div className="rounded-2xl p-4 sm:p-5 space-y-6 shadow-2xl backdrop-blur-xl transition-shadow duration-300 hover:shadow-[0_8px_30px_rgba(0,0,0,0.3)]"
            style={{ background: 'var(--color-glass)', border: '1px solid var(--color-glass-border)' }}>
            <div className="flex items-center justify-between pb-3 border-b border-white/5">
                <div className="flex items-center gap-2">
                    <Filter className="w-4 h-4 text-blue-400" />
                    <span className="text-[10px] sm:text-xs font-black text-white uppercase tracking-widest">Screener Filters</span>
                </div>
                <button onClick={onReset} className="text-[10px] font-black text-slate-500 hover:text-white uppercase tracking-widest transition-colors">
                    Reset
                </button>
            </div>

            {/* Signal Selection */}
            <div>
                <p className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest mb-3 text-slate-500">Market Signal</p>
                <div className="grid grid-cols-2 gap-2">
                    {['ALL', 'BUY', 'HOLD', 'SELL'].map(s => {
                        const active = filters.signal === s;
                        const cfg = SIG[s] || {};
                        return (
                            <button key={s} onClick={() => set('signal', s)}
                                className={`flex items-center justify-between px-2.5 py-2 sm:px-3 sm:py-2.5 rounded-xl text-[10px] sm:text-xs font-black transition-all border ${
                                    active ? 'bg-blue-600/10 border-blue-500/40 text-white shadow-lg shadow-blue-500/5' : 'bg-white/5 border-transparent text-slate-400 hover:bg-white/10'
                                }`}>
                                <div className="flex items-center gap-1.5 sm:gap-2">
                                    {cfg.Icon && <cfg.Icon className={`w-3 h-3 ${active ? cfg.color : ''}`} />}
                                    <span>{s}</span>
                                </div>
                                {counts[s] > 0 && <span className="text-[9px] opacity-40">{counts[s]}</span>}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Sliders */}
            {[
                { k: 'minConf',   l: 'Min Confidence', u: '%', min: 0, max: 99, step: 1,  c: '#3b82f6' },
                { k: 'minRR',     l: 'Min Risk/Reward', u: 'x', min: 0, max: 5,  step: 0.1, c: '#8b5cf6' },
                { k: 'minTarget', l: 'Min Target',     u: '%', min: 0, max: 30, step: 0.5, c: '#10b981' },
                { k: 'maxSL',     l: 'Max Stop Loss',   u: '%', min: 1, max: 20, step: 0.5, c: '#ef4444' },
            ].map(s => (
                <div key={s.k} className="space-y-3">
                    <div className="flex items-center justify-between">
                        <p className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-slate-500">{s.l}</p>
                        <span className="text-[10px] sm:text-xs font-black text-white px-2 py-0.5 rounded-lg bg-white/5 border border-white/5">
                            {s.k === 'minTarget' ? '+' : ''}{filters[s.k]}{s.u}
                        </span>
                    </div>
                    <div className="relative group">
                        <input type="range" min={s.min} max={s.max} step={s.step} value={filters[s.k]}
                            onChange={e => set(s.k, +e.target.value)}
                            className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-white/5 group-hover:bg-white/10 transition-colors"
                            style={{ accentColor: s.c }} />
                    </div>
                </div>
            ))}
        </div>
    );
}

// ── Heatmap Block ─────────────────────────────────────────────────────────────
function HeatmapBlock({ r, onClick }) {
    const sig = SIG[r.prediction] || SIG.HOLD;
    const conf = +(r.confidence_score ?? 0);
    const sym = r.stocks?.symbol || r.symbol || '?';
    const alpha = 0.08 + (conf / 100) * 0.4;

    return (
        <button onClick={() => onClick(r)}
            className={`group relative rounded-2xl overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_8px_30px_rgba(0,0,0,0.3)] flex flex-col items-center justify-center p-3 text-center`}
            style={{
                background: 'var(--color-glass)',
                border: `1px solid ${sig.borderC}`,
                minHeight: '80px',
            }}>
            {/* Soft inner glow based on prediction */}
            <div className="absolute inset-0 pointer-events-none opacity-20 group-hover:opacity-40 transition-opacity duration-500"
                style={{ background: `radial-gradient(circle at 50% 100%, ${sig.borderC}, transparent 70%)` }} />
            
            <div className="relative z-10">
            <p className="text-[11px] sm:text-xs font-black text-white leading-tight">{sym}</p>
            <p className={`text-[9px] sm:text-[10px] mt-1 font-black uppercase tracking-tighter ${sig.color}`}>{r.prediction}</p>
            <div className="mt-2 w-full bg-black/20 h-1 rounded-full overflow-hidden">
                <div className={`h-full ${r.prediction === 'BUY' ? 'bg-buy shadow-[0_0_8px_rgba(16,185,129,0.8)]' : r.prediction === 'SELL' ? 'bg-sell shadow-[0_0_8px_rgba(239,68,68,0.8)]' : 'bg-hold shadow-[0_0_8px_rgba(245,158,11,0.8)]'}`} style={{ width: `${conf}%` }} />
            </div>
            </div>
        </button>
    );
}

// ── Table Row ─────────────────────────────────────────────────────────────────
function TableRow({ r, rank, onSelect }) {
    const sig = SIG[r.prediction] || SIG.HOLD;
    const sym = r.stocks?.symbol || r.symbol || '?';
    const conf = +(r.confidence_score ?? 0);
    const rr = r.risk_reward;
    const rrColor = rr >= 2 ? 'text-buy' : rr >= 1 ? 'text-hold' : 'text-sell';
    const latestClose = r.chart_data?.length ? r.chart_data[r.chart_data.length - 1]?.close : null;

    return (
        <tr className="border-b transition-colors cursor-pointer group hover:bg-white/5"
            style={{ borderColor: 'var(--color-glass-border)' }}
            onClick={() => onSelect(r)}>
            <td className="px-4 py-4 text-[10px] font-black text-slate-600 tabular-nums">{rank}</td>
            <td className="px-4 py-4">
                <div className="flex items-center gap-3">
                    <div className={`w-1 h-8 rounded-full ${r.prediction === 'BUY' ? 'bg-buy' : r.prediction === 'SELL' ? 'bg-sell' : 'bg-hold'} opacity-40 group-hover:opacity-100 transition-opacity`} />
                    <span className="text-sm font-black text-white group-hover:text-blue-400 transition-colors uppercase tracking-tight">{sym}</span>
                </div>
            </td>
            <td className="px-4 py-4">
                <div className={`flex items-center gap-1.5 w-fit px-3 py-1.5 rounded-xl border ${sig.border} ${sig.bg} shadow-lg shadow-black/20`}>
                    <sig.Icon className={`w-3 h-3 ${sig.color}`} />
                    <span className={`text-[10px] sm:text-[11px] font-black tracking-widest ${sig.color}`}>{r.prediction}</span>
                </div>
            </td>
            <td className="px-4 py-4">
                <div className="flex items-center gap-3">
                    <div className="hidden sm:block w-20 h-1.5 rounded-full bg-white/5 overflow-hidden">
                        <div className={`h-full ${r.prediction === 'BUY' ? 'bg-buy' : r.prediction === 'SELL' ? 'bg-sell' : 'bg-hold'} transition-all duration-1000`} 
                             style={{ width: `${conf}%` }} />
                    </div>
                    <span className={`text-[11px] font-black tabular-nums ${sig.color}`}>{conf.toFixed(1)}%</span>
                </div>
            </td>
            <td className="px-4 py-4 text-xs font-bold tabular-nums text-white/80">{fmtPrice(latestClose)}</td>
            <td className="px-4 py-4">
                <div className="flex flex-col">
                    <span className="text-xs font-black text-buy">{fmtPrice(r.target_price)}</span>
                    <span className="text-[10px] font-bold text-buy/50">{pct(r.target_pct)}</span>
                </div>
            </td>
            <td className="px-4 py-4">
                <div className="flex flex-col">
                    <span className="text-xs font-black text-sell">{fmtPrice(r.stop_loss)}</span>
                    <span className="text-[10px] font-bold text-sell/50">{r.stop_loss_pct != null ? `-${fmt(r.stop_loss_pct)}%` : '—'}</span>
                </div>
            </td>
            <td className="px-4 py-4"><span className={`text-sm font-black tabular-nums ${rrColor}`}>{rr != null ? `${fmt(rr)}x` : '—'}</span></td>
            <td className="px-4 py-4 text-right">
                <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all text-blue-400 inline" />
            </td>
        </tr>
    );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ScreenerPage({ onSelectStock }) {
    const [records, setRecords] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filters, setFilters] = useState(FILTER_DEFAULTS);
    const [sort, setSort] = useState(SORT_INIT);
    const [search, setSearch] = useState('');
    const [view, setView] = useState('table'); 
    const [showFilters, setShowFilters] = useState(true);

    const fetchData = useCallback(async (isBackground = false) => {
        if (!isBackground) setLoading(true);
        try {
            const res = await api.getHistory();
            setRecords(res.data.data || []);
        } catch { /* silent */ } finally {
            if (!isBackground) setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
        const tid = setInterval(() => fetchData(true), 10000);
        return () => clearInterval(tid);
    }, [fetchData]);

    const filtered = useMemo(() => {
        let list = records.filter(r => {
            const sym = (r.stocks?.symbol || r.symbol || '').toUpperCase();
            const conf = +(r.confidence_score ?? 0);
            const rr = +(r.risk_reward ?? 0);
            const tgt = +(r.target_pct ?? 0);
            const sl = Math.abs(+(r.stop_loss_pct ?? 99));

            return (
                (filters.signal === 'ALL' || r.prediction === filters.signal) &&
                conf >= filters.minConf &&
                rr >= filters.minRR &&
                tgt >= filters.minTarget &&
                sl <= filters.maxSL &&
                (!search || sym.includes(search.toUpperCase()))
            );
        });

        list = [...list].sort((a, b) => {
            const av = a[sort.key] ?? a.ai_analysis?.[sort.key] ?? 0;
            const bv = b[sort.key] ?? b.ai_analysis?.[sort.key] ?? 0;
            return sort.dir * (bv - av);
        });

        return list;
    }, [records, filters, sort, search]);

    const stats = useMemo(() => {
        const buys = filtered.filter(r => r.prediction === 'BUY').length;
        const avgConf = filtered.length ? filtered.reduce((s, r) => s + +(r.confidence_score ?? 0), 0) / filtered.length : 0;
        const avgRR = (() => { const v = filtered.filter(r => r.risk_reward != null); return v.length ? v.reduce((s, r) => s + +r.risk_reward, 0) / v.length : 0; })();
        return { total: filtered.length, buys, avgConf, avgRR };
    }, [filtered]);

    if (loading) {
        return (
            <main className="max-w-[1600px] mx-auto p-4 sm:p-6 md:p-8 space-y-8 animate-pulse">
                <div className="h-44 bg-white/5 rounded-2xl w-full" />
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                    <div className="h-[400px] bg-white/5 rounded-2xl" />
                    <div className="lg:col-span-3 h-[400px] bg-white/5 rounded-2xl" />
                </div>
            </main>
        );
    }

    return (
        <main className="max-w-[1600px] mx-auto p-4 sm:p-6 md:p-8 pb-20">
            {/* Consolidated Header Panel */}
            <div className="relative p-4 sm:p-6 rounded-2xl shadow-xl mb-6 overflow-hidden transition-shadow duration-300 hover:shadow-[0_8px_30px_rgba(0,0,0,0.3)]" style={{ background: 'var(--color-glass)', border: '1px solid var(--color-glass-border)' }}>
                <div className="absolute top-0 left-0 right-0 h-[2px] opacity-60" style={{ background: 'linear-gradient(90deg, transparent, #3b82f6, transparent)' }} />
                <div className="flex flex-col lg:flex-row gap-4 items-center relative z-10">
                    {/* Search & Status Indicator */}
                    <div className="relative flex-1 w-full flex items-center gap-4">
                        <div className="relative flex-1">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                            <input
                                type="text"
                                placeholder="Search symbol or keyword..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-12 pr-4 text-sm font-bold text-white outline-none focus:border-blue-500/40 focus:bg-white/10 transition-all placeholder:text-slate-600"
                            />
                        </div>
                        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 whitespace-nowrap">
                            <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                                <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500"></span>
                            </span>
                            <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest">Live Sync</span>
                        </div>
                    </div>

                    {/* Controls Row */}
                    <div className="flex items-center gap-2 w-full lg:w-auto overflow-x-auto no-scrollbar pb-1 lg:pb-0">
                        {/* View toggle */}
                        <div className="flex items-center gap-1 p-1 rounded-xl bg-white/5 border border-white/5 shrink-0">
                            {[
                                { k: 'table', icon: List, label: 'Table' },
                                { k: 'heatmap', icon: LayoutGrid, label: 'Heatmap' }
                            ].map(v => (
                                <button key={v.k} onClick={() => setView(v.k)}
                                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                                        view === v.k ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'text-slate-500 hover:text-white'
                                    }`}>
                                    <v.icon className="w-3.5 h-3.5" />
                                    <span>{v.label}</span>
                                </button>
                            ))}
                        </div>
                        
                        <button onClick={() => setShowFilters(!showFilters)}
                            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border transition-all font-black text-[10px] uppercase tracking-widest shrink-0 ${
                                showFilters ? 'bg-blue-600/10 border-blue-500/30 text-blue-400' : 'bg-white/5 border-white/5 text-slate-500 hover:text-white'
                            }`}>
                            <SlidersHorizontal className="w-3.5 h-3.5" />
                            <span>Filters</span>
                        </button>

                        <button onClick={fetchData} className="p-3 rounded-xl bg-white/5 border border-white/5 text-slate-400 hover:text-white transition-all hover:bg-white/10 shrink-0">
                            <RefreshCw className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {/* Screening Stats Panel */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-6 border-t border-white/5">
                    <div className="space-y-1">
                        <p className="text-[9px] sm:text-[10px] font-black text-slate-500 uppercase tracking-widest">Matched</p>
                        <p className="text-lg sm:text-xl font-black text-white">{stats.total}</p>
                    </div>
                    <div className="space-y-1">
                        <p className="text-[9px] sm:text-[10px] font-black text-slate-500 uppercase tracking-widest">Buy Signals</p>
                        <p className="text-lg sm:text-xl font-black text-buy">{stats.buys}</p>
                    </div>
                    <div className="space-y-1">
                        <p className="text-[9px] sm:text-[10px] font-black text-slate-500 uppercase tracking-widest">Avg Conf.</p>
                        <p className="text-lg sm:text-xl font-black text-blue-400">{stats.avgConf.toFixed(0)}%</p>
                    </div>
                    <div className="space-y-1">
                        <p className="text-[9px] sm:text-[10px] font-black text-slate-500 uppercase tracking-widest">Avg R/R</p>
                        <p className="text-lg sm:text-xl font-black text-hold">{stats.avgRR.toFixed(1)}x</p>
                    </div>
                </div>
            </div>

            {/* Main Workspace */}
            <div className="flex flex-col lg:flex-row gap-6 items-start">
                {/* Sidebar Filters */}
                {showFilters && (
                    <div className="w-full lg:w-80 shrink-0 lg:sticky lg:top-8 mb-6 lg:mb-0">
                        <FilterPanel 
                            filters={filters} 
                            setFilters={setFilters} 
                            counts={{ ALL: records.length, BUY: records.filter(r => r.prediction === 'BUY').length, SELL: records.filter(r => r.prediction === 'SELL').length, HOLD: records.filter(r => r.prediction === 'HOLD').length }}
                            onReset={() => setFilters(FILTER_DEFAULTS)}
                        />
                    </div>
                )}

                {/* Content Area */}
                <div className="flex-1 w-full min-w-0">
                    {filtered.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 sm:py-32 text-center rounded-3xl p-6" style={{ background: 'var(--color-glass)', border: '1px dashed var(--color-glass-border)' }}>
                            <div className="p-4 sm:p-6 rounded-3xl bg-white/5 mb-4">
                                <Search className="w-8 h-8 sm:w-12 sm:h-12 text-slate-700" />
                            </div>
                            <h3 className="text-lg sm:text-xl font-black text-white mb-2">No Matches Found</h3>
                            <p className="text-sm text-slate-500 max-w-xs mx-auto">Try loosening your filters or clearing the search.</p>
                        </div>
                    ) : view === 'heatmap' ? (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-8 gap-3 sm:gap-4 animate-in fade-in zoom-in duration-500">
                            {filtered.map(r => (
                                <HeatmapBlock key={r.id} r={r} onClick={onSelectStock} />
                            ))}
                        </div>
                    ) : (
                        <div className="rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500 transition-shadow duration-300 hover:shadow-[0_8px_30px_rgba(0,0,0,0.3)]" style={{ background: 'var(--color-glass)', border: '1px solid var(--color-glass-border)' }}>
                            <div className="overflow-x-auto no-scrollbar">
                                <table className="w-full text-left border-collapse min-w-[900px] sm:min-w-[1000px]">
                                    <thead className="border-b border-white/5" style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.01) 100%)' }}>
                                        <tr>
                                            <th className="px-4 py-5 text-[9px] sm:text-[10px] font-black text-slate-500 uppercase tracking-widest">#</th>
                                            <th className="px-4 py-5 text-[9px] sm:text-[10px] font-black text-slate-500 uppercase tracking-widest">Symbol</th>
                                            <th className="px-4 py-5 text-[9px] sm:text-[10px] font-black text-slate-500 uppercase tracking-widest">Signal</th>
                                            <th className="px-4 py-5 text-[9px] sm:text-[10px] font-black text-slate-500 uppercase tracking-widest">Confidence</th>
                                            <th className="px-4 py-5 text-[9px] sm:text-[10px] font-black text-slate-500 uppercase tracking-widest">LTP</th>
                                            <th className="px-4 py-5 text-[9px] sm:text-[10px] font-black text-slate-500 uppercase tracking-widest">Target</th>
                                            <th className="px-4 py-5 text-[9px] sm:text-[10px] font-black text-slate-500 uppercase tracking-widest">Stop Loss</th>
                                            <th className="px-4 py-5 text-[9px] sm:text-[10px] font-black text-slate-500 uppercase tracking-widest">R/R</th>
                                            <th className="px-4 py-5"></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filtered.map((r, i) => (
                                            <TableRow key={r.id} r={r} rank={i + 1} onSelect={onSelectStock} />
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            
                            <div className="p-4 border-t border-white/5 bg-black/20 flex flex-col sm:flex-row items-center justify-between gap-2">
                                <p className="text-[10px] sm:text-[11px] font-bold text-slate-500 text-center">
                                    Displaying <span className="text-white">{filtered.length}</span> assets
                                </p>
                                <p className="text-[10px] sm:text-[11px] font-bold text-blue-400 uppercase tracking-widest animate-pulse text-center">
                                    Click any row for deep AI analysis
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </main>
    );
}
