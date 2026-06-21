import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    TrendingUp, TrendingDown, Minus, RefreshCw, Zap, X,
    Search, Activity, Target, BrainCircuit,
    LayoutGrid, List, ArrowUpRight,
    Cpu, Shield, BarChart2, Filter, AlertTriangle, Database
} from 'lucide-react';

// ── Retrain Confirmation Modal ────────────────────────────────────────────────
function RetrainModal({ onConfirm, onCancel }) {
    React.useEffect(() => {
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = ''; };
    }, []);

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onCancel} />
            <div className="relative w-full max-w-md rounded-2xl border border-white/10 shadow-2xl p-6 space-y-5"
                style={{ background: '#0a121e' }}>
                <div className="flex items-start gap-4">
                    <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 shrink-0">
                        <AlertTriangle className="w-6 h-6 text-amber-400" />
                    </div>
                    <div>
                        <h3 className="text-base font-black text-white">Deep Retrain AI Model?</h3>
                        <p className="text-sm text-slate-400 mt-1 leading-relaxed">
                            This rebuilds the AI brain from scratch using the top 50 NEPSE stocks.
                            Takes <span className="text-white font-bold">~5–7 minutes</span>. After completion,
                            run a <span className="text-blue-400 font-bold">Market Scan</span> to generate fresh signals.
                        </p>
                    </div>
                </div>
                <div className="flex gap-3 pt-1">
                    <button onClick={onCancel}
                        className="flex-1 py-2.5 rounded-xl border border-white/10 text-sm font-bold text-slate-400 hover:text-white hover:bg-white/5 transition-all">
                        Cancel
                    </button>
                    <button onClick={onConfirm}
                        className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-sm font-black text-white shadow-lg shadow-blue-600/20 transition-all active:scale-95">
                        Start Retrain
                    </button>
                </div>
            </div>
        </div>
    );
}
import { api } from '../api';
import { getCached, fetchPredictions, isStale, invalidate } from '../cache/predictionsCache';
import { useToast } from '../contexts/ToastContext';
import { timeAgo, getSignalColors } from '../utils/formatters';
import StockDetailsPage from './stock-details';

// ── Helpers ───────────────────────────────────────────────────────────────────
function buildResult(r) {
    return {
        ...r,
        symbol:    r.stocks?.symbol || r.symbol,
        confidence: r.confidence_score ?? r.confidence,
        chartData: r.chart_data || [],
        backtest:  r.backtest || r.backtest_stats || null,
    };
}

