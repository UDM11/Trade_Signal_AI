import React, { useEffect, useState } from 'react';
import {
    TrendingUp, TrendingDown, Minus, BrainCircuit, Cpu, Clock,
    Target, Shield, CalendarClock, Activity, Zap, BarChart2,
    AlertTriangle, CheckCircle, Info, ChevronRight, Percent,
    Crosshair, ArrowRightLeft, MoveUpRight, AlertOctagon,
    GitBranch, LogOut, TrendingUpDown, AlertCircle
} from 'lucide-react';

// ── Config ─────────────────────────────────────────────────────────────────────
const SIG = {
    BUY: { color: '#10b981', dimColor: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.3)', label: 'Bullish Signal', icon: TrendingUp, tier: ['STRONG BUY', 'BUY', 'WEAK BUY'], structureColor: '#10b981' },
    SELL: { color: '#ef4444', dimColor: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.3)', label: 'Bearish Signal', icon: TrendingDown, tier: ['STRONG SELL', 'SELL', 'WEAK SELL'], structureColor: '#ef4444' },
    HOLD: { color: '#eab308', dimColor: 'rgba(234,179,8,0.12)', border: 'rgba(234,179,8,0.3)', label: 'Neutral — Watch', icon: Minus, tier: ['STRONG HOLD', 'HOLD', 'WEAK HOLD'], structureColor: '#eab308' },
};

const STRUCTURE_COLOR = { BULLISH: '#10b981', BEARISH: '#ef4444', RANGING: '#eab308' };
const STRUCTURE_BG = { BULLISH: 'rgba(16,185,129,0.1)', BEARISH: 'rgba(239,68,68,0.1)', RANGING: 'rgba(234,179,8,0.1)' };

function signalTier(prediction, confidence) {
    const tiers = SIG[prediction]?.tier ?? SIG.HOLD.tier;
    if (confidence >= 75) return tiers[0];
    if (confidence >= 50) return tiers[1];
    return tiers[2];
}

const fmt = (n, d = 2) => n != null ? Number(n).toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—';
const pctFmt = (p) => p != null ? `${p >= 0 ? '+' : ''}${Number(p).toFixed(2)}%` : null;

// ── Arc Gauge ──────────────────────────────────────────────────────────────────
function ArcGauge({ confidence, color }) {
    const [animated, setAnimated] = useState(0);
    useEffect(() => { const t = setTimeout(() => setAnimated(confidence), 120); return () => clearTimeout(t); }, [confidence]);
    const r = 52, cx = 68, cy = 68;
    const startAngle = -215, sweepAngle = 250;
    const toRad = d => (d * Math.PI) / 180;
    const arc = pct => {
        const p = Math.min(Math.max(pct, 0.5), 99.5);
        const angle = startAngle + sweepAngle * (p / 100);
        const x1 = cx + r * Math.cos(toRad(startAngle));
        const y1 = cy + r * Math.sin(toRad(startAngle));
        const x2 = cx + r * Math.cos(toRad(angle));
        const y2 = cy + r * Math.sin(toRad(angle));
        return `M ${x1} ${y1} A ${r} ${r} 0 ${sweepAngle * (p / 100) > 180 ? 1 : 0} 1 ${x2} ${y2}`;
    };
    const tier = confidence >= 75 ? 'High' : confidence >= 50 ? 'Medium' : 'Low';
    const tierColor = confidence >= 75 ? '#10b981' : confidence >= 50 ? '#eab308' : '#ef4444';
    return (
        <div className="flex flex-col items-center">
            <svg width="136" height="108" viewBox="0 0 136 108">
                <defs>
                    <filter id="glow"><feGaussianBlur stdDeviation="2.5" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
                </defs>
                <path d={arc(100)} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="9" strokeLinecap="round" />
                <path d={arc(animated || 0)} fill="none" stroke={color} strokeWidth="9" strokeLinecap="round" filter="url(#glow)" style={{ transition: 'all 1.2s cubic-bezier(.4,0,.2,1)' }} />
                <text x="68" y="64" textAnchor="middle" fill="white" style={{ fontSize: 21, fontWeight: 900, fontFamily: 'inherit' }}>{(confidence ?? 0).toFixed(1)}%</text>
                <text x="68" y="80" textAnchor="middle" fill="#64748b" style={{ fontSize: 9.5, letterSpacing: 1.5, fontFamily: 'inherit' }}>CONFIDENCE</text>
            </svg>
            <span className="text-[11px] font-black uppercase tracking-widest mt-0.5" style={{ color: tierColor }}>{tier} Conviction</span>
        </div>
    );
}

