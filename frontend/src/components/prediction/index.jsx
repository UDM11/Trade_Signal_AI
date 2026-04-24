import React, { useEffect, useState } from 'react';
import {
    TrendingUp, TrendingDown, Minus, BrainCircuit, Cpu, Clock,
    Target, Shield, CalendarClock, Activity, Zap, BarChart2,
    AlertTriangle, CheckCircle, Info, ChevronRight, Percent,
    Crosshair, ArrowRightLeft, MoveUpRight, AlertOctagon,
    GitBranch, LogOut, TrendingUpDown,
} from 'lucide-react';

// ── Config ─────────────────────────────────────────────────────────────────────
const SIG = {
    BUY:  { color: '#10b981', dimColor: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.3)',  label: 'Bullish Signal',  icon: TrendingUp,   tier: ['STRONG BUY', 'BUY', 'WEAK BUY'],   structureColor: '#10b981' },
    SELL: { color: '#ef4444', dimColor: 'rgba(239,68,68,0.12)',  border: 'rgba(239,68,68,0.3)',   label: 'Bearish Signal',  icon: TrendingDown, tier: ['STRONG SELL', 'SELL', 'WEAK SELL'], structureColor: '#ef4444' },
    HOLD: { color: '#eab308', dimColor: 'rgba(234,179,8,0.12)',  border: 'rgba(234,179,8,0.3)',   label: 'Neutral — Watch', icon: Minus,        tier: ['STRONG HOLD', 'HOLD', 'WEAK HOLD'], structureColor: '#eab308' },
};