// ── Signal Card ─────────────────────────────────────────────────────────────
function SignalCard({ record, onClick, active }) {
    const sig = record.prediction;
    const sym = record.stocks?.symbol || record.symbol || '?';
    const conf = +(record.confidence_score ?? record.confidence ?? 0);
    const rr = record.risk_reward ?? 0;
    const tp = record.target_pct ?? 0;
    const colors = getSignalColors(sig);
    const Icon = sig === 'BUY' ? TrendingUp : sig === 'SELL' ? TrendingDown : Minus;

    return (
        <button onClick={() => onClick(record)}
            className="group relative rounded-lg sm:rounded-xl p-4 sm:p-5 overflow-hidden text-left transition-all duration-500 w-full hover:-translate-y-2"
            style={{ 
                background: active ? `${colors.text}10` : 'rgba(255,255,255,0.02)',
                border: `1px solid ${active ? colors.text : 'rgba(255,255,255,0.05)'}`,
                boxShadow: active ? `0 20px 40px -10px ${colors.text}20` : 'none'
            }}>
            
            <div className="flex flex-col h-full justify-between gap-4 sm:gap-6">
                <div className="flex items-start justify-between">
                    <div className="min-w-0">
                        <h4 className="text-xl sm:text-2xl font-black text-white tracking-tighter uppercase truncate">{sym}</h4>
                        <p className="text-[8px] sm:text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">{timeAgo(record.created_at)}</p>
                    </div>
                    <div className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg sm:rounded-xl text-[8px] sm:text-[10px] font-black uppercase tracking-widest shadow-lg shrink-0"
                        style={{ background: colors.bg, color: colors.text, border: `1px solid ${colors.border}` }}>
                        <Icon className="w-3 sm:w-3.5 h-3 sm:h-3.5" /> {sig}
                    </div>
                </div>

                <div className="space-y-2 sm:space-y-3">
                    <div className="flex justify-between items-end">
                        <span className="text-[8px] sm:text-[10px] font-black text-slate-500 uppercase tracking-widest">Confidence</span>
                        <span className="text-sm sm:text-base font-black tabular-nums" style={{ color: colors.text }}>{conf.toFixed(1)}%</span>
                    </div>
                    <div className="h-1 sm:h-1.5 w-full rounded-full bg-white/5 overflow-hidden p-[1px]">
                        <div className="h-full rounded-full transition-all duration-1000 ease-out shadow-[0_0_10px_currentColor]"
                            style={{ width: `${conf}%`, background: colors.text, color: colors.text }} />
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:gap-4 pt-3 sm:pt-4 border-t border-white/5">
                    <div>
                        <p className="text-[8px] sm:text-[9px] text-slate-600 uppercase font-black tracking-widest mb-0.5 sm:mb-1">Target</p>
                        <p className="text-xs sm:text-sm font-black text-emerald-400 tabular-nums">+{tp.toFixed(1)}%</p>
                    </div>
                    <div className="text-right">
                        <p className="text-[8px] sm:text-[9px] text-slate-600 uppercase font-black tracking-widest mb-0.5 sm:mb-1">Risk/Reward</p>
                        <p className="text-xs sm:text-sm font-black text-blue-400 tabular-nums">1:{rr.toFixed(1)}</p>
                    </div>
                </div>
            </div>
            
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none"
                style={{ background: `radial-gradient(circle at bottom left, ${colors.text}08, transparent 70%)` }} />
        </button>
    );
}

