import React, { useState } from 'react';
import {
    ArrowLeft, BarChart3, Brain, Activity, Loader2,
    TrendingUp, TrendingDown, Minus, Target, Shield, Crosshair,
    LayoutGrid, Zap, Sparkles, History,
} from 'lucide-react';
import BacktestResults from './BacktestResults';
import PredictionResult from './PredictionResult';
import TradingChart from './TradingChart';
import IndicatorMatrix from './IndicatorMatrix';
import { SignalProbaStrip } from '../../components/history/HistoryComponents';
import { invalidate } from '../../cache/predictionsCache';

const MOBILE_TABS = [
    { id: 'chart',    label: 'Chart',      icon: Activity },
    { id: 'overview', label: 'Overview',   icon: LayoutGrid },
    { id: 'dna',      label: 'DNA Matrix', icon: Zap },
    { id: 'signals',  label: 'Signal AI',  icon: Sparkles },
    { id: 'backtest', label: 'Backtest',   icon: History },
];

const fmt = (n, d = 2) =>
    n != null ? Number(n).toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—';

function QuickStat({ label, value, color = '#94a3b8' }) {
    return (
        <div className="flex flex-col gap-0.5 px-4 py-2.5 rounded-xl border border-white/6 bg-white/[0.02]">
            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{label}</p>
            <p className="text-sm font-black tabular-nums leading-none" style={{ color }}>{value}</p>
        </div>
    );
}

