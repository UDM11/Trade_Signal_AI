import React, { useEffect, useState, useMemo } from 'react';
import {
    History, Clock, TrendingUp, TrendingDown, Minus, RefreshCw,
    Search, ChevronRight, BarChart2, AlertCircle, Target, Shield,
    CalendarClock, Percent, Activity, SlidersHorizontal,
} from 'lucide-react';
import { api } from '../../api';

const SIGNAL = {
    BUY:  { color: 'text-buy',  bg: 'bg-buy/10',  border: 'border-buy/30',  bar: 'bg-buy',  glow: 'shadow-[0_0_16px_rgba(16,185,129,0.15)]',  icon: TrendingUp  },
    SELL: { color: 'text-sell', bg: 'bg-sell/10', border: 'border-sell/30', bar: 'bg-sell', glow: 'shadow-[0_0_16px_rgba(239,68,68,0.15)]',    icon: TrendingDown },
    HOLD: { color: 'text-hold', bg: 'bg-hold/10', border: 'border-hold/30', bar: 'bg-hold', glow: 'shadow-[0_0_16px_rgba(234,179,8,0.15)]',    icon: Minus       },
};

function relativeTime(dateStr) {
    const diff = (Date.now() - new Date(dateStr)) / 1000;
    if (diff < 60)    return `${Math.floor(diff)}s ago`;
    if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function MiniSparkline({ chartData, signal }) {
    if (!chartData?.length) return null;
    const pts = chartData.slice(-30).map(d => d.close).filter(Boolean);
    if (pts.length < 2) return null;
    const min = Math.min(...pts), max = Math.max(...pts);
    const range = max - min || 1;
    const W = 80, H = 28;
    const coords = pts.map((v, i) => `${(i / (pts.length - 1)) * W},${H - ((v - min) / range) * H}`);
    const color = signal === 'BUY' ? '#10b981' : signal === 'SELL' ? '#ef4444' : '#eab308';
    return (
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="overflow-visible">
            <polyline points={coords.join(' ')} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" opacity="0.8" />
        </svg>
    );
}

function StatCell({ label, value, sub, valueClass = 'text-white', icon: Icon }) {
    return (
        <div className="flex flex-col gap-0.5 min-w-0">
            <div className="flex items-center gap-1">
                {Icon && <Icon className="w-3 h-3 text-text-muted shrink-0" />}
                <span className="text-[10px] text-text-muted uppercase tracking-wider font-semibold truncate">{label}</span>
            </div>
            <span className={`text-sm font-bold truncate ${valueClass}`}>{value ?? '—'}</span>
            {sub && <span className={`text-[10px] font-semibold ${sub.startsWith('+') ? 'text-buy' : sub.startsWith('-') ? 'text-sell' : 'text-text-muted'}`}>{sub}</span>}
        </div>
    );
}

function HistoryCard({ record, onHistoryClick }) {
    const sig = SIGNAL[record.prediction] || SIGNAL.HOLD;
    const SigIcon = sig.icon;
    const conf = Number(record.confidence_score);
    const symbol = record.stocks?.symbol || 'UNKNOWN';

    const latestClose = record.chart_data?.length
        ? record.chart_data[record.chart_data.length - 1]?.close
        : null;

    const fmtPrice = (v) => v != null ? `Rs. ${Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : null;
    const fmtPct   = (v) => v != null ? `${v >= 0 ? '+' : ''}${Number(v).toFixed(2)}%` : null;

    return (
        <div
            onClick={() => onHistoryClick(record)}
            className={`group relative border ${sig.border} rounded-2xl p-4 sm:p-5 cursor-pointer
                transition-all duration-200 hover:scale-[1.005] hover:border-opacity-70 ${sig.glow}`}
            style={{ background: '#080f1a' }}
        >
            {/* Top accent line */}
            <div className={`absolute top-0 left-6 right-6 h-px ${sig.bar} opacity-50 rounded-full`} />

            {/* Row 1 — Symbol + Signal badge + Sparkline */}
            <div className="flex items-start justify-between gap-3 mb-4">
                <div className="flex items-center gap-3 min-w-0">
                    {/* Signal color bar */}
                    <div className={`w-1 h-10 rounded-full ${sig.bar} opacity-80 shrink-0`} />
                    <div className="min-w-0">
                        <p className="text-lg font-black text-white group-hover:text-primary transition-colors truncate leading-tight">
                            {symbol}
                        </p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                            <Clock className="w-3 h-3 text-text-muted shrink-0" />
                            <span className="text-[11px] text-text-muted">{relativeTime(record.created_at)}</span>
                            <span className="text-white/10">·</span>
                            <span className="text-[11px] text-white/30">
                                {new Date(record.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </span>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                    {/* Mini sparkline */}
                    <div className="hidden sm:block opacity-70 group-hover:opacity-100 transition-opacity">
                        <MiniSparkline chartData={record.chart_data} signal={record.prediction} />
                    </div>
                    {/* Signal pill */}
                    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border ${sig.border} ${sig.bg}`}>
                        <SigIcon className={`w-3.5 h-3.5 ${sig.color}`} />
                        <span className={`text-sm font-black tracking-widest ${sig.color}`}>{record.prediction}</span>
                    </div>
                </div>
            </div>

            {/* Row 2 — Metrics grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
                <StatCell
                    label="Latest Close"
                    value={latestClose != null ? fmtPrice(latestClose) : '—'}
                    icon={Activity}
                />
                <StatCell
                    label="Target"
                    value={fmtPrice(record.target_price)}
                    sub={fmtPct(record.target_pct)}
                    valueClass={record.prediction === 'SELL' ? 'text-sell' : 'text-buy'}
                    icon={Target}
                />
                <StatCell
                    label="Stop Loss"
                    value={fmtPrice(record.stop_loss)}
                    sub={fmtPct(record.stop_loss_pct)}
                    valueClass="text-sell"
                    icon={Shield}
                />
                <StatCell
                    label="Timeline"
                    value={record.estimated_days != null ? `${record.estimated_days} days` : null}
                    icon={CalendarClock}
                    valueClass="text-primary"
                />
                <StatCell
                    label="Risk : Reward"
                    value={record.risk_reward != null ? `1 : ${Number(record.risk_reward).toFixed(2)}` : null}
                    icon={Percent}
                    valueClass={record.risk_reward >= 1.5 ? 'text-buy' : record.risk_reward >= 0.8 ? 'text-hold' : 'text-sell'}
                />
            </div>

            {/* Row 3 — Confidence bar + arrow */}
            <div className="flex items-center gap-3">
                <div className="flex-1 bg-white/8 h-1.5 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${sig.bar} transition-all duration-700`} style={{ width: `${conf}%` }} />
                </div>
                <span className={`text-xs font-black tabular-nums ${sig.color} shrink-0`}>{conf.toFixed(1)}%</span>
                <span className="text-[10px] text-text-muted shrink-0">confidence</span>
                <ChevronRight className="w-4 h-4 text-white/20 group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0" />
            </div>
        </div>
    );
}

