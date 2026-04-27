import React, { useState } from 'react';
import {
    ArrowLeft, BarChart3, Brain, Activity, Loader2,
    TrendingUp, TrendingDown, Minus, Target, Shield, Crosshair,
} from 'lucide-react';
import BacktestResults from './BacktestResults';
import PredictionResult from './PredictionResult';
import TradingChart from './TradingChart';
import { invalidate } from '../../cache/predictionsCache';

const MOBILE_TABS = [
    { id: 'chart',    label: 'Chart',    Icon: BarChart3 },
    { id: 'analysis', label: 'Analysis', Icon: Brain     },
    { id: 'backtest', label: 'Backtest', Icon: Activity  },
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
            {/* Entry zone bar */}
            {entry_zone_low && entry_zone_high && (
                <div className="rounded-2xl p-4 border border-white/6" style={{ background: 'rgba(255,255,255,0.02)' }}>
                    <div className="flex justify-between text-[10px] text-slate-500 font-bold mb-3">
                        <span>Zone Low  Rs.{fmt(entry_zone_low)}</span>
                        <span>Zone High  Rs.{fmt(entry_zone_high)}</span>
                    </div>
                    <div className="relative h-2 rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }}>
                        <div className="absolute inset-0 rounded-full opacity-25"
                            style={{ background: 'linear-gradient(90deg,#ef4444,#eab308,#10b981)' }} />
                        <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full border-2 border-white z-10 shadow-lg"
                            style={{ left: `${markerPct}%`, background: sigColor }} />
                    </div>
                    <p className="text-center text-[10px] font-black mt-2.5" style={{ color: sigColor }}>
                        Ideal Entry  Rs.{fmt(ideal_entry ?? close)}
                    </p>
                </div>
            )}

            {/* Trade levels */}
            <div className="rounded-2xl border border-white/6 overflow-hidden" style={{ background: 'rgba(255,255,255,0.015)' }}>
                {rows.map(({ label, price, pct, color }, i) => (
                    <div key={label} className={`flex items-center gap-3 px-4 py-3 ${i < rows.length - 1 ? 'border-b border-white/5' : ''}`}>
                        <div className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider flex-1">{label}</span>
                        <div className="text-right">
                            <p className="text-sm font-black text-white tabular-nums">Rs.{fmt(price)}</p>
                            {pct != null && (
                                <p className="text-[11px] font-bold tabular-nums" style={{ color: pct >= 0 ? '#10b981' : '#ef4444' }}>
                                    {pct >= 0 ? '+' : ''}{Number(pct).toFixed(2)}%
                                </p>
                            )}
                        </div>
                    </div>
                ))}
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

export default function StockDetailsPage({ selected: initialSelected, onBack }) {
    const [selected, setSelected]       = useState(initialSelected);
    const [syncing, setSyncing]         = useState(false);
    const [analyzing, setAnalyzing]     = useState(false);
    const [sidebarTab, setSidebarTab]   = useState('analysis');
    const [mobileTab, setMobileTab]     = useState('chart');

    React.useEffect(() => {
        if (!initialSelected?.symbol) return;
        const sync = async () => {
            setSyncing(true);
            try {
                const { api } = await import('../../api');
                const res = await api.getNepseChart(initialSelected.symbol);
                const fullData = res.data.chart_data || [];
                setSelected(prev => ({
                    ...prev,
                    chartData: fullData.length > 0 ? fullData : (prev.chartData || [])
                }));
            } catch (e) {
                console.error('Failed to sync chart history', e);
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
                <div className="hidden md:flex items-center gap-2">
                    {selected.confidence != null && (
                        <QuickStat label="Confidence" value={`${Number(selected.confidence).toFixed(1)}%`} color={sigColor} />
                    )}
                    {selected.risk_reward != null && (
                        <QuickStat label="R:R Ratio" value={`1 : ${Number(selected.risk_reward).toFixed(1)}`}
                            color={selected.risk_reward >= 1.5 ? '#10b981' : selected.risk_reward >= 0.8 ? '#eab308' : '#ef4444'} />
                    )}
                    {selected.estimated_days != null && (
                        <QuickStat label="Est. Hold" value={`${selected.estimated_days}D`} color="#60a5fa" />
                    )}
                    {selected.target_price != null && (
                        <QuickStat label="T1 Target" value={`Rs.${fmt(selected.target_price)}`} color={isSell ? '#ef4444' : '#10b981'} />
                    )}
                    {selected.stop_loss != null && (
                        <QuickStat label="Stop Loss" value={`Rs.${fmt(selected.stop_loss)}`} color="#ef4444" />
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
                        {[{ id: 'overview', label: 'Overview' }, { id: 'analysis', label: 'AI Analysis' }, { id: 'backtest', label: 'Backtest' }].map(({ id, label }) => (
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
                    {MOBILE_TABS.map(({ id, label }) => (
                        <button key={id} onClick={() => setMobileTab(id)}
                            className="flex-1 py-1.5 sm:py-2.5 rounded-lg sm:rounded-xl text-[9px] sm:text-[10px] font-black uppercase tracking-widest transition-all"
                            style={{
                                background: mobileTab === id ? 'rgba(255,255,255,0.08)' : 'transparent',
                                color:      mobileTab === id ? '#fff' : '#475569',
                            }}>
                            {label}
                        </button>
                    ))}
                </div>

                {mobileTab === 'chart' && (
                    <div className="rounded-2xl overflow-hidden border border-white/6" style={{ height: 450 }}>
                        <TradingChart {...chartProps} />
                    </div>
                )}
                {mobileTab === 'analysis' && <PredictionResult result={selected} isSidebar />}
                {mobileTab === 'backtest' && (
                    <div className="p-1">
                        <BacktestResults stats={backtestData} isSidebar />
                    </div>
                )}
            </div>

        </div>
    );
}
