import React, { useState, useEffect, useCallback } from 'react';
import CSVUploader from './components/CSVUploader';
import PredictionResult from './components/PredictionResult';
import HistoryTable from './components/HistoryTable';
import TradingChart from './components/TradingChart';
import BacktestResults from './components/BacktestResults';
import { Activity, Zap, BarChart3, Database, CheckCircle2, AlertCircle, X, TrendingUp, TrendingDown, Minus, Cpu, Shield, Layers, Hash, BarChart2 } from 'lucide-react';
import { api } from './api';


// ── Toast system ───────────────────────────────────────────────────────────────
function Toast({ toasts, remove }) {
    return (
        <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 pointer-events-none">
            {toasts.map(t => (
                <div
                    key={t.id}
                    className={`flex items-start gap-3 px-4 py-3 rounded-xl border shadow-2xl pointer-events-auto
                        backdrop-blur-sm min-w-[260px] max-w-[360px] animate-in slide-in-from-bottom-2 fade-in duration-300
                        ${t.type === 'success' ? 'bg-surface border-buy/30' :
                          t.type === 'error'   ? 'bg-surface border-sell/30' :
                                                 'bg-surface border-white/10'}`}
                >
                    {t.type === 'success' && <CheckCircle2 className="w-4 h-4 text-buy shrink-0 mt-0.5" />}
                    {t.type === 'error'   && <AlertCircle  className="w-4 h-4 text-sell shrink-0 mt-0.5" />}
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white leading-snug">{t.title}</p>
                        {t.message && <p className="text-[11px] text-text-muted mt-0.5">{t.message}</p>}
                    </div>
                    <button onClick={() => remove(t.id)} className="text-text-muted hover:text-white transition-colors shrink-0">
                        <X className="w-3.5 h-3.5" />
                    </button>
                </div>
            ))}
        </div>
    );
}

function useToast() {
    const [toasts, setToasts] = useState([]);
    const add = useCallback(({ title, message, type = 'success', duration = 4000 }) => {
        const id = Date.now();
        setToasts(prev => [...prev, { id, title, message, type }]);
        setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), duration);
    }, []);
    const remove = useCallback((id) => setToasts(prev => prev.filter(t => t.id !== id)), []);
    return { toasts, add, remove };
}

// ── Dataset Stats card ─────────────────────────────────────────────────────────
const INDICATOR_TAGS = ['RSI', 'MACD', 'MA50', 'MA200', 'BB', 'Support', 'Resistance', 'Volume', 'Candle', 'Volatility'];