// ── Probability bar ────────────────────────────────────────────────────────────
function ProbaBar({ label, pct, color, isActive }) {
    const [w, setW] = useState(0);
    useEffect(() => { const t = setTimeout(() => setW(pct), 150); return () => clearTimeout(t); }, [pct]);
    return (
        <div className={`rounded-xl px-3.5 py-2.5 border transition-all ${isActive ? 'border-opacity-50' : 'border-white/5'}`}
            style={{ background: isActive ? `${color}12` : 'rgba(255,255,255,0.02)', borderColor: isActive ? `${color}40` : undefined }}>
            <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-bold" style={{ color: isActive ? color : '#64748b' }}>{label}</span>
                <span className="text-xs font-black tabular-nums" style={{ color: isActive ? color : '#94a3b8' }}>{pct.toFixed(1)}%</span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)' }}>
                <div className="h-full rounded-full transition-all duration-1000 ease-out" style={{ width: `${w}%`, background: color }} />
            </div>
        </div>
    );
}

// ── Technical indicator pill ───────────────────────────────────────────────────
function IndPill({ label, value, status }) {
    const statusColor = status === 'bull' ? '#10b981' : status === 'bear' ? '#ef4444' : '#94a3b8';
    const statusBg = status === 'bull' ? 'rgba(16,185,129,0.1)' : status === 'bear' ? 'rgba(239,68,68,0.1)' : 'rgba(255,255,255,0.04)';
    return (
        <div className="flex flex-col gap-1 rounded-xl px-3 py-2.5 border border-white/5" style={{ background: statusBg }}>
            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#64748b' }}>{label}</span>
            <span className="text-sm font-black" style={{ color: statusColor }}>{value}</span>
        </div>
    );
}