function SummaryBar({ history }) {
    const counts = { BUY: 0, SELL: 0, HOLD: 0 };
    history.forEach(r => { if (counts[r.prediction] != null) counts[r.prediction]++; });
    const total = history.length;
    const avgConf = total ? (history.reduce((s, r) => s + Number(r.confidence_score), 0) / total).toFixed(1) : 0;

    return (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            {[
                { label: 'Total Records', value: total, valueClass: 'text-white' },
                { label: 'BUY Signals',  value: counts.BUY,  valueClass: 'text-buy' },
                { label: 'SELL Signals', value: counts.SELL, valueClass: 'text-sell' },
                { label: 'Avg Confidence', value: `${avgConf}%`, valueClass: 'text-primary' },
            ].map(({ label, value, valueClass }) => (
                <div key={label} className="rounded-xl border border-white/5 px-4 py-3" style={{ background: 'rgba(255,255,255,0.03)' }}>
                    <p className="text-[10px] text-text-muted uppercase tracking-wider font-semibold mb-1">{label}</p>
                    <p className={`text-xl font-black ${valueClass}`}>{value}</p>
                </div>
            ))}
        </div>
    );
}

export default function HistoryTable({ refreshTrigger, onHistoryClick }) {
    const [history,      setHistory]      = useState([]);
    const [loading,      setLoading]      = useState(true);
    const [refreshing,   setRefreshing]   = useState(false);
    const [fetchError,   setFetchError]   = useState(null);
    const [search,       setSearch]       = useState('');
    const [filterSignal, setFilterSignal] = useState('ALL');
    const [sortBy,       setSortBy]       = useState('date');

    useEffect(() => { fetchHistory(); }, [refreshTrigger]);

    const fetchHistory = async (manual = false) => {
        if (manual) setRefreshing(true); else setLoading(true);
        setFetchError(null);
        try {
            const res = await api.getHistory();
            setHistory(res.data?.data || []);
        } catch (err) {
            setFetchError(err.response?.data?.detail || 'Failed to load prediction history.');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const filtered = useMemo(() => {
        let list = history.filter(r => {
            const sym = (r.stocks?.symbol || '').toLowerCase();
            return sym.includes(search.toLowerCase()) && (filterSignal === 'ALL' || r.prediction === filterSignal);
        });
        if (sortBy === 'date')       list = [...list].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        if (sortBy === 'confidence') list = [...list].sort((a, b) => b.confidence_score - a.confidence_score);
        if (sortBy === 'symbol')     list = [...list].sort((a, b) => (a.stocks?.symbol || '').localeCompare(b.stocks?.symbol || ''));
        return list;
    }, [history, search, filterSignal, sortBy]);

    return (
        <div className="rounded-2xl overflow-hidden border border-white/5 shadow-2xl" style={{ background: '#080f1a' }}>

            {/* Header */}
            <div className="px-5 sm:px-6 pt-5 pb-4 border-b border-white/5">
                <div className="flex items-center justify-between gap-3 mb-4">
                    <div className="flex items-center gap-2.5">
                        <div className="bg-primary/15 p-1.5 rounded-lg border border-primary/20">
                            <History className="text-primary w-4 h-4" />
                        </div>
                        <div>
                            <h2 className="text-base font-bold text-white leading-tight">Prediction History</h2>
                            <p className="text-[11px] text-text-muted">{history.length} total record{history.length !== 1 ? 's' : ''}</p>
                        </div>
                    </div>
                    <button
                        onClick={() => fetchHistory(true)}
                        disabled={refreshing}
                        className="flex items-center gap-1.5 text-xs text-text-muted hover:text-white border border-white/10 hover:border-white/20 bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-lg transition-all"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                        Refresh
                    </button>
                </div>

                {/* Summary stats */}
                {!loading && history.length > 0 && <SummaryBar history={history} />}

                {/* Search + Filter + Sort */}
                {!loading && history.length > 0 && (
                    <div className="flex flex-col sm:flex-row gap-2">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
                            <input
                                type="text"
                                placeholder="Search symbol..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                className="w-full border border-white/10 rounded-lg pl-8 pr-3 py-2 text-sm text-white placeholder-text-muted focus:outline-none focus:border-primary/50 transition-colors"
                            style={{ background: 'rgba(255,255,255,0.03)' }}
                            />
                        </div>

                        {/* Signal filter */}
                        <div className="flex gap-1.5">
                            {['ALL', 'BUY', 'SELL', 'HOLD'].map(s => (
                                <button
                                    key={s}
                                    onClick={() => setFilterSignal(s)}
                                    className={`px-3 py-2 rounded-lg text-xs font-bold transition-all border ${
                                        filterSignal === s
                                            ? s === 'ALL'
                                                ? 'bg-primary/20 text-primary border-primary/30'
                                                : `${SIGNAL[s].bg} ${SIGNAL[s].color} ${SIGNAL[s].border}`
                                            : 'bg-white/5 text-text-muted border-white/10 hover:border-white/20'
                                    }`}
                                >
                                    {s}
                                </button>
                            ))}
                        </div>

                        {/* Sort */}
                        <div className="flex items-center gap-1.5 border border-white/10 rounded-lg px-3 py-2" style={{ background: 'rgba(255,255,255,0.03)' }}>
                            <SlidersHorizontal className="w-3.5 h-3.5 text-text-muted shrink-0" />
                            <select
                                value={sortBy}
                                onChange={e => setSortBy(e.target.value)}
                                className="bg-transparent text-xs text-text-muted focus:outline-none cursor-pointer"
                            >
                                <option value="date">Latest First</option>
                                <option value="confidence">By Confidence</option>
                                <option value="symbol">By Symbol</option>
                            </select>
                        </div>
                    </div>
                )}
            </div>

            {/* Error */}
            {fetchError && !loading && (
                <div className="flex items-center gap-3 mx-5 sm:mx-6 my-4 px-4 py-3 bg-sell/10 border border-sell/25 rounded-xl">
                    <AlertCircle className="w-4 h-4 text-sell shrink-0" />
                    <p className="text-sm text-sell">{fetchError}</p>
                </div>
            )}

            {/* Content */}
            <div className="p-4 sm:p-5">
                {loading ? (
                    <div className="space-y-3">
                        {[...Array(3)].map((_, i) => (
                            <div key={i} className="h-36 rounded-2xl border border-white/5 animate-pulse" style={{ background: 'rgba(255,255,255,0.02)' }} />
                        ))}
                    </div>
                ) : history.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                        <div className="p-4 rounded-2xl mb-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.04)' }}>
                            <BarChart2 className="w-10 h-10" style={{ color: 'rgba(255,255,255,0.08)' }} />
                        </div>
                        <h3 className="text-base font-semibold mb-1" style={{ color: 'rgba(255,255,255,0.18)' }}>No Predictions Yet</h3>
                        <p className="text-sm" style={{ color: '#334155' }}>Upload a stock CSV to generate your first signal.</p>
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                        <div className="p-3 rounded-2xl mb-3" style={{ background: 'rgba(255,255,255,0.03)' }}>
                            <Search className="w-7 h-7" style={{ color: 'rgba(255,255,255,0.08)' }} />
                        </div>
                        <p className="font-semibold text-sm" style={{ color: 'rgba(255,255,255,0.18)' }}>No results for "{search}"</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {filtered.map(record => (
                            <HistoryCard key={record.id} record={record} onHistoryClick={onHistoryClick} />
                        ))}
                    </div>
                )}
            </div>

            {/* Footer */}
            {!loading && filtered.length > 0 && (
                <div className="px-5 sm:px-6 py-3 border-t border-white/5 flex items-center justify-between">
                    <p className="text-[11px] text-text-muted">
                        Showing <span className="text-white font-semibold">{filtered.length}</span> of <span className="text-white font-semibold">{history.length}</span> records
                    </p>
                    <p className="text-[11px] text-text-muted">Click any card to load full result</p>
                </div>
            )}
        </div>
    );
}