const STRUCTURE_COLOR = { BULLISH: '#10b981', BEARISH: '#ef4444', RANGING: '#eab308' };
const STRUCTURE_BG    = { BULLISH: 'rgba(16,185,129,0.1)', BEARISH: 'rgba(239,68,68,0.1)', RANGING: 'rgba(234,179,8,0.1)' };

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
                <path d={arc(animated)} fill="none" stroke={color} strokeWidth="9" strokeLinecap="round" filter="url(#glow)" style={{ transition: 'all 1.2s cubic-bezier(.4,0,.2,1)' }} />
                <text x="68" y="64" textAnchor="middle" fill="white" style={{ fontSize: 21, fontWeight: 900, fontFamily: 'inherit' }}>{confidence.toFixed(1)}%</text>
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
    const statusBg    = status === 'bull' ? 'rgba(16,185,129,0.1)' : status === 'bear' ? 'rgba(239,68,68,0.1)' : 'rgba(255,255,255,0.04)';
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
    const range  = high - low;
    const pct    = range > 0 ? ((ideal - low) / range) * 100 : 50;
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
export default function PredictionResult({ result }) {
    if (!result) return null;

    const {
        symbol, prediction, confidence,
        explanation, all_proba, model_metrics,
        target_price, stop_loss, estimated_days,
        target_pct, stop_loss_pct, risk_reward,
        indicators,
        // Extended AI analysis
        ideal_entry, entry_zone_low, entry_zone_high, entry_condition,
        target2, target2_pct, trailing_stop, trailing_stop_pct,
        exit_condition, risk_note, market_structure,
    } = result;

    const cfg      = SIG[prediction] || SIG.HOLD;
    const SigIcon  = cfg.icon;
    const tier     = signalTier(prediction, confidence);
    const now      = new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const paragraphs = explanation ? explanation.split(/\n+/).filter(Boolean) : ['No AI analysis available.'];

    // Indicator signals
    const rsi       = indicators?.RSI;
    const macd      = indicators?.MACD_diff;
    const aboveMa50 = indicators?.Above_MA50  === 1;
    const aboveMa200= indicators?.Above_MA200 === 1;
    const bbWidth   = indicators?.BB_Width;
    const volChange = indicators?.Volume_Change;
    const candle    = indicators?.Candle_Body;
    const close     = indicators?.Close;

    const rsiStatus    = rsi == null     ? 'neutral' : rsi > 70 ? 'bear' : rsi < 30 ? 'bull' : 'neutral';
    const macdStatus   = macd == null    ? 'neutral' : macd > 0 ? 'bull' : 'bear';
    const ma50Status   = aboveMa50  ? 'bull' : 'bear';
    const ma200Status  = aboveMa200 ? 'bull' : 'bear';
    const volStatus    = volChange > 0.1 ? 'bull' : volChange < -0.1 ? 'bear' : 'neutral';
    const candleStatus = candle > 0.005  ? 'bull' : candle < -0.005 ? 'bear' : 'neutral';

    const isBuy  = prediction === 'BUY';
    const isSell = prediction === 'SELL';
    const isHold = prediction === 'HOLD';

    const rrColor = risk_reward >= 2 ? '#10b981' : risk_reward >= 1 ? '#eab308' : '#ef4444';

    const ms      = market_structure ?? (isBuy ? 'BULLISH' : isSell ? 'BEARISH' : 'RANGING');
    const msColor = STRUCTURE_COLOR[ms] ?? '#94a3b8';
    const msBg    = STRUCTURE_BG[ms]    ?? 'rgba(255,255,255,0.05)';

    // Entry ref for display: ideal_entry preferred, fallback close
    const entryRef = ideal_entry ?? close;

    return (
        <div className="rounded-2xl overflow-hidden animate-in slide-in-from-bottom-4 fade-in duration-500"
            style={{ background: '#080f1a', border: `1px solid ${cfg.border}`, boxShadow: `0 0 40px ${cfg.dimColor}` }}>

            {/* ── Hero header ─────────────────────────────────────────────── */}
            <div className="relative px-5 sm:px-8 pt-6 pb-5 border-b border-white/5 overflow-hidden">
                <div className="absolute -top-10 -right-10 w-64 h-64 rounded-full opacity-10 blur-3xl pointer-events-none" style={{ background: cfg.color }} />
                <div className="absolute top-0 left-0 right-0 h-0.5 opacity-90" style={{ background: `linear-gradient(90deg, transparent, ${cfg.color}, transparent)` }} />

                <div className="flex items-start justify-between gap-4 relative z-10">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Prediction Result</span>
                            <span className="w-1 h-1 rounded-full bg-slate-600" />
                            <span className="text-[10px] text-slate-600">{now}</span>
                        </div>
                        <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight leading-none">{symbol}</h2>
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                            <span className="text-xs font-bold px-2.5 py-1 rounded-lg" style={{ background: `${cfg.color}18`, color: cfg.color, border: `1px solid ${cfg.border}` }}>
                                {tier}
                            </span>
                            {/* Market structure badge */}
                            <span className="text-xs font-black px-2.5 py-1 rounded-lg uppercase tracking-widest" style={{ background: msBg, color: msColor, border: `1px solid ${msColor}30` }}>
                                {ms}
                            </span>
                            <span className="text-xs text-slate-500">{cfg.label}</span>
                            {close != null && (
                                <span className="text-xs text-slate-500">
                                    · Rs.&nbsp;<span className="text-slate-300 font-semibold">{fmt(close)}</span>
                                </span>
                            )}
                        </div>
                    </div>

                    <div className="flex flex-col items-center gap-2 px-6 py-4 rounded-2xl shrink-0"
                        style={{ background: `${cfg.color}14`, border: `1.5px solid ${cfg.border}`, boxShadow: `0 0 24px ${cfg.dimColor}` }}>
                        <SigIcon className="w-7 h-7" style={{ color: cfg.color }} />
                        <span className="text-2xl font-black tracking-widest" style={{ color: cfg.color }}>{prediction}</span>
                        <div className="flex gap-0.5">
                            {[20, 40, 60, 80, 100].map(t => (
                                <div key={t} className="w-4 h-1 rounded-full transition-all duration-700"
                                    style={{ background: confidence >= t ? cfg.color : 'rgba(255,255,255,0.08)' }} />
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Row 1: Gauge | Trade Levels | Probabilities ─────────────── */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-0 divide-y md:divide-y-0 md:divide-x divide-white/5">

                {/* Col 1 — Confidence */}
                <div className="p-5 sm:p-6 flex flex-col items-center gap-4">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 self-start">Model Confidence</p>
                    <ArcGauge confidence={confidence} color={cfg.color} />
                    <div className="w-full space-y-2">
                        {[
                            { icon: Cpu,           label: 'Engine',       value: 'XGBoost + RF',  color: '#94a3b8' },
                            { icon: Zap,           label: 'Voting',       value: 'Soft Ensemble', color: '#94a3b8' },
                            model_metrics?.accuracy      != null && { icon: CheckCircle, label: 'Test Accuracy',  value: `${model_metrics.accuracy}%`,       color: model_metrics.accuracy >= 60 ? '#10b981' : model_metrics.accuracy >= 45 ? '#eab308' : '#ef4444' },
                            model_metrics?.threshold_used!= null && { icon: AlertTriangle, label: 'Threshold',   value: `±${model_metrics.threshold_used}%`, color: '#94a3b8' },
                        ].filter(Boolean).map(({ icon: Icon, label, value, color }) => (
                            <div key={label} className="flex items-center gap-2.5 rounded-lg px-3 py-2 border border-white/5" style={{ background: 'rgba(255,255,255,0.02)' }}>
                                <Icon className="w-3.5 h-3.5 shrink-0" style={{ color: '#475569' }} />
                                <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 flex-1">{label}</span>
                                <span className="text-xs font-bold" style={{ color }}>{value}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Col 2 — Trade Execution */}
                <div className="p-5 sm:p-6 flex flex-col gap-3">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Trade Execution</p>

                    {/* Entry zone visual */}
                    <EntryZoneBar low={entry_zone_low} ideal={ideal_entry} high={entry_zone_high} color={cfg.color} />

                    <div className="mt-1">
                        <TradeRow
                            icon={Crosshair}
                            label="Ideal Entry"
                            price={entryRef}
                            pct={null}
                            color={cfg.color}
                            note={entry_zone_low && entry_zone_high ? `Zone: Rs. ${fmt(entry_zone_low)} – Rs. ${fmt(entry_zone_high)}` : 'Optimal accumulation price'}
                            highlight
                        />
                        <TradeRow
                            icon={Target}
                            label={isSell ? 'Target 1 (T1)' : 'Target 1 (T1)'}
                            price={target_price}
                            pct={target_pct}
                            color={isSell ? '#ef4444' : '#10b981'}
                            note="Primary profit target"
                        />
                        {target2 != null && (
                            <TradeRow
                                icon={MoveUpRight}
                                label="Target 2 (T2)"
                                price={target2}
                                pct={target2_pct}
                                color={isSell ? '#f87171' : '#34d399'}
                                note="Extended target — strong momentum"
                            />
                        )}
                        <TradeRow
                            icon={Shield}
                            label="Stop Loss"
                            price={stop_loss}
                            pct={stop_loss_pct}
                            color="#ef4444"
                            note="Hard stop — exit immediately on breach"
                        />
                        {trailing_stop != null && (
                            <TradeRow
                                icon={Activity}
                                label="Trailing Stop"
                                price={trailing_stop}
                                pct={trailing_stop_pct}
                                color="#f59e0b"
                                note="Trail up once trade moves in favor"
                            />
                        )}
                    </div>

                    {/* R:R + Timeline */}
                    <div className="grid grid-cols-2 gap-2 mt-auto pt-1">
                        <div className="rounded-xl p-3 border border-white/5 text-center" style={{ background: 'rgba(255,255,255,0.03)' }}>
                            <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-1">Risk : Reward</p>
                            <p className="text-lg font-black" style={{ color: rrColor }}>
                                {risk_reward != null ? `1 : ${Number(risk_reward).toFixed(2)}` : '—'}
                            </p>
                            <p className="text-[10px] text-slate-600 mt-0.5">
                                {risk_reward >= 2 ? 'Excellent' : risk_reward >= 1 ? 'Acceptable' : risk_reward != null ? 'Poor' : '—'}
                            </p>
                        </div>
                        <div className="rounded-xl p-3 border border-white/5 text-center" style={{ background: 'rgba(59,130,246,0.05)', borderColor: 'rgba(59,130,246,0.15)' }}>
                            <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-1">Timeline</p>
                            <p className="text-lg font-black" style={{ color: '#3b82f6' }}>
                                {estimated_days != null ? `${estimated_days}d` : '—'}
                            </p>
                            <p className="text-[10px] text-slate-600 mt-0.5">trading days</p>
                        </div>
                    </div>
                </div>

                {/* Col 3 — Probabilities */}
                <div className="p-5 sm:p-6 flex flex-col gap-4">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Signal Probabilities</p>

                    {all_proba ? (
                        <div className="space-y-2">
                            {[
                                { label: 'BUY',  color: '#10b981' },
                                { label: 'HOLD', color: '#eab308' },
                                { label: 'SELL', color: '#ef4444' },
                            ].map(({ label, color }) => (
                                <ProbaBar key={label} label={label} pct={all_proba[label] ?? 0} color={color} isActive={prediction === label} />
                            ))}
                        </div>
                    ) : (
                        <div className="flex-1 flex items-center justify-center text-slate-600 text-sm">No probability data</div>
                    )}

                    <div className="rounded-xl p-3.5 border border-white/5 mt-auto" style={{ background: 'rgba(255,255,255,0.02)' }}>
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Signal Strength</span>
                            <span className="text-[11px] font-black" style={{ color: cfg.color }}>{confidence.toFixed(1)}%</span>
                        </div>
                        <div className="flex gap-1">
                            {[10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map(t => (
                                <div key={t} className="flex-1 h-2.5 rounded-sm transition-all duration-700"
                                    style={{ background: confidence >= t ? cfg.color : 'rgba(255,255,255,0.06)', opacity: confidence >= t ? (0.4 + (t / 100) * 0.6) : 1 }} />
                            ))}
                        </div>
                        <div className="flex justify-between text-[9px] text-slate-600 mt-1 px-0.5">
                            <span>Weak</span><span>Moderate</span><span>Strong</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Row 2: AI Market Analysis ────────────────────────────────── */}
            <div className="border-t border-white/5 p-5 sm:p-8">
                <div className="flex items-center gap-2.5 mb-5">
                    <div className="p-1.5 rounded-lg" style={{ background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.25)' }}>
                        <BrainCircuit className="w-4 h-4 text-blue-400" />
                    </div>
                    <h4 className="font-bold text-white text-sm">AI Market Analysis</h4>
                    <div className="flex items-center gap-1.5 ml-auto">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                        <span className="text-[10px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full"
                            style={{ background: 'rgba(59,130,246,0.1)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.2)' }}>
                            GPT-4o
                        </span>
                    </div>
                </div>

                {/* Analysis text */}
                <div className="rounded-xl p-4 border border-white/5 space-y-2.5 mb-5" style={{ background: 'rgba(255,255,255,0.02)' }}>
                    {paragraphs.map((para, i) => (
                        <div key={i} className="flex gap-2.5">
                            <span className="text-[10px] font-black mt-0.5 shrink-0" style={{ color: `${cfg.color}70` }}>
                                {String(i + 1).padStart(2, '0')}
                            </span>
                            <p className="text-sm text-slate-300 leading-relaxed">{para}</p>
                        </div>
                    ))}
                </div>

                {/* Condition cards — 3-column grid */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <ConditionCard
                        icon={GitBranch}
                        label="Entry Condition"
                        text={entry_condition}
                        color={cfg.color}
                        iconBg={`${cfg.color}18`}
                    />
                    <ConditionCard
                        icon={LogOut}
                        label="Exit / Profit-Taking"
                        text={exit_condition}
                        color="#3b82f6"
                        iconBg="rgba(59,130,246,0.15)"
                    />
                    {risk_note && (
                        <div className="rounded-xl p-4 border" style={{ background: 'rgba(239,68,68,0.05)', borderColor: 'rgba(239,68,68,0.2)' }}>
                            <div className="flex items-center gap-2 mb-2">
                                <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)' }}>
                                    <AlertOctagon className="w-3 h-3 text-red-400" />
                                </div>
                                <span className="text-[10px] font-black uppercase tracking-widest text-red-400">Key Risk</span>
                            </div>
                            <p className="text-xs text-slate-300 leading-relaxed">{risk_note}</p>
                        </div>
                    )}
                </div>
            </div>

            {/* ── Row 3: Technical Snapshot ────────────────────────────────── */}
            {indicators && (
                <div className="border-t border-white/5 px-5 sm:px-8 pb-6">
                    <div className="flex items-center gap-2 mb-3">
                        <BarChart2 className="w-3.5 h-3.5 text-slate-500" />
                        <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Technical Snapshot</p>
                    </div>
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                        {rsi      != null && <IndPill label="RSI (14)"  value={rsi.toFixed(1)} status={rsiStatus} />}
                        {macd     != null && <IndPill label="MACD Hist" value={macd > 0 ? `+${macd.toFixed(3)}` : macd.toFixed(3)} status={macdStatus} />}
                        <IndPill label="vs MA50"  value={aboveMa50  ? 'Above' : 'Below'} status={ma50Status} />
                        <IndPill label="vs MA200" value={aboveMa200 ? 'Above' : 'Below'} status={ma200Status} />
                        {volChange!= null && <IndPill label="Volume"    value={volChange > 0.1 ? `+${(volChange*100).toFixed(0)}%` : volChange < -0.1 ? `${(volChange*100).toFixed(0)}%` : 'Normal'} status={volStatus} />}
                        {candle   != null && <IndPill label="Candle"    value={candle > 0.005 ? 'Bullish' : candle < -0.005 ? 'Bearish' : 'Doji'} status={candleStatus} />}
                    </div>

                    {(indicators?.Support || indicators?.Resistance) && (
                        <div className="flex items-center gap-4 mt-3 pt-3 border-t border-white/5 flex-wrap">
                            {indicators.Support > 0 && (
                                <div className="flex items-center gap-2 text-xs">
                                    <span className="w-2 h-2 rounded-full" style={{ background: '#10b981' }} />
                                    <span className="text-slate-500">Support</span>
                                    <span className="font-bold text-white">Rs. {fmt(indicators.Support)}</span>
                                </div>
                            )}
                            {indicators.Resistance > 0 && (
                                <div className="flex items-center gap-2 text-xs">
                                    <span className="w-2 h-2 rounded-full" style={{ background: '#ef4444' }} />
                                    <span className="text-slate-500">Resistance</span>
                                    <span className="font-bold text-white">Rs. {fmt(indicators.Resistance)}</span>
                                </div>
                            )}
                            {bbWidth != null && (
                                <div className="flex items-center gap-2 text-xs">
                                    <span className="w-2 h-2 rounded-full" style={{ background: '#6366f1' }} />
                                    <span className="text-slate-500">BB Width</span>
                                    <span className="font-bold text-white">{Number(bbWidth).toFixed(3)}</span>
                                </div>
                            )}
                            {indicators?.Volatility != null && (
                                <div className="flex items-center gap-2 text-xs ml-auto">
                                    <Activity className="w-3 h-3 text-slate-500" />
                                    <span className="text-slate-500">20d Volatility</span>
                                    <span className="font-bold text-white">{(indicators.Volatility * 100).toFixed(2)}%</span>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