// ── Trade level row ────────────────────────────────────────────────────────────
function TradeRow({ icon: Icon, label, price, pct, color, note, highlight }) {
    return (
        <div className={`flex items-center gap-3 py-2.5 border-b border-white/5 last:border-0 ${highlight ? 'rounded-xl px-2 -mx-2' : ''}`}
            style={highlight ? { background: `${color}08` } : {}}>
            <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${color}18`, border: `1px solid ${color}30` }}>
                <Icon className="w-3.5 h-3.5" style={{ color }} />
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">{label}</p>
                {note && <p className="text-[10px] text-slate-600 mt-0.5">{note}</p>}
            </div>
            <div className="text-right shrink-0">
                <p className="text-sm font-black text-white tabular-nums">
                    Rs.&nbsp;{price != null ? fmt(price) : '—'}
                </p>
                {pct != null && (
                    <p className="text-[11px] font-bold tabular-nums" style={{ color: pct >= 0 ? '#10b981' : '#ef4444' }}>
                        {pctFmt(pct)}
                    </p>
                )}
            </div>
        </div>
    );
}

// ── Entry Zone bar ─────────────────────────────────────────────────────────────
function EntryZoneBar({ low, ideal, high, color }) {
    if (!low || !high || !ideal) return null;
    const range = high - low;
    const pct = range > 0 ? ((ideal - low) / range) * 100 : 50;
    return (
        <div className="mt-3 p-3 rounded-xl border border-white/5" style={{ background: 'rgba(255,255,255,0.02)' }}>
            <div className="flex justify-between text-[10px] text-slate-500 font-semibold mb-2">
                <span>Zone Low  Rs. {fmt(low)}</span>
                <span>Zone High  Rs. {fmt(high)}</span>
            </div>
            <div className="relative h-2 rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }}>
                <div className="absolute inset-0 rounded-full opacity-30" style={{ background: `linear-gradient(90deg, #ef4444, ${color}, #10b981)` }} />
                {/* Ideal entry marker */}
                <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full border-2 border-white shadow-lg z-10"
                    style={{ left: `${pct}%`, background: color }} />
            </div>
            <p className="text-center text-[10px] font-black mt-2" style={{ color }}>
                Ideal Entry  Rs. {fmt(ideal)}
            </p>
        </div>
    );
}

// ── Condition card ─────────────────────────────────────────────────────────────
function ConditionCard({ icon: Icon, label, text, color, iconBg }) {
    if (!text) return null;
    return (
        <div className="rounded-xl p-4 border border-white/5" style={{ background: 'rgba(255,255,255,0.02)' }}>
            <div className="flex items-center gap-2 mb-2">
                <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0" style={{ background: iconBg, border: `1px solid ${color}30` }}>
                    <Icon className="w-3 h-3" style={{ color }} />
                </div>
                <span className="text-[10px] font-black uppercase tracking-widest" style={{ color }}>{label}</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">{text}</p>
        </div>
    );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function PredictionResult({ result, isSidebar }) {
    if (!result) return null;

    const {
        symbol, prediction, confidence,
        explanation, all_proba, model_metrics,
        target_price, stop_loss, estimated_days,
        target_pct, stop_loss_pct, risk_reward,
        indicators,
        ideal_entry, entry_zone_low, entry_zone_high, entry_condition,
        target2, target2_pct, trailing_stop, trailing_stop_pct,
        exit_condition, risk_note, market_structure,
        ai_analysis
    } = result;

    const cfg = SIG[prediction] || SIG.HOLD;
    const SigIcon = cfg.icon;
    const tier = signalTier(prediction, confidence);
    const now = new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });

    // Better explanation logic: If it's the generic fallback but we have deep data, 
    // we should synthesize a better intro or show the actual explanation.
    const rawExplanation = explanation || (entry_condition ? `Detailed ${prediction} setup detected with institutional logic.` : 'No AI analysis available.');
    const paragraphs = rawExplanation.split(/\n+/).filter(Boolean);

    const rsi = indicators?.RSI;
    const macd = indicators?.MACD_diff;
    const aboveMa50 = indicators?.Above_MA50 === 1;
    const aboveMa200 = indicators?.Above_MA200 === 1;
    const volChange = indicators?.Volume_Change;
    const candle = indicators?.Candle_Body;
    const close = indicators?.Close;

    const isBuy = prediction === 'BUY';
    const isSell = prediction === 'SELL';
    const rrColor = risk_reward >= 2 ? '#10b981' : risk_reward >= 1 ? '#eab308' : '#ef4444';
    const ms = market_structure ?? (isBuy ? 'BULLISH' : isSell ? 'BEARISH' : 'RANGING');
    const msColor = STRUCTURE_COLOR[ms] ?? '#94a3b8';
    const msBg = STRUCTURE_BG[ms] ?? 'rgba(255,255,255,0.05)';
    const entryRef = ideal_entry ?? close;

    return (
        <div className={`relative flex flex-col h-full rounded-2xl transition-all duration-700 overflow-hidden ${isSidebar ? 'text-xs' : ''}`}
            style={{
                background: 'rgba(8, 15, 26, 0.7)',
                border: `1px solid ${isSidebar ? 'rgba(255,255,255,0.05)' : cfg.border}`,
                boxShadow: isSidebar ? 'none' : `0 0 50px ${cfg.dimColor}`
            }}>

            {/* ── Header ──────────────────────────────────────────────────── */}
            <div className={`relative px-4 sm:px-6 py-3 sm:py-4 border-b border-white/5 overflow-hidden ${isSidebar ? 'pb-3' : 'pt-4 sm:pt-5 pb-3 sm:pb-4'}`}>
                <div className="absolute -top-10 -right-10 w-64 h-64 rounded-full opacity-10 blur-3xl pointer-events-none" style={{ background: cfg.color }} />
                <div className="absolute top-0 left-0 right-0 h-[1.5px] opacity-80" style={{ background: `linear-gradient(90deg, transparent, ${cfg.color}, transparent)` }} />

                <div className="flex items-start justify-between gap-3 sm:gap-4 relative z-10">
                    <div className="min-w-0">
                        {!isSidebar && (
                            <div className="hidden xs:flex items-center gap-2 mb-1.5">
                                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Market Intelligence Report</span>
                                <span className="w-1 h-1 rounded-full bg-slate-700" />
                                <span className="text-[10px] font-bold text-slate-600">{now}</span>
                            </div>
                        )}
                        <h2 className={`${isSidebar ? 'text-xl sm:text-2xl' : 'text-2xl sm:text-4xl'} font-black text-white tracking-tighter leading-none truncate`}>{symbol}</h2>
                        <div className="flex items-center gap-1.5 sm:gap-2 mt-2 sm:mt-2.5 flex-wrap">
                            <span className="text-[9px] sm:text-[10px] font-black px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-lg uppercase tracking-widest" style={{ background: `${cfg.color}15`, color: cfg.color, border: `1px solid ${cfg.border}` }}>
                                {tier}
                            </span>
                            <span className="text-[9px] sm:text-[10px] font-black px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-lg uppercase tracking-widest" style={{ background: msBg, color: msColor, border: `1px solid ${msColor}30` }}>
                                {ms}
                            </span>
                            {close != null && (
                                <span className="text-[10px] sm:text-[11px] font-bold text-slate-400">
                                    LTP: <span className="text-white">Rs.{fmt(close)}</span>
                                </span>
                            )}
                        </div>
                    </div>

                    <div className={`${isSidebar ? 'px-3 py-2 sm:px-4 sm:py-3' : 'px-4 py-2 sm:px-6 sm:py-4'} rounded-2xl sm:rounded-[1.5rem] flex flex-col items-center gap-1 sm:gap-1.5 shrink-0`}
                        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', boxShadow: 'inset 0 0 20px rgba(0,0,0,0.2)' }}>
                        <SigIcon className={`${isSidebar ? 'w-4 h-4 sm:w-5 sm:h-5' : 'w-5 h-5 sm:w-7 sm:h-7'}`} style={{ color: cfg.color }} />
                        <span className={`${isSidebar ? 'text-base sm:text-lg' : 'text-lg sm:text-2xl'} font-black tracking-[0.1em]`} style={{ color: cfg.color }}>{prediction}</span>
                    </div>
                </div>
            </div>

            {/* ── Main Intel Grid ─────────────────────────────────────────── */}
            <div className={`grid grid-cols-1 ${isSidebar ? '' : 'md:grid-cols-3'} divide-y divide-white/5`}>

                {/* Conviction Gauge */}
                <div className={`p-3 sm:p-4 flex flex-col items-center ${isSidebar ? 'gap-2' : 'gap-4'} border-r border-white/5`}>
                    <div className="w-full flex items-center justify-between">
                        <p className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-slate-500">Conviction</p>
                        <Zap className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-blue-400/50" />
                    </div>
                    <ArcGauge confidence={confidence} color={cfg.color} />
                    <div className="w-full space-y-1.5 sm:space-y-2 mt-1 sm:mt-2">
                        {[
                            { icon: Cpu, label: 'Engine', value: 'Quantum-X 4.0', color: '#94a3b8' },
                            model_metrics?.accuracy != null && { icon: CheckCircle, label: 'Win Prob.', value: `${model_metrics.accuracy}%`, color: '#10b981' },
                        ].filter(Boolean).map(({ icon: Icon, label, value, color }) => (
                            <div key={label} className="flex items-center gap-2 sm:gap-3 rounded-xl px-2 sm:px-3 py-1.5 sm:py-2 border border-white/5 bg-black/20">
                                <Icon className="w-3 sm:w-3.5 h-3 sm:h-3.5 text-slate-600" />
                                <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-slate-500 flex-1">{label}</span>
                                <span className="text-xs font-black" style={{ color }}>{value}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Levels & Execution */}
                <div className="p-3 sm:p-4 flex flex-col gap-2 sm:gap-3 border-r border-white/5">
                    <p className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-slate-500">Execution Plan</p>
                    <EntryZoneBar low={entry_zone_low} ideal={ideal_entry} high={entry_zone_high} color={cfg.color} />
                    <div className="space-y-0.5 sm:space-y-1">
                        <TradeRow icon={Crosshair} label="Ideal Entry" price={entryRef} color={cfg.color} highlight />
                        <TradeRow icon={Target} label="T1 Target" price={target_price} pct={target_pct} color={isSell ? '#ef4444' : '#10b981'} />
                        {target2 && <TradeRow icon={Zap} label="T2 Target" price={target2} pct={target2_pct} color={isSell ? '#f87171' : '#34d399'} />}
                        {trailing_stop && <TradeRow icon={Activity} label="Trailing Stop" price={trailing_stop} pct={trailing_stop_pct} color="#f59e0b" />}
                        <TradeRow icon={Shield} label="Stop Loss" price={stop_loss} pct={stop_loss_pct} color="#ef4444" />
                    </div>
                    <div className="flex items-center justify-between pt-1 sm:pt-2">
                        <div className="flex flex-col">
                            <span className="text-[8px] sm:text-[9px] font-black text-slate-500 uppercase tracking-widest">R:R Ratio</span>
                            <span className="text-base sm:text-lg font-black" style={{ color: rrColor }}>{risk_reward ? `1:${Number(risk_reward).toFixed(1)}` : '—'}</span>
                        </div>
                        <div className="h-6 sm:h-8 w-px bg-white/5" />
                        <div className="flex flex-col text-right">
                            <span className="text-[8px] sm:text-[9px] font-black text-slate-500 uppercase tracking-widest">Est. Hold</span>
                            <span className="text-base sm:text-lg font-black text-blue-400">{estimated_days ? `${estimated_days}D` : '—'}</span>
                        </div>
                    </div>
                </div>

                {/* Probability Distribution */}
                <div className={`p-3 sm:p-4 lg:p-6 flex flex-col gap-3 sm:gap-6 ${isSidebar ? 'border-t lg:border-t-0' : ''} border-white/5`}>
                    <div className="flex items-center justify-between">
                        <p className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-slate-500">Scenario Forecast</p>
                        <Activity className="w-3 h-3 text-slate-600" />
                    </div>
                    {all_proba && (
                        <div className="space-y-2 sm:space-y-3">
                            <ProbaBar label="BULLISH" pct={all_proba.BUY ?? 0} color="#10b981" isActive={prediction === 'BUY'} />
                            <ProbaBar label="NEUTRAL" pct={all_proba.HOLD ?? 0} color="#eab308" isActive={prediction === 'HOLD'} />
                            <ProbaBar label="BEARISH" pct={all_proba.SELL ?? 0} color="#ef4444" isActive={prediction === 'SELL'} />
                        </div>
                    )}
                    <div className="mt-auto p-3 sm:p-4 rounded-xl sm:rounded-2xl bg-blue-500/5 border border-blue-500/10">
                        <p className="text-[10px] text-slate-400 leading-relaxed italic">
                            "The ensemble model favors a <span className="text-white font-bold">{prediction}</span> setup with {(confidence || 0).toFixed(0)}% conviction. Monitor volume for confirmation."
                        </p>
                    </div>
                </div>
            </div>

            {/* ── Model Integrity & Institutional Analysis ──────────────────── */}
            <div className="p-3 sm:p-5 border-t border-white/5 space-y-6">
                {/* 1. Model Integrity (Trust Metrics) */}
                {model_metrics && (
                    <div className="p-4 sm:p-5 rounded-2xl sm:rounded-3xl bg-white/[0.02] border border-white/5 space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Shield className="w-3.5 h-3.5 text-blue-400" />
                                <h3 className="text-[9px] font-black uppercase tracking-widest text-white">Model Integrity</h3>
                            </div>
                            <span className="px-2 py-0.5 rounded text-[7px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20 uppercase tracking-tighter">Verified</span>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <span className="text-[8px] font-bold text-slate-500 uppercase tracking-wider">Predictive Accuracy</span>
                                <p className="text-lg font-black text-white tabular-nums">{(model_metrics.accuracy || 0).toFixed(1)}%</p>
                            </div>
                            <div className="space-y-1">
                                <span className="text-[8px] font-bold text-slate-500 uppercase tracking-wider">F1-Confidence</span>
                                <p className="text-lg font-black text-white tabular-nums">{(model_metrics.f1_macro || 0).toFixed(2)}</p>
                            </div>
                        </div>
                        <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-500 transition-all duration-1000" style={{ width: `${model_metrics.accuracy}%` }} />
                        </div>
                    </div>
                )}

                {/* 2. Institutional Analysis (DNA Synthesis) */}
                {ai_analysis && (
                    <div className="p-4 sm:p-5 rounded-2xl sm:rounded-3xl bg-white/[0.02] border border-white/5 space-y-5">
                        <div className="flex items-center gap-2">
                            <Activity className="w-3.5 h-3.5 text-emerald-400" />
                            <h3 className="text-[9px] font-black uppercase tracking-widest text-white">Institutional Suite</h3>
                        </div>

                        {/* Multi-Timeframe Alignment */}
                        <div className="flex items-center justify-between p-2.5 rounded-xl bg-black/20 border border-white/5">
                            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Weekly Confluence</span>
                            <span className={`text-[9px] font-black px-2 py-0.5 rounded-md border ${
                                ai_analysis.weekly_confluence?.includes('Bullish') ? 'bg-buy/10 text-buy border-buy/20' : 
                                ai_analysis.weekly_confluence?.includes('Bearish') ? 'bg-sell/10 text-sell border-sell/20' : 
                                'bg-white/5 text-slate-400 border-white/10'
                            }`}>
                                {ai_analysis.weekly_confluence || 'Neutral Alignment'}
                            </span>
                        </div>

                        {/* Fibonacci Matrix */}
                        {ai_analysis.fibonacci && (
                            <div className="space-y-2.5">
                                <p className="text-[8px] font-bold text-slate-600 uppercase tracking-widest px-1">Fibonacci Levels</p>
                                <div className="grid grid-cols-5 gap-1">
                                    {['0.236', '0.382', '0.5', '0.618', '0.786'].map(lvl => (
                                        <div key={lvl} className="flex flex-col items-center p-1.5 rounded-lg bg-white/[0.03] border border-white/5">
                                            <span className="text-[7px] font-bold text-slate-500 mb-0.5">{lvl}</span>
                                            <span className="text-[8px] font-black text-slate-200 tabular-nums">
                                                {fmt(ai_analysis.fibonacci[lvl])}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Risk Note */}
                        {ai_analysis.risk_note && (
                            <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/10">
                                <div className="flex items-center gap-2 mb-1">
                                    <AlertCircle className="w-3 h-3 text-amber-500" />
                                    <span className="text-[8px] font-black text-amber-500 uppercase tracking-widest">Risk Note</span>
                                </div>
                                <p className="text-[10px] text-slate-400 leading-relaxed italic">
                                    "{ai_analysis.risk_note}"
                                </p>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* ── AI Analysis ─────────────────────────────────────────────── */}
            <div className="p-3 sm:p-5 border-t border-white/5">
                <div className="flex items-center gap-2 sm:gap-3 mb-4 sm:mb-6">
                    <div className="p-1 sm:p-1.5 rounded-lg sm:rounded-xl bg-blue-500/10 border border-blue-500/20">
                        <BrainCircuit className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-400" />
                    </div>
                    <h4 className="text-[10px] sm:text-xs font-black text-white uppercase tracking-widest">AI Intelligence Synthesis</h4>
                </div>

                <div className="space-y-4">
                    {/* Market Structure Header */}
                    {market_structure && (
                        <div className="flex gap-4 group bg-white/[0.02] p-3 rounded-xl border border-white/5 mb-2">
                            <span className="text-[10px] font-black mt-1 text-blue-500">INIT</span>
                            <p className="text-sm text-white leading-relaxed font-bold tracking-tight">
                                Analysis Core: <span className="text-blue-400 uppercase tracking-widest ml-1">{market_structure}</span>
                            </p>
                        </div>
                    )}

                    {/* Detailed AI Explanation Paragraphs */}
                    {paragraphs.length > 0 ? (
                        paragraphs
                            .filter(p => !p.includes("Technical Model Engine"))
                            .map((para, i) => (
                                <div key={i} className="flex gap-4 group px-1">
                                    <span className="text-[10px] font-black mt-1 text-slate-600 group-hover:text-blue-500 transition-colors">{String(i + 1).padStart(2, '0')}</span>
                                    <p className="text-sm text-slate-300 leading-relaxed font-medium">{para}</p>
                                </div>
                            ))
                    ) : (
                        <div className="flex gap-4 group px-1">
                            <span className="text-[10px] font-black mt-1 text-slate-600">01</span>
                            <p className="text-sm text-slate-400 italic">Deep institutional analysis pending. Run "Generate Deep AI Report" for full synthesis.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
