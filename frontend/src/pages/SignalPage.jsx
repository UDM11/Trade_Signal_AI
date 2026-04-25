import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    TrendingUp, TrendingDown, Minus, RefreshCw, Play, Clock,
    BarChart3, Zap, Search, Activity, Target, Shield, X,
} from 'lucide-react';
import { api } from '../api';
import { useToast } from '../contexts/ToastContext';
import { timeAgo, getSignalColors } from '../utils/formatters';
import StockDetailsPage from './stock-details';

// Removed StatusBar as per user request to simplify and focus on BUY signals.
function ScanAction({ onRun, running }) {
    return (
        <div className="relative rounded-3xl p-6 flex flex-col md:flex-row items-center justify-between gap-6 overflow-hidden shadow-2xl transition-all duration-500 hover:shadow-blue-500/10"
            style={{ background: 'var(--color-glass)', border: '1px solid var(--color-glass-border)' }}>
            <div className="absolute top-0 left-0 w-1 h-full bg-blue-500 shadow-[0_0_20px_rgba(59,130,246,0.5)]" />
            
            <div className="flex items-center gap-5">
                <div className="w-14 h-14 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0 shadow-inner">
                    <Zap className={`w-7 h-7 text-blue-400 ${running ? 'animate-pulse' : ''}`} />
                </div>
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <h2 className="text-xl font-black text-white tracking-tight">Market Intelligence</h2>
                        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20">
                            <span className="relative flex h-1.5 w-1.5">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-blue-500"></span>
                            </span>
                            <span className="text-[8px] font-black text-blue-400 uppercase tracking-widest">Live Sync</span>
                        </div>
                    </div>
                    <p className="text-xs text-slate-500 max-w-sm">Scan the entire NEPSE market for high-probability <span className="text-emerald-400 font-bold">BUY</span> signals using our Ensemble AI engine.</p>
                </div>
            </div>

            <button onClick={onRun} disabled={running}
                className="w-full md:w-auto px-8 py-3.5 rounded-2xl text-sm font-black transition-all shrink-0 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed group relative overflow-hidden"
                style={{
                    background: running ? 'rgba(59,130,246,0.1)' : 'rgba(59,130,246,0.15)',
                    color: '#60a5fa',
                    border: '1px solid rgba(59,130,246,0.3)',
                }}>
                <div className="flex items-center justify-center gap-2 relative z-10">
                    {running ? (
                        <><RefreshCw className="w-4 h-4 animate-spin" />Scanning Market...</>
                    ) : (
                        <><Activity className="w-4 h-4 group-hover:animate-bounce" />Start AI Scan</>
                    )}
                </div>
                {!running && (
                    <div className="absolute inset-0 bg-blue-500/5 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
                )}
            </button>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// SignalCard  — premium tile with glow + confidence bar
// ─────────────────────────────────────────────────────────────────────────────
const SIG_ICON = { BUY: TrendingUp, SELL: TrendingDown, HOLD: Minus };
const SIG_LABEL = { BUY: 'Strong Buy', SELL: 'Sell Signal', HOLD: 'Hold' };

function SignalCard({ record, onClick, active }) {
    const sig    = record.prediction;
    const sym    = record.stocks?.symbol || record.symbol || '?';
    const conf   = record.confidence_score ?? record.confidence ?? 0;
    const confPct = (conf * 100).toFixed(1);
    const rr     = record.risk_reward ?? null;
    const tp     = record.target_pct ?? null;
    const colors = getSignalColors(sig);
    const Icon   = SIG_ICON[sig] || Minus;

    return (
        <button
            onClick={() => onClick(record)}
            className="group relative rounded-2xl overflow-hidden text-left transition-all duration-300 w-full active:scale-[0.97] hover:-translate-y-1 hover:shadow-2xl"
            style={{
                background: active ? `${colors.text}12` : 'rgba(255,255,255,0.02)',
                border: `1px solid ${active ? colors.text : 'rgba(255,255,255,0.05)'}`,
            }}
            onMouseEnter={e => {
                e.currentTarget.style.background = `${colors.text}12`;
                e.currentTarget.style.borderColor = `${colors.text}35`;
            }}
            onMouseLeave={e => {
                if (!active) {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.02)';
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.05)';
                }
            }}
        >
            {/* Top glow accent */}
            <div className="absolute top-0 left-0 right-0 h-[2px] transition-opacity duration-300"
                style={{
                    background: `linear-gradient(90deg, transparent, ${colors.text}, transparent)`,
                    opacity: active ? 1 : 0,
                }} />

            {/* Card body */}
            <div className="p-3.5">
                {/* Row 1: Symbol + Badge */}
                <div className="flex items-center justify-between mb-3 relative z-10">
                    <span className="text-sm font-black text-white tracking-wide transition-all group-hover:!text-[var(--acc-color)] group-hover:translate-x-1" style={{ '--acc-color': colors.text }}>{sym}</span>
                    <div className="flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-black transition-all group-hover:scale-105"
                        style={{ background: `${colors.text}18`, color: colors.text, border: `1px solid ${colors.text}30`, boxShadow: `0 0 10px ${colors.text}22` }}>
                        <Icon className="w-2.5 h-2.5" />
                        {sig}
                    </div>
                </div>

                {/* Row 2: Confidence */}
                <div className="mb-2.5 relative z-10">
                    <div className="flex justify-between items-center mb-1">
                        <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">AI Confidence</span>
                        <span className="text-xs font-black tabular-nums transition-all group-hover:scale-110" style={{ color: colors.text }}>{confPct}%</span>
                    </div>
                    <div className="h-1 w-full rounded-full bg-white/5">
                        <div className="h-full rounded-full transition-all duration-500"
                            style={{ width: `${confPct}%`, background: `linear-gradient(90deg, ${colors.text}80, ${colors.text})`, boxShadow: `0 0 8px ${colors.text}40` }} />
                    </div>
                </div>

                {/* Row 3: Stats */}
                <div className="flex items-center justify-between gap-1 pt-2 border-t border-white/5">
                    {tp !== null ? (
                        <div>
                            <p className="text-[8px] text-slate-600 uppercase font-bold">Target</p>
                            <p className="text-[11px] font-black text-emerald-400 tabular-nums">+{tp.toFixed(1)}%</p>
                        </div>
                    ) : (
                        <div>
                            <p className="text-[8px] text-slate-600 uppercase font-bold">Signal</p>
                            <p className="text-[10px] font-black text-slate-400">{SIG_LABEL[sig]}</p>
                        </div>
                    )}
                    {rr !== null && (
                        <div className="text-right">
                            <p className="text-[8px] text-slate-600 uppercase font-bold">R/R</p>
                            <p className="text-[11px] font-black text-amber-400 tabular-nums">{rr.toFixed(1)}x</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Active indicator bottom bar */}
            {active && (
                <div className="absolute bottom-0 left-0 right-0 h-[2px]"
                    style={{ background: `linear-gradient(90deg, transparent, ${colors.text}, transparent)` }} />
            )}

            {/* Hover glow overlay */}
            <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
                style={{ background: `radial-gradient(circle at 50% 0%, ${colors.text}08 0%, transparent 70%)` }} />
        </button>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Skeleton Card
// ─────────────────────────────────────────────────────────────────────────────
function SkeletonCard() {
    return (
        <div className="rounded-2xl p-3.5 space-y-3"
            style={{ background: '#0a1120', border: '1px solid rgba(255,255,255,0.05)' }}>
            <div className="flex items-center justify-between">
                <div className="h-4 w-16 rounded-lg bg-white/10 animate-pulse" />
                <div className="h-5 w-14 rounded-lg bg-white/5 animate-pulse" />
            </div>
            <div className="space-y-1.5">
                <div className="flex justify-between">
                    <div className="h-2.5 w-20 rounded bg-white/5 animate-pulse" />
                    <div className="h-2.5 w-10 rounded bg-white/10 animate-pulse" />
                </div>
                <div className="h-1 w-full rounded-full bg-white/5 animate-pulse" />
            </div>
            <div className="flex justify-between pt-2 border-t border-white/5">
                <div className="h-3 w-14 rounded bg-white/5 animate-pulse" />
                <div className="h-3 w-10 rounded bg-white/5 animate-pulse" />
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// buildResult
// ─────────────────────────────────────────────────────────────────────────────
function buildResult(record) {
    const ai = record.ai_analysis || {};
    return {
        symbol:          record.stocks?.symbol || record.symbol || 'UNKNOWN',
        prediction:      record.prediction,
        confidence:      record.confidence_score ?? record.confidence,
        explanation:     record.explanation,
        target_price:    record.target_price    ?? null,
        stop_loss:       record.stop_loss        ?? null,
        estimated_days:  record.estimated_days   ?? null,
        target_pct:      record.target_pct       ?? null,
        stop_loss_pct:   record.stop_loss_pct    ?? null,
        risk_reward:     record.risk_reward       ?? null,
        all_proba:       record.all_proba         ?? null,
        indicators:      record.indicators        ?? null,
        model_metrics:   record.model_metrics     ?? null,
        ideal_entry:     ai.ideal_entry        ?? null,
        entry_zone_low:  ai.entry_zone_low     ?? null,
        entry_zone_high: ai.entry_zone_high    ?? null,
        entry_condition: ai.entry_condition    ?? null,
        target2:         ai.target2            ?? null,
        target2_pct:     ai.target2_pct        ?? null,
        trailing_stop:   ai.trailing_stop      ?? null,
        signal_history:  record.signal_history || [],
        chartData:       record.chart_data     || [],
        backtest:        record.backtest       || record.backtest_stats || null,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────
const FILTERS = ['ALL', 'BUY', 'HOLD', 'SELL'];

export default function SignalPage({ initialRecord }) {
    const { addToast } = useToast();
    const [records,  setRecords]  = useState([]);
    const [loading,  setLoading]  = useState(true);
    const [running,  setRunning]  = useState(false);
    const [search,   setSearch]   = useState('');
    const [selected, setSelected] = useState(initialRecord ? buildResult(initialRecord) : null);

    // Filter to only show BUY signals
    const filteredRecords = useMemo(() => {
        const buyOnly = records.filter(r => r.prediction === 'BUY');
        if (!search) return buyOnly;
        const q = search.toLowerCase();
        return buyOnly.filter(r => {
            const sym = (r.stocks?.symbol || r.symbol || '').toLowerCase();
            return sym.includes(q);
        });
    }, [records, search]);

    const fetchData = useCallback(async (isBackground = false) => {
        if (!isBackground) setLoading(true);
        try {
            const recs = await api.getHistory();
            setRecords(recs.data.data || []);
        } catch (e) {
            console.error('Signal fetch error:', e);
        } finally {
            if (!isBackground) setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
        const tid = setInterval(() => fetchData(true), 10000);
        return () => clearInterval(tid);
    }, [fetchData]);

    const handleRun = async () => {
        setRunning(true);
        try {
            await api.runPredictions();
            addToast?.({ title: 'Scan Started', message: 'AI prediction cycle is running…', type: 'success' });
            setTimeout(fetchData, 2000);
        } catch {
            addToast?.({ title: 'Error', message: 'Failed to start predictions', type: 'error' });
        } finally {
            setRunning(false);
        }
    };

    const handlePredict = async () => {
        if (!search.trim()) return;
        setRunning(true);
        try {
            const res = await api.predict(search.toUpperCase());
            setSelected(buildResult(res.data));
            addToast?.({ title: 'Analysis Complete', message: `${search.toUpperCase()} analysed by AI`, type: 'success' });
        } catch (e) {
            addToast?.({ title: 'Failed', message: e.response?.data?.error || 'Invalid symbol', type: 'error' });
        } finally {
            setRunning(false);
        }
    };

    const filtered = useMemo(() => {
        const buys = records.filter(r => r.prediction === 'BUY');
        if (!search) return buys;
        const q = search.toUpperCase();
        return buys.filter(r => {
            const sym = (r.stocks?.symbol || r.symbol || '').toUpperCase();
            return sym.includes(q);
        });
    }, [records, search]);

    const stats = useMemo(() => {
        const avgConf = filtered.length
            ? (filtered.reduce((s, r) => s + (r.confidence_score ?? r.confidence ?? 0), 0) / filtered.length * 100)
            : 0;
        const rrs = filtered.filter(r => r.risk_reward).map(r => r.risk_reward);
        const avgRR = rrs.length ? rrs.reduce((s, v) => s + v, 0) / rrs.length : 0;
        return { total: filtered.length, avgConf, avgRR };
    }, [filtered]);

    const noSearchMatch = search && filtered.length === 0;

    return (
        <main className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8 pt-4 pb-24 space-y-8">
            
            {/* ── Scan Action (Simplified UI) ─────────────────────────── */}
            <ScanAction onRun={handleRun} running={running} />

            {/* ── Hot Buy Signals List ────────────────────────────────── */}
            <div className="space-y-6">
                <div className="flex items-center justify-between px-2">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                            <TrendingUp className="w-5 h-5 text-emerald-400" />
                        </div>
                        <div>
                            <h3 className="text-lg font-black text-white tracking-tight">Active BUY Signals</h3>
                            <p className="text-[10px] text-slate-500 uppercase tracking-widest mt-0.5">High-confidence market opportunities</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        {/* Search Input */}
                        <div className="relative group hidden md:block">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 group-focus-within:text-blue-400 transition-colors" />
                            <input type="text" placeholder="Search signals..." value={search}
                                onChange={e => setSearch(e.target.value)}
                                className="pl-9 pr-4 py-2 rounded-xl text-xs font-bold outline-none transition-all border border-white/5 bg-white/5 focus:bg-white/10 focus:border-blue-500/30 text-white placeholder:text-slate-600 w-64" />
                        </div>
                        <span className="text-[10px] font-black text-emerald-400 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.1)]">
                            {filtered.length} Stocks Found
                        </span>
                    </div>
                </div>

                {loading ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                        {[...Array(10)].map((_, i) => <SkeletonCard key={i} />)}
                    </div>
                ) : filtered.length > 0 ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                        {filtered.map(r => (
                            <SignalCard 
                                key={r.id} 
                                record={r} 
                                onClick={setSelected} 
                                active={selected?.symbol === (r.stocks?.symbol || r.symbol)} 
                            />
                        ))}
                    </div>
                ) : (
                    /* Empty State */
                    <div className="rounded-[40px] py-24 flex flex-col items-center justify-center text-center space-y-6"
                        style={{ background: 'var(--color-glass)', border: '1px solid var(--color-glass-border)' }}>
                        <div className="w-20 h-20 rounded-full bg-slate-800/20 border border-white/5 flex items-center justify-center">
                            <Search className="w-8 h-8 text-slate-700" />
                        </div>
                        <div className="space-y-2">
                            <h3 className="text-xl font-black text-white">No Active Buy Signals</h3>
                            <p className="text-sm text-slate-500 max-w-sm mx-auto">
                                The AI engine hasn't identified any high-probability buy opportunities yet. Try running a fresh scan.
                            </p>
                        </div>
                        <button onClick={handleRun} className="px-8 py-3 rounded-2xl bg-blue-600/10 text-blue-400 border border-blue-500/30 font-black text-sm hover:bg-blue-600/20 transition-all active:scale-95">
                            Run Market Analysis
                        </button>
                    </div>
                )}
            </div>

            {/* ── Stock Detail Panel (Full Page Overlay) ────────────────── */}
            {selected && (
                <div className="fixed inset-0 z-[100] bg-[#020813] overflow-y-auto pt-4 pb-20 px-4">
                    <div className="max-w-7xl mx-auto">
                        <div className="flex justify-start mb-6">
                            <button onClick={() => setSelected(null)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/5 text-xs font-bold text-slate-400 hover:text-white transition-all">
                                <X className="w-4 h-4" /> Back to Buy Signals
                            </button>
                        </div>
                        <StockDetailsPage selected={selected} onBack={() => setSelected(null)} />
                    </div>
                </div>
            )}
        </main>
    );
}