function DatasetStatsCard({ stats }) {
    const isFromDB   = stats.RowsProcessed === 'From Database';
    const accColor   = stats.ModelAccuracy >= 60 ? '#10b981' : stats.ModelAccuracy >= 45 ? '#eab308' : '#ef4444';
    const accLabel   = stats.ModelAccuracy >= 60 ? 'High' : stats.ModelAccuracy >= 45 ? 'Medium' : 'Low';
    const rowsNum    = isFromDB ? null : Number(stats.RowsProcessed);
    const dataQuality = rowsNum == null ? null : rowsNum >= 200 ? { label: 'Excellent', color: '#10b981' } : rowsNum >= 100 ? { label: 'Good', color: '#3b82f6' } : rowsNum >= 30 ? { label: 'Minimal', color: '#eab308' } : { label: 'Poor', color: '#ef4444' };

    return (
        <div className="rounded-2xl overflow-hidden border border-white/5 shadow-2xl flex flex-col h-full" style={{ background: '#080f1a' }}>
            {/* Header */}
            <div className="px-5 sm:px-6 pt-5 pb-4 border-b border-white/5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl" style={{ background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.2)' }}>
                        <BarChart3 className="w-4 h-4 text-blue-400" />
                    </div>
                    <div>
                        <h2 className="text-sm font-bold text-white leading-tight">Dataset Overview</h2>
                        <p className="text-[11px]" style={{ color: '#475569' }}>
                            {isFromDB ? 'Loaded from history' : 'Active analysis session'}
                        </p>
                    </div>
                </div>
                {/* Symbol pill */}
                <div className="px-3 py-1.5 rounded-xl font-black text-sm tracking-widest"
                    style={{ background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)', color: '#60a5fa' }}>
                    {stats.SymbolInfo}
                </div>
            </div>

            <div className="p-5 sm:p-6 space-y-4 flex-1">
                {/* Primary metrics */}
                <div className="grid grid-cols-2 gap-3">
                    {/* Rows */}
                    <div className="rounded-xl p-4 border border-white/5 relative overflow-hidden" style={{ background: 'rgba(255,255,255,0.02)' }}>
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: '#475569' }}>Data Rows</span>
                            <Hash className="w-3.5 h-3.5" style={{ color: '#334155' }} />
                        </div>
                        <p className="text-xl font-black text-white">
                            {isFromDB ? '—' : rowsNum?.toLocaleString()}
                        </p>
                        {dataQuality && (
                            <p className="text-[11px] font-bold mt-1" style={{ color: dataQuality.color }}>
                                {dataQuality.label} dataset
                            </p>
                        )}
                        {isFromDB && <p className="text-[11px] mt-1" style={{ color: '#475569' }}>From history</p>}
                    </div>

                    {/* Latest Close */}
                    <div className="rounded-xl p-4 border border-white/5 relative overflow-hidden" style={{ background: 'rgba(255,255,255,0.02)' }}>
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: '#475569' }}>Latest Close</span>
                            <TrendingUp className="w-3.5 h-3.5" style={{ color: '#334155' }} />
                        </div>
                        <p className="text-xl font-black text-white">
                            Rs.&nbsp;{Number(stats.LatestClose).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                        <p className="text-[11px] mt-1" style={{ color: '#475569' }}>NEPSE · NPR</p>
                    </div>

                    {/* Model Accuracy */}
                    {stats.ModelAccuracy != null && (
                        <div className="rounded-xl p-4 border relative overflow-hidden"
                            style={{ background: `${accColor}09`, borderColor: `${accColor}25` }}>
                            <div className="absolute top-0 left-0 right-0 h-px"
                                style={{ background: `linear-gradient(90deg,transparent,${accColor}50,transparent)` }} />
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: '#475569' }}>Model Accuracy</span>
                                <Shield className="w-3.5 h-3.5" style={{ color: accColor }} />
                            </div>
                            <p className="text-xl font-black" style={{ color: accColor }}>{stats.ModelAccuracy}%</p>
                            <p className="text-[11px] font-bold mt-1" style={{ color: accColor }}>{accLabel} reliability</p>
                        </div>
                    )}

                    {/* Threshold */}
                    {stats.ThresholdUsed != null && (
                        <div className="rounded-xl p-4 border border-white/5" style={{ background: 'rgba(255,255,255,0.02)' }}>
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: '#475569' }}>Signal Threshold</span>
                                <Layers className="w-3.5 h-3.5" style={{ color: '#334155' }} />
                            </div>
                            <p className="text-xl font-black text-white">±{stats.ThresholdUsed}%</p>
                            <p className="text-[11px] mt-1" style={{ color: '#475569' }}>Min move to trigger</p>
                        </div>
                    )}
                </div>

                {/* Model badge */}
                <div className="flex items-center gap-2.5 rounded-xl p-3 border border-white/5"
                    style={{ background: 'rgba(255,255,255,0.02)' }}>
                    <div className="p-1.5 rounded-lg" style={{ background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.2)' }}>
                        <Cpu className="w-3.5 h-3.5 text-blue-400" />
                    </div>
                    <div>
                        <p className="text-[11px] font-bold text-white">XGBoost + LightGBM + RF Ensemble</p>
                        <p className="text-[10px]" style={{ color: '#475569' }}>3-model soft-voting · Probability-calibrated</p>
                    </div>
                    <div className="ml-auto flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        <span className="text-[10px] font-semibold" style={{ color: '#10b981' }}>Active</span>
                    </div>
                </div>

                {/* Indicator tags */}
                <div>
                    <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: '#334155' }}>
                        Active Indicators
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                        {INDICATOR_TAGS.map(tag => (
                            <span key={tag} className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold border border-white/5"
                                style={{ background: 'rgba(255,255,255,0.03)', color: '#64748b' }}>
                                <span className="w-1 h-1 rounded-full bg-blue-500/60" />
                                {tag}
                            </span>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

// ── Chart skeleton ─────────────────────────────────────────────────────────────
function ChartSkeleton() {
    return (
        <div className="w-full h-full flex flex-col bg-surface rounded-xl overflow-hidden animate-pulse">
            {/* Fake stats bar */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-white/5 shrink-0">
                <div className="h-5 w-24 bg-white/10 rounded" />
                <div className="h-4 w-16 bg-white/5 rounded" />
                <div className="ml-auto h-5 w-12 bg-white/10 rounded-full" />
            </div>
            {/* Fake toolbar */}
            <div className="flex items-center gap-2 px-4 py-2 border-b border-white/5 shrink-0">
                {[...Array(6)].map((_, i) => <div key={i} className="h-6 w-10 bg-white/5 rounded-md" />)}
                <div className="w-px h-4 bg-white/10 mx-1" />
                {[...Array(4)].map((_, i) => <div key={i} className="h-6 w-12 bg-white/5 rounded-lg" />)}
            </div>
            {/* Fake candles area */}
            <div className="flex-1 flex items-end gap-1 px-6 pb-8 pt-4">
                {[...Array(40)].map((_, i) => {
                    const h = 20 + Math.sin(i * 0.7) * 15 + Math.sin(i * 0.3) * 10;
                    return (
                        <div key={i} className="flex-1 flex flex-col items-center justify-end gap-0.5">
                            <div className="w-px bg-white/10" style={{ height: `${h + 10}%` }} />
                            <div className={`w-full rounded-sm ${i % 3 === 0 ? 'bg-sell/30' : 'bg-buy/20'}`} style={{ height: `${h}%` }} />
                        </div>
                    );
                })}
            </div>
            {/* Centered spinner */}
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 pointer-events-none">
                <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                <p className="text-xs text-text-muted font-medium">Generating chart...</p>
            </div>
        </div>
    );
}

// ── App ────────────────────────────────────────────────────────────────────────
function App() {
    const [result, setResult]               = useState(null);
    const [loading, setLoading]             = useState(false);
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const [stats, setStats]                 = useState(null);
    const [newsText, setNewsText]           = useState('');
    const { toasts, add: addToast, remove: removeToast } = useToast();

    const handleUploadComplete = async (file) => {
        setLoading(true);
        try {
            const uploadRes   = await api.uploadCSV(file);
            setStats(uploadRes.data.summary);
            const parsedSymbol = uploadRes.data.summary.SymbolInfo || file.name.replace(/\.[^.]+$/, '').toUpperCase();
            const predictRes  = await api.predict(parsedSymbol, newsText);
            setResult(predictRes.data);
            setRefreshTrigger(prev => prev + 1);
            addToast({
                title:   `✓ Prediction generated for ${parsedSymbol}`,
                message: `Signal: ${predictRes.data.prediction} · Confidence: ${predictRes.data.confidence.toFixed(1)}%`,
                type:    'success',
            });
        } catch (err) {
            addToast({
                title:   'Prediction failed',
                message: err.response?.data?.detail || err.message || 'Please try again.',
                type:    'error',
                duration: 6000,
            });
            throw err;
        } finally {
            setLoading(false);
        }
    };

    const handleHistoryClick = (record) => {
        const ai = record.ai_analysis || {};
        setResult({
            symbol:            record.stocks?.symbol || 'UNKNOWN',
            prediction:        record.prediction,
            confidence:        record.confidence_score,
            explanation:       record.explanation,
            target_price:      record.target_price   ?? null,
            stop_loss:         record.stop_loss       ?? null,
            estimated_days:    record.estimated_days  ?? null,
            target_pct:        record.target_pct      ?? null,
            stop_loss_pct:     record.stop_loss_pct   ?? null,
            risk_reward:       record.risk_reward      ?? null,
            all_proba:         record.all_proba        ?? null,
            indicators:        record.indicators       ?? null,
            model_metrics:     record.model_metrics    ?? null,
            // Extended AI analysis
            ideal_entry:       ai.ideal_entry       ?? null,
            entry_zone_low:    ai.entry_zone_low    ?? null,
            entry_zone_high:   ai.entry_zone_high   ?? null,
            entry_condition:   ai.entry_condition   ?? null,
            target2:           ai.target2           ?? null,
            target2_pct:       ai.target2_pct       ?? null,
            trailing_stop:     ai.trailing_stop     ?? null,
            trailing_stop_pct: ai.trailing_stop_pct ?? null,
            exit_condition:    ai.exit_condition    ?? null,
            risk_note:         ai.risk_note         ?? null,
            market_structure:  ai.market_structure  ?? null,
            chart_data:        record.chart_data    || [],
            signal_history:    record.signal_history|| [],
            backtest:          record.backtest_stats || null,
        });
        if (record.chart_data?.length > 0) {
            setStats({
                SymbolInfo:    record.stocks?.symbol || 'UNKNOWN',
                RowsProcessed: 'From Database',
                LatestClose:   record.chart_data[record.chart_data.length - 1].close,
                IndicatorReady: 'Historical Record',
            });
        }
        addToast({
            title:   `Loaded: ${record.stocks?.symbol || 'UNKNOWN'}`,
            message: `${record.prediction} · ${Number(record.confidence_score).toFixed(1)}% confidence`,
            type:    'success',
            duration: 2500,
        });
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    return (
        <div className="min-h-screen bg-background text-text p-4 sm:p-6 md:p-10 font-sans selection:bg-primary/30">

            {/* ── Header ──────────────────────────────────────────────── */}
            <header className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between mb-6 md:mb-10 gap-3">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 sm:p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)' }}>
                        <Activity className="text-white w-5 h-5 sm:w-6 sm:h-6" />
                    </div>
                    <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white">
                        Trade Signal <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-cyan-400">AI</span>
                    </h1>
                </div>

                {/* Status pills — hidden on xs, shown sm+ */}
                <div className="hidden sm:flex items-center gap-2 sm:gap-4 text-sm font-medium text-text-muted">
                    <div className="flex items-center gap-2 bg-surface px-3 sm:px-4 py-2 rounded-full border border-white/5">
                        <Database className="w-4 h-4 text-green-400" />
                        Supabase
                    </div>
                    <div className="flex items-center gap-2 bg-surface px-3 sm:px-4 py-2 rounded-full border border-white/5">
                        <Zap className="w-4 h-4 text-yellow-400" />
                        XGBoost + LightGBM + RF
                    </div>
                </div>

                {/* xs-only: single compact status dot */}
                <div className="flex sm:hidden items-center gap-1.5 text-[11px] text-text-muted bg-surface px-3 py-1.5 rounded-full border border-white/5">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                    Live · XGBoost + LightGBM + RF
                </div>
            </header>

            <main className="max-w-7xl mx-auto space-y-4 md:space-y-6">

                {/* Row 1 — Upload (left) | Stats (right) — equal height */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">

                    {/* Col 1 — Uploader + News input stacked */}
                    <div className="flex flex-col gap-4">
                        <CSVUploader onUploadComplete={handleUploadComplete} />

                        {/* News / Sentiment context box */}
                        <div className="rounded-2xl border border-white/5 overflow-hidden" style={{ background: '#080f1a' }}>
                            <div className="px-5 pt-4 pb-3 border-b border-white/5 flex items-center gap-3">
                                <div className="p-1.5 rounded-lg" style={{ background: 'rgba(168,85,247,0.12)', border: '1px solid rgba(168,85,247,0.2)' }}>
                                    <Activity className="w-3.5 h-3.5" style={{ color: '#a855f7' }} />
                                </div>
                                <div>
                                    <p className="text-xs font-bold text-white leading-tight">News &amp; Sentiment Context</p>
                                    <p className="text-[10px]" style={{ color: '#475569' }}>Optional — AI will factor this into the analysis</p>
                                </div>
                            </div>
                            <div className="p-4">
                                <textarea
                                    rows={3}
                                    value={newsText}
                                    onChange={e => setNewsText(e.target.value)}
                                    placeholder="e.g. Company reported 30% profit growth in Q3. SEBON approved new FPO issue. Promoter stake increased by 5%..."
                                    className="w-full resize-none rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-purple-500/40 transition-all"
                                    style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', lineHeight: 1.6 }}
                                />
                                {newsText && (
                                    <button
                                        onClick={() => setNewsText('')}
                                        className="mt-1.5 text-[10px] text-slate-600 hover:text-slate-400 transition-colors"
                                    >
                                        Clear
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Col 2 — Dataset stats */}
                    <div className="flex flex-col">
                        {stats ? (
                            <DatasetStatsCard stats={stats} />
                        ) : (
                            <div className="flex-1 rounded-2xl flex flex-col items-center justify-center text-center p-8"
                                style={{ background: '#080f1a', border: '1px solid rgba(255,255,255,0.05)', minHeight: '100%' }}>
                                <div className="p-4 rounded-2xl mb-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.04)' }}>
                                    <BarChart3 className="w-10 h-10" style={{ color: 'rgba(255,255,255,0.07)' }} />
                                </div>
                                <p className="text-sm font-semibold text-white">No Data Yet</p>
                                <p className="text-xs mt-1 text-white/70">Upload a file to see dataset stats.</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Row 1b — Backtest (full width, only when available) */}
                {result?.backtest && <BacktestResults stats={result.backtest} />}

                {/* Row 2 — Prediction Result */}
                {result ? (
                    <PredictionResult result={result} />
                ) : (
                    <div className="rounded-2xl p-8 flex flex-col items-center justify-center text-center min-h-40"
                        style={{ background: '#080f1a', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <div className="p-3 rounded-2xl mb-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.04)' }}>
                            <Activity className="w-10 h-10" style={{ color: 'rgba(255,255,255,0.07)' }} />
                        </div>
                        <p className="text-lg font-semibold text-white">Awaiting Prediction</p>
                        <p className="text-sm mt-1 text-white/70">Upload a stock CSV to get a BUY / SELL / HOLD signal.</p>
                    </div>
                )}

                {/* Row 3 — Trading Chart — responsive height, skeleton while loading */}
                <div
                    className="rounded-2xl shadow-xl relative overflow-hidden h-[580px] sm:h-[720px] md:h-[860px]"
                    style={{ background: '#080f1a', border: '1px solid rgba(255,255,255,0.05)' }}
                >
                    {loading ? (
                        <ChartSkeleton />
                    ) : result ? (
                        <TradingChart
                            data={result.chart_data}
                            prediction={result.prediction}
                            explanation={result.explanation}
                            signalHistory={result.signal_history}
                            targetPrice={result.target_price}
                            stopLoss={result.stop_loss}
                            estimatedDays={result.estimated_days}
                            targetPct={result.target_pct}
                            stopLossPct={result.stop_loss_pct}
                            riskReward={result.risk_reward}
                            idealEntry={result.ideal_entry}
                            entryZoneLow={result.entry_zone_low}
                            entryZoneHigh={result.entry_zone_high}
                            target2={result.target2}
                            target2Pct={result.target2_pct}
                            trailingStop={result.trailing_stop}
                        />
                    ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center gap-4 text-center px-6">
                            <div className="p-4 rounded-2xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.04)' }}>
                                <div className="flex gap-4">
                                    <TrendingUp className="w-7 h-7" style={{ color: 'rgba(16,185,129,0.2)' }} />
                                    <TrendingDown className="w-7 h-7" style={{ color: 'rgba(239,68,68,0.2)' }} />
                                    <Minus className="w-7 h-7" style={{ color: 'rgba(234,179,8,0.2)' }} />
                                </div>
                            </div>
                            <p className="text-sm text-white/70">Chart will appear after prediction</p>
                        </div>
                    )}
                </div>

                {/* Row 4 — History */}
                <HistoryTable refreshTrigger={refreshTrigger} onHistoryClick={handleHistoryClick} />
            </main>

            {/* Toast portal */}
            <Toast toasts={toasts} remove={removeToast} />
        </div>
    );
}

export default App;