function ExecutionOverview({ result, sigColor }) {
    const {
        ideal_entry, entry_zone_low, entry_zone_high,
        target_price, target_pct, stop_loss, stop_loss_pct,
        risk_reward, estimated_days, confidence,
        indicators, model_metrics,
    } = result;

    const isSell = result.prediction === 'SELL';
    const rrColor = risk_reward >= 2 ? '#10b981' : risk_reward >= 1 ? '#eab308' : '#ef4444';
    const rsi  = indicators?.RSI;
    const close = indicators?.Close;

    const range = entry_zone_high && entry_zone_low ? entry_zone_high - entry_zone_low : 0;
    const markerPct = range > 0 ? ((ideal_entry - entry_zone_low) / range) * 100 : 50;

    const rows = [
        { label: 'Ideal Entry', price: ideal_entry ?? close,  pct: null,          color: sigColor },
        { label: 'T1 Target',   price: result.target_price,   pct: result.target_pct,    color: isSell ? '#ef4444' : '#10b981' },
        { label: 'T2 Target',   price: result.target2,        pct: result.target2_pct,   color: isSell ? '#f87171' : '#34d399' },
        { label: 'Stop Loss',   price: result.stop_loss,      pct: result.stop_loss_pct, color: '#ef4444' },
    ];

    return (
        <div className="space-y-4 p-5">
            {/* Trade Architecture Dashboard */}
            <div className="grid grid-cols-1 gap-4">
                {/* 1. Entry Intelligence */}
                {entry_zone_low && entry_zone_high && (
                    <div className="rounded-3xl p-5 border border-white/6 bg-white/[0.02] relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-3 opacity-10">
                            <Target className="w-12 h-12" />
                        </div>
                        <div className="flex justify-between items-center mb-4">
                            <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Ideal Entry Range</h4>
                            <span className="text-[10px] font-black text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-lg border border-emerald-500/20">Optimal Zone</span>
                        </div>
                        <div className="flex justify-between text-[11px] text-white font-black mb-2 px-1">
                            <span>Rs.{fmt(entry_zone_low)}</span>
                            <span>Rs.{fmt(entry_zone_high)}</span>
                        </div>
                        <div className="relative h-2 rounded-full bg-white/5 border border-white/5 overflow-hidden">
                            <div className="absolute inset-y-0 bg-gradient-to-r from-emerald-500/40 via-emerald-500/10 to-emerald-500/40 w-full" />
                            <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-full border-2 border-white z-10 shadow-[0_0_15px_rgba(255,255,255,0.5)]"
                                style={{ left: `${markerPct}%`, background: sigColor }} />
                        </div>
                        <p className="text-center text-xs font-black mt-4 tracking-tight" style={{ color: sigColor }}>
                            Current Bias: Rs.{fmt(ideal_entry ?? close)}
                        </p>
                    </div>
                )}

                {/* 2. Target Matrix (T1 & T2) */}
                <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-2xl p-4 border border-white/6 bg-buy/5 space-y-1">
                        <div className="flex items-center gap-1.5 opacity-60 mb-2">
                            <TrendingUp className="w-3 h-3 text-buy" />
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Target 1 (Base)</span>
                        </div>
                        <p className="text-xl font-black text-white tabular-nums leading-none">Rs.{fmt(result.target_price)}</p>
                        <p className="text-[11px] font-black text-buy">+{result.target_pct}%</p>
                    </div>
                    <div className="rounded-2xl p-4 border border-white/6 bg-emerald-500/5 space-y-1">
                        <div className="flex items-center gap-1.5 opacity-60 mb-2">
                            <Target className="w-3 h-3 text-emerald-400" />
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Target 2 (Deep)</span>
                        </div>
                        <p className="text-xl font-black text-white tabular-nums leading-none">Rs.{fmt(result.target2)}</p>
                        <p className="text-[11px] font-black text-emerald-400">+{result.target2_pct}%</p>
                    </div>
                </div>

                {/* 3. Stop Protection */}
                <div className="rounded-2xl p-4 border border-rose-500/20 bg-rose-500/5 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/20">
                            <Shield className="w-4 h-4 text-rose-500" />
                        </div>
                        <div>
                            <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest block">Hard Stop Loss</span>
                            <p className="text-base font-black text-white tabular-nums">Rs.{fmt(result.stop_loss)}</p>
                        </div>
                    </div>
                    <div className="text-right">
                        <span className="text-[9px] font-black text-rose-500 bg-rose-500/10 px-2 py-0.5 rounded-md border border-rose-500/20">-{Math.abs(result.stop_loss_pct).toFixed(1)}%</span>
                    </div>
                </div>
            </div>

            {/* R:R + Days */}
            <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl p-3.5 border border-white/6 bg-white/[0.02] text-center">
                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">R:R Ratio</p>
                    <p className="text-lg font-black tabular-nums" style={{ color: rrColor }}>
                        {risk_reward ? `1 : ${Number(risk_reward).toFixed(1)}` : '—'}
                    </p>
                </div>
                <div className="rounded-xl p-3.5 border border-white/6 bg-white/[0.02] text-center">
                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Est. Hold</p>
                    <p className="text-lg font-black text-blue-400 tabular-nums">
                        {estimated_days ? `${estimated_days}D` : '—'}
                    </p>
                </div>
            </div>

            {/* Probability Strip */}
            {result.all_proba && (
                <div className="pt-2">
                    <SignalProbaStrip all_proba={result.all_proba} prediction={result.prediction} />
                </div>
            )}

            {/* Indicators row */}
            <div className="grid grid-cols-3 gap-2">
                {rsi != null && (
                    <div className="rounded-xl p-3 border border-white/6 bg-white/[0.02] text-center">
                        <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">RSI</p>
                        <p className="text-sm font-black tabular-nums"
                            style={{ color: rsi > 70 ? '#ef4444' : rsi < 30 ? '#10b981' : '#94a3b8' }}>
                            {Number(rsi).toFixed(1)}
                        </p>
                    </div>
                )}
                {model_metrics?.accuracy != null && (
                    <div className="rounded-xl p-3 border border-white/6 bg-white/[0.02] text-center">
                        <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Win Prob</p>
                        <p className="text-sm font-black tabular-nums text-emerald-400">
                            {model_metrics.accuracy}%
                        </p>
                    </div>
                )}
                <div className="rounded-xl p-3 border border-white/6 bg-white/[0.02] text-center">
                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Conf.</p>
                    <p className="text-sm font-black tabular-nums" style={{ color: sigColor }}>
                        {confidence != null ? `${Number(confidence).toFixed(0)}%` : '—'}
                    </p>
                </div>
            </div>
            
            {/* TRADER UPGRADE: AI Position Sizer & Confluence */}
            <div className="space-y-3 pt-2 border-t border-white/5">
                <div className="flex items-center justify-between">
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Market Confluence</p>
                    <div className="flex gap-2">
                        {result.ai_analysis?.weekly_confluence && (
                            <span className="px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider bg-blue-500/10 text-blue-400 border border-blue-500/20">
                                {result.ai_analysis.weekly_confluence}
                            </span>
                        )}
                        {result.ai_analysis?.sector_alignment != null && (
                            <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider border ${result.ai_analysis.sector_alignment >= 0 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border-rose-500/20'}`}>
                                {result.ai_analysis.sector_alignment >= 0 ? 'Sector Aligned' : 'Sector Divergent'}
                            </span>
                        )}
                    </div>
                </div>

                <div className="rounded-2xl p-4 bg-gradient-to-br from-blue-600/10 to-purple-600/10 border border-white/10">
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-[10px] font-black text-white uppercase tracking-widest">AI Position Sizer</span>
                        <span className="text-[8px] font-bold text-slate-400">Risk 1% per trade</span>
                    </div>
                    <div className="flex items-end justify-between">
                        <div>
                            <p className="text-[8px] font-black text-slate-500 uppercase mb-1">Recommended Qty</p>
                            <p className="text-xl font-black text-white tabular-nums">
                                {result.stop_loss && result.ideal_entry ? 
                                    Math.floor(10000 / Math.abs(result.ideal_entry - result.stop_loss)) : '—'} 
                                <span className="text-[10px] ml-1 text-slate-400 font-bold uppercase">Units</span>
                            </p>
                        </div>
                        <div className="text-right">
                            <p className="text-[8px] font-black text-slate-500 uppercase mb-1">Est. Capital</p>
                            <p className="text-xs font-bold text-slate-300 tabular-nums">
                                Rs.{fmt((result.stop_loss && result.ideal_entry ? 
                                    Math.floor(10000 / Math.abs(result.ideal_entry - result.stop_loss)) * result.ideal_entry : 0), 0)}
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// Helper to flatten prediction data for instant rendering
const flattenData = (raw) => {
    if (!raw) return null;
    const ai = raw.ai_analysis || {};
    return {
        ...raw,
        prediction:      raw.prediction || raw.signal,
        confidence:      raw.confidence ?? raw.confidence_score,
        ideal_entry:     ai.ideal_entry || raw.ideal_entry,
        entry_zone_low:  ai.entry_zone_low || raw.entry_zone_low,
        entry_zone_high: ai.entry_zone_high || raw.entry_zone_high,
        target_price:    ai.target_price || raw.target_price,
        target_pct:      ai.target_pct || raw.target_pct,
        target2:         ai.target2 || raw.target2 || raw.target2_price,
        target2_pct:     ai.target2_pct || raw.target2_pct,
        stop_loss:       ai.stop_loss || raw.stop_loss,
        stop_loss_pct:   ai.stop_loss_pct || raw.stop_loss_pct,
        trailing_stop:   ai.trailing_stop || raw.trailing_stop,
        risk_reward:     ai.risk_reward || raw.risk_reward,
        estimated_days:  ai.estimated_days || raw.estimated_days,
        entry_condition: ai.entry_condition || raw.entry_condition,
        exit_condition:  ai.exit_condition || raw.exit_condition,
        risk_note:       ai.risk_note || raw.risk_note,
        market_structure:ai.market_structure || raw.market_structure,
        chartData:       raw.chartData || (ai.sparkline ? ai.sparkline.map(v => ({ close: v })) : [])
    };
};

export default function StockDetailsPage({ selected: initialSelected, onBack }) {
    const [selected, setSelected]       = useState(() => flattenData(initialSelected));
    const [syncing, setSyncing]         = useState(false);
    const [analyzing, setAnalyzing]     = useState(false);
    const [sidebarTab, setSidebarTab]   = useState('overview');
    const [mobileTab, setMobileTab]     = useState('chart');

    React.useEffect(() => {
        if (!initialSelected?.symbol) return;
        
        // Update basic info instantly if it changed
        setSelected(flattenData(initialSelected));

        // Background sync for full chart history
        const sync = async () => {
            setSyncing(true);
            try {
                const { api } = await import('../../api');
                const res = await api.getNepseChart(initialSelected.symbol);
                const fullData = res.data.chart_data || [];
                if (fullData.length > 0) {
                    setSelected(prev => ({ ...prev, chartData: fullData }));
                }
            } catch (e) {
                console.error('Background sync failed:', e);
            } finally {
                setSyncing(false);
            }
        };
        sync();
    }, [initialSelected?.symbol]);

    const handleDeepAnalysis = async () => {
        if (analyzing) return;
        setAnalyzing(true);
        try {
            const { api } = await import('../../api');
            const res = await api.analyzeStockDeep(selected.symbol);
            const data = res.data;
            
            // Format the new data into the selected state
            setSelected(prev => ({
                ...prev,
                ...data,
                prediction:     data.prediction,
                confidence:     data.confidence_score,
                explanation:    data.explanation,
                ideal_entry:    data.ai_analysis?.ideal_entry || data.ideal_entry,
                entry_zone_low: data.ai_analysis?.entry_zone_low || data.entry_zone_low,
                entry_zone_high:data.ai_analysis?.entry_zone_high || data.entry_zone_high,
                target_price:   data.target_price,
                target_pct:     data.target_pct,
                target2:        data.ai_analysis?.target2 || data.target2 || data.target2_price,
                target2_pct:    data.ai_analysis?.target2_pct || data.target2_pct,
                stop_loss:      data.stop_loss,
                stop_loss_pct:  data.stop_loss_pct,
                trailing_stop:  data.ai_analysis?.trailing_stop || data.trailing_stop,
                trailing_stop_pct: data.ai_analysis?.trailing_stop_pct || data.trailing_stop_pct,
                risk_reward:    data.risk_reward,
                estimated_days: data.estimated_days,
                entry_condition:data.ai_analysis?.entry_condition || data.entry_condition,
                exit_condition: data.ai_analysis?.exit_condition || data.exit_condition,
                risk_note:      data.ai_analysis?.risk_note || data.risk_note,
                market_structure:data.ai_analysis?.market_structure || data.market_structure,
                backtest:       data.ai_analysis?.backtest || data.backtest_stats || data.backtest,
                chartData:      data.chart_data?.length > 0 ? data.chart_data : prev.chartData
            }));
            
            invalidate(); // Force history refresh
            
            // Switch to analysis tab to show results
            setSidebarTab('analysis');
            setMobileTab('analysis');
        } catch (e) {
            console.error('Deep analysis failed', e);
            alert('AI Analysis failed. Please try again in a few moments.');
        } finally {
            setAnalyzing(false);
        }
    };

    if (!selected) return null;

    const isBuy  = selected.prediction === 'BUY';
    const isSell = selected.prediction === 'SELL';
    const sigColor  = isBuy ? '#22c55e' : isSell ? '#ef4444' : '#eab308';
    const sigBg     = isBuy ? 'rgba(34,197,94,0.12)'  : isSell ? 'rgba(239,68,68,0.12)'  : 'rgba(234,179,8,0.12)';
    const sigBorder = isBuy ? 'rgba(34,197,94,0.28)'  : isSell ? 'rgba(239,68,68,0.28)'  : 'rgba(234,179,8,0.28)';
    const SigIcon   = isBuy ? TrendingUp : isSell ? TrendingDown : Minus;
    const rrColor   = selected.risk_reward >= 2 ? '#10b981' : selected.risk_reward >= 1 ? '#eab308' : '#ef4444';

    const chartProps = {
        data:          selected.chartData || [],
        prediction:    selected.prediction,
        symbol:        selected.symbol,
        explanation:   selected.explanation || selected.ai_analysis?.explanation,
        idealEntry:    selected.ideal_entry,
        entryZoneLow:  selected.entry_zone_low,
        entryZoneHigh: selected.entry_zone_high,
        targetPrice:   selected.target_price,
        target2:       selected.target2,
        stopLoss:      selected.stop_loss,
        trailingStop:  selected.trailing_stop,
        targetPct:     selected.target_pct,
        target2Pct:    selected.target2_pct,
        stopLossPct:   selected.stop_loss_pct,
        riskReward:    selected.risk_reward,
        estimatedDays: selected.estimated_days,
        volumeProfile: selected.ai_analysis?.volume_profile || selected.volume_profile,
        fibonacci:     selected.ai_analysis?.fibonacci || selected.fibonacci,
    };

    const backtestData = selected.backtest || selected.backtest_stats || null;

    return (
        <div className="flex flex-col gap-4 animate-in fade-in duration-500">

            {/* ── Top header ──────────────────────────────────────────────────── */}
            <div className="flex items-center justify-between gap-2 flex-wrap px-1">
                {/* Left: back + symbol */}
                <div className="flex items-center gap-2 sm:gap-3">
                    <button onClick={onBack}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 sm:px-3.5 sm:py-2 rounded-xl text-[9px] sm:text-[10px] font-black text-slate-400 hover:text-white border border-white/8 hover:border-white/20 hover:bg-white/5 transition-all uppercase tracking-widest shrink-0">
                        <ArrowLeft className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                        Back
                    </button>

                    <div className="h-4 sm:h-5 w-px bg-white/10" />

                    <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
                        <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl flex items-center justify-center text-[9px] sm:text-[10px] font-black shrink-0"
                            style={{ background: sigBg, border: `1px solid ${sigBorder}`, color: sigColor }}>
                            {selected.symbol.slice(0, 2)}
                        </div>
                        <div className="min-w-0">
                            <p className="text-[7px] sm:text-[9px] font-black text-slate-600 uppercase tracking-[0.2em] leading-none mb-0.5 truncate">NEPSE · Equity</p>
                            <h1 className="text-lg sm:text-xl font-black text-white tracking-tighter leading-none truncate">{selected.symbol}</h1>
                        </div>
                        <div className="flex items-center gap-1 px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg sm:rounded-xl text-[8px] sm:text-[10px] font-black uppercase tracking-widest border ml-0.5 sm:ml-1 shrink-0"
                            style={{ color: sigColor, background: sigBg, borderColor: sigBorder }}>
                            <SigIcon className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                            {selected.prediction}
                        </div>
                        
                        {(syncing && !analyzing) && (
                            <div className="flex items-center gap-1 text-[8px] sm:text-[10px] font-black text-blue-400 uppercase tracking-widest shrink-0">
                                <Loader2 className="w-2.5 h-2.5 sm:w-3 sm:h-3 animate-spin" />
                            </div>
                        )}
                    </div>
                </div>

                {/* Right: key stat pills */}
                <div className="flex items-center gap-1.5 sm:gap-2">
                    {selected.confidence != null && (
                        <QuickStat label="Confidence" value={`${Number(selected.confidence).toFixed(0)}%`} color={sigColor} />
                    )}
                    <div className="hidden xs:block">
                        {selected.risk_reward != null && (
                            <QuickStat label="R:R" value={`1:${Number(selected.risk_reward).toFixed(1)}`} color={rrColor} />
                        )}
                    </div>
                    {selected.stop_loss != null && (
                        <QuickStat label="Stop" value={`Rs.${fmt(selected.stop_loss, 0)}`} color="#ef4444" />
                    )}
                </div>
            </div>

            {/* ── Desktop: sidebar + chart ─────────────────────────────────────── */}
            <div className="hidden lg:flex gap-4" style={{ height: 840 }}>

                {/* Sidebar */}
                <div className="shrink-0 flex flex-col rounded-3xl overflow-hidden border border-white/6"
                    style={{ width: 360, background: 'rgba(6,12,24,0.85)' }}>

                    {/* Sidebar tab nav */}
                    <div className="flex items-center gap-1 p-2 border-b border-white/5 shrink-0"
                        style={{ background: 'rgba(255,255,255,0.02)' }}>
                        {[
                            { id: 'overview', label: 'Overview' }, 
                            { id: 'dna',      label: 'DNA Matrix' }, 
                            { id: 'analysis', label: 'AI Analysis' }, 
                            { id: 'backtest', label: 'Backtest' }
                        ].map(({ id, label }) => (
                            <button key={id} onClick={() => setSidebarTab(id)}
                                className="flex-1 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all"
                                style={{
                                    background: sidebarTab === id ? 'rgba(255,255,255,0.07)' : 'transparent',
                                    color:      sidebarTab === id ? '#fff' : '#475569',
                                    border:     sidebarTab === id ? '1px solid rgba(255,255,255,0.08)' : '1px solid transparent',
                                }}>
                                {label}
                            </button>
                        ))}
                    </div>

                    {/* Sidebar content — scrollable */}
                    <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
                        {sidebarTab === 'overview' && (
                            <ExecutionOverview result={selected} sigColor={sigColor} />
                        )}
                        {sidebarTab === 'dna' && (
                            <IndicatorMatrix indicators={selected.indicators} />
                        )}
                        {sidebarTab === 'analysis' && (
                            <div className="p-0">
                                <PredictionResult result={selected} isSidebar />
                            </div>
                        )}
                        {sidebarTab === 'backtest' && (
                            <div className="p-4">
                                <BacktestResults stats={backtestData} isSidebar />
                            </div>
                        )}
                    </div>
                </div>

                {/* Chart */}
                <div className="flex-1 min-w-0 rounded-3xl overflow-hidden border border-white/6 shadow-2xl"
                    style={{ background: 'rgba(5,13,26,0.5)' }}>
                    <TradingChart {...chartProps} />
                </div>
            </div>

            {/* ── Mobile: tab nav + panels ─────────────────────────────────────── */}
            <div className="lg:hidden space-y-3">
                <div className="flex gap-1 p-0.5 rounded-xl sm:rounded-2xl border border-white/8" style={{ background: 'rgba(255,255,255,0.02)' }}>
                    {MOBILE_TABS.map(({ id, label, icon: Icon }) => (
                        <button key={id} onClick={() => setMobileTab(id)}
                            className="flex-1 flex flex-col items-center gap-1 py-2 sm:py-2.5 rounded-lg sm:rounded-xl text-[8px] sm:text-[10px] font-black uppercase tracking-widest transition-all"
                            style={{
                                background: mobileTab === id ? 'rgba(255,255,255,0.08)' : 'transparent',
                                color:      mobileTab === id ? '#fff' : '#475569',
                                border:     mobileTab === id ? '1px solid rgba(255,255,255,0.08)' : '1px solid transparent',
                            }}>
                            <Icon className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                            <span className="hidden xs:inline">{label}</span>
                        </button>
                    ))}
                </div>

                <div className="min-h-[400px]">
                    {mobileTab === 'chart'    && (
                        <div className="rounded-2xl overflow-hidden border border-white/8" style={{ height: 500 }}>
                            <TradingChart {...chartProps} />
                        </div>
                    )}
                    {mobileTab === 'overview' && <ExecutionOverview result={selected} sigColor={sigColor} />}
                    {mobileTab === 'dna'      && <IndicatorMatrix indicators={selected.indicators} />}
                    {mobileTab === 'signals'  && <PredictionResult result={selected} isSidebar />}
                    {mobileTab === 'backtest' && (
                        <div className="p-0">
                            <BacktestResults stats={backtestData} isSidebar />
                        </div>
                    )}
                </div>
            </div>

        </div>
    );
}