// ── Signal Row ─────────────────────────────────────────────────────────────
function SignalRow({ record, onClick, active }) {
    const sig = record.prediction;
    const sym = record.stocks?.symbol || record.symbol || '?';
    const conf = +(record.confidence_score ?? record.confidence ?? 0);
    const rr = record.risk_reward ?? 0;
    const tp = record.target_pct ?? 0;
    const sl = record.stop_loss_pct ?? 0;
    const colors = getSignalColors(sig);

    return (
        <tr onClick={() => onClick(record)} 
            className={`group cursor-pointer hover:bg-white/[0.03] transition-all border-b border-white/5 last:border-0 ${active ? 'bg-white/[0.03]' : ''}`}>
            <td className="py-4 sm:py-5 pl-4 sm:pl-8">
                <div className="flex items-center gap-3 sm:gap-4">
                    <div className={`w-1 h-8 sm:w-1.5 sm:h-10 rounded-full shadow-[0_0_15px_currentColor] transition-all ${active ? 'opacity-100' : 'opacity-0'}`} 
                        style={{ background: colors.text, color: colors.text }} />
                    <div className="min-w-0">
                        <p className="text-sm sm:text-base font-black text-white tracking-tighter uppercase truncate">{sym}</p>
                        <p className="text-[8px] sm:text-[9px] text-slate-500 uppercase font-bold tracking-widest">{timeAgo(record.created_at)}</p>
                    </div>
                </div>
            </td>
            <td className="py-4 sm:py-5">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg sm:rounded-xl text-[8px] sm:text-[10px] font-black uppercase tracking-widest shadow-inner"
                    style={{ background: colors.bg, color: colors.text, border: `1px solid ${colors.border}` }}>
                    {sig}
                </div>
            </td>
            <td className="py-4 sm:py-5 hidden md:table-cell">
                <div className="flex flex-col gap-2 w-32 lg:w-40">
                    <div className="flex justify-between items-center px-1">
                        <span className="text-[8px] sm:text-[9px] font-black text-slate-500 uppercase tracking-widest">Confidence</span>
                        <span className="text-[10px] sm:text-xs font-black tabular-nums" style={{ color: colors.text }}>{conf.toFixed(0)}%</span>
                    </div>
                    <div className="h-1 w-full rounded-full bg-white/5 overflow-hidden p-[1px]">
                        <div className="h-full rounded-full transition-all duration-1000 ease-out" 
                            style={{ width: `${conf}%`, background: colors.text, boxShadow: `0 0 10px ${colors.text}40` }} />
                    </div>
                </div>
            </td>
            <td className="py-4 sm:py-5 font-black text-xs sm:text-sm text-emerald-400 tabular-nums">+{tp.toFixed(1)}%</td>
            <td className="py-4 sm:py-5 font-black text-xs sm:text-sm text-red-400 tabular-nums hidden lg:table-cell">-{Math.abs(sl).toFixed(1)}%</td>
            <td className="py-4 sm:py-5 hidden xl:table-cell">
                <span className={`text-[10px] sm:text-xs font-black px-2 sm:px-3 py-1 rounded-lg sm:rounded-xl border tabular-nums ${rr >= 2 ? 'text-emerald-400 border-emerald-400/20 bg-emerald-400/10' : 'text-slate-400 border-white/10 bg-white/5'}`}>
                    1:{rr.toFixed(1)}
                </span>
            </td>
            <td className="py-4 sm:py-5 pr-4 sm:pr-8 text-right">
                <div className="flex items-center justify-end gap-2 md:opacity-0 md:group-hover:opacity-100 transition-all md:translate-x-4 md:group-hover:translate-x-0">
                    <span className="text-[8px] sm:text-[10px] font-black text-blue-400 uppercase tracking-widest hidden sm:inline">View</span>
                    <div className="p-2 sm:p-2.5 rounded-lg sm:rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30">
                        <ArrowUpRight className="w-3.5 h-3.5 sm:w-4 h-4" />
                    </div>
                </div>
            </td>
        </tr>
    );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function SignalPage() {
    const { addToast } = useToast();
    const [records, setRecords] = useState(() => getCached() || []);
    const [loading, setLoading] = useState(!getCached());
    const [running, setRunning] = useState(false);
    const [search, setSearch]   = useState('');
    const [viewMode, setViewMode] = useState('grid');
    const [selected, setSelected] = useState(null);
    const [scanProgress, setScanProgress] = useState({ current: 0, total: 0 });
    const [showRetrainModal, setShowRetrainModal] = useState(false);
    const currentJobType = React.useRef(null); // 'scan' | 'retrain' | 'ohlcv_dump'

    const fetchData = useCallback(async (isBg = false) => {
        if (!isBg && !getCached()) setLoading(true);
        try {
            const data = await fetchPredictions();
            setRecords(data);
        } catch {
            if (!isBg) addToast?.({ title: 'Fetch Failed', message: 'Could not load signals.', type: 'error' });
        } finally {
            setLoading(false);
        }
    }, [addToast]);

    useEffect(() => {
        if (isStale()) fetchData(!!getCached());
        const tid = setInterval(() => fetchData(true), 30_000);
        return () => clearInterval(tid);
    }, [fetchData]);

    // ── Scan Status Polling ────────────────────────────────────────────────
    useEffect(() => {
        let timer;
        if (running) {
            timer = setInterval(async () => {
                try {
                    const res = await api.getScanStatus();
                    const status = res.data;
                    if (status.progress) {
                        setScanProgress(status.progress);
                    }
                    if (!status.running) {
                        setRunning(false);
                        if (currentJobType.current === 'retrain') {
                            addToast?.({ title: 'Retrain Complete', message: 'New AI model saved. Run a market scan to generate fresh signals with it.', type: 'success' });
                        } else if (currentJobType.current === 'ohlcv_dump') {
                            addToast?.({ title: 'Data Sync Complete', message: "Today's OHLCV data saved to Supabase for all stocks.", type: 'success' });
                        } else {
                            invalidate();
                            fetchData();
                            addToast?.({ title: 'Scan Complete', message: 'Market analysis finished successfully.', type: 'success' });
                        }
                        currentJobType.current = null;
                    }
                } catch (err) {
                    console.error("Status check failed:", err);
                }
            }, 3000);
        }
        return () => clearInterval(timer);
    }, [running, fetchData, addToast]);

    const handleRun = async () => {
        if (running) return;
        currentJobType.current = 'scan';
        setRunning(true);
        setScanProgress({ current: 0, total: 0 });
        try {
            await api.runPredictions();
            addToast?.({ title: 'Scan Initialized', message: 'Deep market analysis is starting...', type: 'info' });
        } catch {
            setRunning(false);
            currentJobType.current = null;
            addToast?.({ title: 'Scan Failed', message: 'Could not connect to AI engine.', type: 'error' });
        }
    };

    const handleRetrain = () => {
        if (running) return;
        setShowRetrainModal(true);
    };

    const confirmRetrain = async () => {
        currentJobType.current = 'retrain';
        setRunning(true);
        setScanProgress({ current: 0, total: 0 });
        try {
            await api.retrainAI();
            setShowRetrainModal(false);
            addToast?.({ title: 'Training Started', message: 'The AI is learning from fresh data...', type: 'info' });
        } catch {
            setRunning(false);
            currentJobType.current = null;
            setShowRetrainModal(false);
            addToast?.({ title: 'Training Failed', message: 'Could not start background training.', type: 'error' });
        }
    };

    const handleSyncOHLCV = async () => {
        if (running) return;
        currentJobType.current = 'ohlcv_dump';
        setRunning(true);
        setScanProgress({ current: 0, total: 0 });
        try {
            await api.syncOHLCV();
            addToast?.({ title: 'Data Sync Started', message: 'Fetching OHLCV data for all stocks...', type: 'info' });
        } catch {
            setRunning(false);
            currentJobType.current = null;
            addToast?.({ title: 'Sync Failed', message: 'Could not start OHLCV data sync.', type: 'error' });
        }
    };

    const progressPct = scanProgress.total > 0
        ? Math.round((scanProgress.current / scanProgress.total) * 100)
        : 0;

    const filtered = useMemo(() => {
        const buys = records.filter(r => r.prediction === 'BUY');
        if (!search) return buys;
        const q = search.toUpperCase();
        return buys.filter(r => (r.stocks?.symbol || r.symbol || '').toUpperCase().includes(q));
    }, [records, search]);

    const stats = useMemo(() => {
        const highConv = filtered.filter(r => (r.confidence_score ?? 0) >= 80).length;
        const avgConf = filtered.length ? filtered.reduce((s, r) => s + (r.confidence_score ?? 0), 0) / filtered.length : 0;
        const avgRR = filtered.length ? filtered.reduce((s, r) => s + (r.risk_reward ?? 0), 0) / filtered.length : 0;
        return { total: filtered.length, highConv, avgConf, avgRR };
    }, [filtered]);

    if (loading) {
        return (
            <main className="max-w-[1600px] mx-auto p-4 sm:p-8 space-y-10 animate-pulse">
                <div className="h-64 bg-white/5 rounded-[2.5rem] border border-white/5" />
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                    {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
                        <div key={i} className="h-80 bg-white/5 rounded-3xl border border-white/5" />
                    ))}
                </div>
            </main>
        );
    }

    return (
        <main className="w-full max-w-[1600px] mx-auto px-4 sm:px-8 py-4 sm:py-12 space-y-4 sm:space-y-12">
            {/* Elite Dashboard Header */}
            <div className="relative overflow-hidden sm:rounded-xl bg-[#0A121E] border-y sm:border border-white/5 p-3 sm:p-5 shadow-2xl">
                <div className="absolute top-0 right-0 w-1/3 h-full bg-gradient-to-l from-blue-600/5 to-transparent pointer-events-none" />
                
                <div className="relative space-y-4 sm:space-y-6">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 sm:gap-5">
                        
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4 flex-1">
                            <div className="relative flex-1 group">
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 text-slate-500 group-focus-within:text-blue-500 transition-colors" />
                                <input 
                                    type="text"
                                    placeholder="Search market signals..."
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    className="w-full bg-white/5 border border-white/10 rounded-lg sm:rounded-xl py-2 sm:py-3 pl-11 sm:pl-14 pr-4 text-sm sm:text-base text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 transition-all font-medium"
                                />
                            </div>

                            <div className="flex bg-white/5 border border-white/10 p-0.5 rounded-lg sm:rounded-xl shrink-0">
                                <button onClick={() => setViewMode('table')} className={`flex items-center gap-2 px-3 sm:px-5 py-1.5 sm:py-2 rounded-md sm:rounded-lg text-[10px] sm:text-xs font-black uppercase tracking-widest transition-all ${viewMode === 'table' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}>
                                    <List className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                    <span className="hidden sm:inline">Table</span>
                                </button>
                                <button onClick={() => setViewMode('grid')} className={`flex items-center gap-2 px-3 sm:px-5 py-1.5 sm:py-2 rounded-md sm:rounded-lg text-[10px] sm:text-xs font-black uppercase tracking-widest transition-all ${viewMode === 'grid' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}>
                                    <LayoutGrid className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                    <span className="hidden sm:inline">Grid</span>
                                </button>
                            </div>

                            <div className="flex gap-1.5 w-full sm:w-auto">
                                <button onClick={handleSyncOHLCV} disabled={running}
                                    title="Sync today's OHLCV data for all stocks to Supabase"
                                    className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 sm:px-5 py-1.5 sm:py-2 rounded-lg border transition-all font-black text-[10px] sm:text-xs uppercase tracking-widest relative overflow-hidden ${
                                        running && currentJobType.current === 'ohlcv_dump'
                                            ? 'bg-emerald-600/10 border-emerald-500/30 text-emerald-400'
                                            : running
                                            ? 'bg-white/5 border-white/10 text-slate-600'
                                            : 'bg-white/5 border-white/10 text-emerald-400 hover:text-white hover:bg-white/10'
                                    }`}>
                                    {running && currentJobType.current === 'ohlcv_dump' && (
                                        <div className="absolute bottom-0 left-0 h-1 bg-emerald-400/50 transition-all duration-500" style={{ width: `${progressPct}%` }} />
                                    )}
                                    <Database className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${running && currentJobType.current === 'ohlcv_dump' ? 'animate-pulse' : ''}`} />
                                    <span className="hidden sm:inline">
                                        {running && currentJobType.current === 'ohlcv_dump'
                                            ? `${scanProgress.current}/${scanProgress.total}`
                                            : 'Sync Data'}
                                    </span>
                                </button>

                                <button onClick={handleRetrain} disabled={running}
                                    className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 sm:px-5 py-1.5 sm:py-2 rounded-lg border transition-all font-black text-[10px] sm:text-xs uppercase tracking-widest relative overflow-hidden ${
                                        running ? 'bg-white/5 border-white/10 text-slate-600' : 'bg-white/5 border-white/10 text-slate-400 hover:text-white hover:bg-white/10'
                                    }`}>
                                    {running && currentJobType.current === 'retrain' && (
                                        <div className="absolute bottom-0 left-0 h-1 bg-blue-400/30 transition-all duration-500" style={{ width: `${progressPct}%` }} />
                                    )}
                                    <Zap className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                    <span>Deep Retrain</span>
                                </button>

                                <button onClick={handleRun} disabled={running}
                                    className={`flex-1 sm:flex-none flex flex-col items-center justify-center min-w-[120px] sm:min-w-[140px] py-1.5 sm:py-2 rounded-lg font-black text-[10px] sm:text-xs uppercase tracking-widest transition-all relative overflow-hidden ${
                                        running ? 'bg-blue-600/10 text-blue-400 border border-blue-500/30' : 'bg-blue-600 text-white shadow-lg shadow-blue-600/20 hover:bg-blue-500'
                                    }`}>
                                    {running && currentJobType.current === 'scan' && (
                                        <div className="absolute bottom-0 left-0 h-1 bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,1)] transition-all duration-500" style={{ width: `${progressPct}%` }} />
                                    )}
                                    <div className="flex items-center gap-2">
                                        <RefreshCw className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${running && currentJobType.current === 'scan' ? 'animate-spin' : ''}`} />
                                        <span>{running && currentJobType.current === 'scan' ? `${progressPct}%` : 'Run Scan'}</span>
                                    </div>
                                    {running && currentJobType.current === 'scan' && (
                                        <span className="text-[7px] sm:text-[8px] opacity-60 mt-0.5">{scanProgress.current}/{scanProgress.total}</span>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* KPI Ribbon */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-8 mt-3 sm:mt-5 pt-3 sm:pt-5 border-t border-white/5">
                    {[
                        { l: 'Matching', v: stats.total, c: 'text-white', icon: Activity },
                        { l: 'High Conv.', v: stats.highConv, c: 'text-emerald-400', icon: TrendingUp },
                        { l: 'Avg Conf.', v: `${stats.avgConf.toFixed(0)}%`, c: 'text-blue-400', icon: BrainCircuit },
                        { l: 'Profit Factor', v: `${stats.avgRR.toFixed(1)}x`, c: 'text-amber-400', icon: Target },
                    ].map(s => (
                        <div key={s.l} className="flex items-center gap-2 sm:gap-4 group">
                            <div className="w-7 h-7 sm:w-10 sm:h-10 rounded-lg bg-white/5 border border-white/5 flex items-center justify-center transition-transform shrink-0">
                                <s.icon className={`w-3 sm:w-4 h-3 sm:h-4 ${s.c}`} />
                            </div>
                            <div className="space-y-0.5 min-w-0">
                                <p className="text-[8px] sm:text-[10px] font-black text-slate-500 uppercase tracking-widest truncate">{s.l}</p>
                                <p className={`text-sm sm:text-xl font-black tabular-nums ${s.c}`}>{s.v}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Results */}
            <div className="flex-1 w-full min-w-0 pb-20 sm:pb-0">
                {filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 sm:py-48 text-center border-y sm:border sm:rounded-xl p-6 space-y-6 sm:space-y-8" 
                        style={{ background: 'rgba(8, 15, 26, 0.4)', borderColor: 'rgba(255, 255, 255, 0.05)' }}>
                        <div className="relative">
                            <div className="absolute inset-0 bg-blue-500/10 blur-3xl rounded-full" />
                            <div className="relative w-20 h-20 sm:w-32 sm:h-32 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
                                <Activity className="w-8 h-8 sm:w-12 sm:h-12 text-slate-700" />
                            </div>
                        </div>
                        <div className="space-y-2 sm:space-y-4 max-w-lg">
                            <h3 className="text-lg sm:text-4xl font-black text-white tracking-tighter">No Active Signals</h3>
                            <p className="text-[10px] sm:text-base text-slate-500 leading-relaxed font-medium">
                                The AI engine is monitoring the market. Run a deep scan to discover high-probability setups across all 200+ stocks.
                            </p>
                        </div>
                        
                        <div className="space-y-4 w-full max-w-xs">
                            <button onClick={handleRun} disabled={running}
                                className="w-full group relative px-8 sm:px-12 py-3.5 sm:py-5 rounded-lg sm:rounded-xl bg-blue-600 text-white font-black text-[10px] sm:text-xs uppercase tracking-[0.2em] sm:tracking-[0.3em] hover:bg-blue-500 hover:shadow-[0_0_50px_rgba(37,99,235,0.4)] transition-all active:scale-95 disabled:opacity-50 overflow-hidden">
                                {running && (
                                    <div className="absolute bottom-0 left-0 h-1.5 bg-white shadow-[0_0_15px_white] transition-all duration-500" style={{ width: `${progressPct}%` }} />
                                )}
                                <div className="relative z-10 flex items-center justify-center gap-2 sm:gap-3">
                                    {running ? <RefreshCw className="w-4 h-4 sm:w-6 sm:h-6 animate-spin" /> : null}
                                    {running ? `Scanning ${progressPct}%` : 'Start Full Market Scan'}
                                </div>
                            </button>
                            {running && (
                                <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest animate-pulse">
                                    Processing Stock {scanProgress.current} of {scanProgress.total}
                                </p>
                            )}
                        </div>
                    </div>
                ) : viewMode === 'grid' ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4 sm:gap-6 animate-in fade-in zoom-in-95 duration-500">
                        {filtered.map(r => (
                            <SignalCard key={r.id} record={r} onClick={(rec) => setSelected(buildResult(rec))} active={selected?.id === r.id} />
                        ))}
                    </div>
                ) : (
                    <div className="rounded-lg sm:rounded-xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-700" 
                        style={{ background: 'rgba(8, 15, 26, 0.5)', border: '1px solid rgba(255, 255, 255, 0.05)', backdropFilter: 'blur(20px)' }}>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse min-w-full">
                                <thead>
                                    <tr className="border-b border-white/5" style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.03) 0%, transparent 100%)' }}>
                                        <th className="px-5 py-4 sm:py-6 text-[9px] sm:text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">Symbol</th>
                                        <th className="py-4 sm:py-6 text-[9px] sm:text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">Signal</th>
                                        <th className="py-4 sm:py-6 text-[9px] sm:text-[11px] font-black uppercase tracking-[0.2em] text-slate-500 hidden md:table-cell">Confidence</th>
                                        <th className="py-4 sm:py-6 text-[9px] sm:text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">Target</th>
                                        <th className="py-4 sm:py-6 text-[9px] sm:text-[11px] font-black uppercase tracking-[0.2em] text-slate-500 hidden lg:table-cell">Stop Loss</th>
                                        <th className="py-4 sm:py-6 text-[9px] sm:text-[11px] font-black uppercase tracking-[0.2em] text-slate-500 hidden xl:table-cell">Risk/Reward</th>
                                        <th className="px-5 py-4 sm:py-6 text-right text-[9px] sm:text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">View</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {filtered.map(r => (
                                        <SignalRow key={r.id} record={r} onClick={(rec) => setSelected(buildResult(rec))} active={selected?.id === r.id} />
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>

            {/* Retrain Confirmation Modal */}
            {showRetrainModal && (
                <RetrainModal onConfirm={confirmRetrain} onCancel={() => setShowRetrainModal(false)} />
            )}

            {/* Premium Terminal Modal */}
            {selected && (
                <div className="fixed top-14 sm:top-20 lg:top-24 bottom-0 left-0 right-0 z-[50] bg-[#01050d]/95 backdrop-blur-3xl overflow-y-auto pt-4 sm:pt-6 pb-12 sm:pb-20 px-0 sm:px-6 animate-in fade-in slide-in-from-bottom-20 duration-500">
                    <div className="max-w-[1600px] mx-auto">
                        <div className="rounded-3xl sm:rounded-[48px] overflow-hidden border border-white/10 shadow-full bg-[#050d1a]/80">
                            <StockDetailsPage selected={selected} onBack={() => setSelected(null)} />
                        </div>
                    </div>
                </div>
            )}
        </main>
    );
}
