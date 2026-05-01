import React from 'react';
import {
    Clock, TrendingUp, TrendingDown, Minus,
    Activity, Target, Shield, CalendarClock, Percent, ChevronRight
} from 'lucide-react';

const SURFACE  = 'var(--color-glass)';
const BORDER   = 'var(--color-glass-border)';


// ── Signal config ──────────────────────────────────────────────────────────────
export const SIGNAL = {
    BUY:  { color: '#22c55e', text: 'text-buy',  bg: 'bg-buy/10',  bar: 'bg-buy',  icon: TrendingUp,   glow: 'rgba(34,197,94,0.18)',  glowHover: 'rgba(34,197,94,0.35)'  },
    SELL: { color: '#ef4444', text: 'text-sell', bg: 'bg-sell/10', bar: 'bg-sell', icon: TrendingDown, glow: 'rgba(239,68,68,0.18)',   glowHover: 'rgba(239,68,68,0.35)'   },
    HOLD: { color: '#f59e0b', text: 'text-hold', bg: 'bg-hold/10', bar: 'bg-hold', icon: Minus,        glow: 'rgba(245,158,11,0.18)',  glowHover: 'rgba(245,158,11,0.35)'   },
};

// ── Relative time ──────────────────────────────────────────────────────────────
export function relativeTime(dateStr) {
    const diff = (Date.now() - new Date(dateStr)) / 1000;
    if (diff < 60)         return `${Math.floor(diff)}s ago`;
    if (diff < 3600)       return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400)      return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 86400 * 7)  return `${Math.floor(diff / 86400)}d ago`;
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── Mini sparkline ─────────────────────────────────────────────────────────────
export function MiniSparkline({ chartData, signal }) {
    const color = signal === 'BUY' ? '#22c55e' : signal === 'SELL' ? '#ef4444' : '#f59e0b';
    if (!chartData?.length) {
        return (
            <svg width={80} height={32} viewBox="0 0 80 32" className="overflow-visible opacity-20">
                <line x1="0" y1="16" x2="80" y2="16" stroke={color} strokeWidth="1.5" strokeDasharray="4 3" strokeLinecap="round" />
            </svg>
        );
    }
    const pts = chartData.slice(-30).map(d => d.close).filter(Boolean);
    if (pts.length < 2) return null;
    const min = Math.min(...pts), max = Math.max(...pts);
    const range = max - min || 1;
    const W = 80, H = 32;
    const coords = pts.map((v, i) =>
        `${(i / (pts.length - 1)) * W},${H - ((v - min) / range) * (H - 4) - 2}`
    );
    return (
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="overflow-visible">
            <polyline
                points={coords.join(' ')}
                fill="none"
                stroke={color}
                strokeWidth="1.5"
                strokeLinejoin="round"
                strokeLinecap="round"
                opacity="0.9"
            />
        </svg>
    );
}

// ── Stat cell ──────────────────────────────────────────────────────────────────
function StatCell({ icon: Icon, label, value, sub, valueClass = 'text-white' }) {
    return (
        <div className="flex flex-col gap-1 min-w-0">
            <div className="flex items-center gap-1.5">
                {Icon && <Icon className="w-3 h-3 text-slate-600 shrink-0" />}
                <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest truncate">
                    {label}
                </span>
            </div>
            <span className={`text-[13px] sm:text-sm font-black truncate ${valueClass}`}>
                {value ?? '—'}
            </span>
            {sub && (
                <span className={`text-[9px] sm:text-[10px] font-bold ${
                    sub.startsWith('+') ? 'text-buy'
                  : sub.startsWith('-') ? 'text-sell'
                  : 'text-slate-600'
                }`}>
                    {sub}
                </span>
            )}
        </div>
    );
}

// ── Signal Probability Strip ───────────────────────────────────────────────────
export function SignalProbaStrip({ all_proba, prediction, className = "" }) {
    if (!all_proba) return null;
    
    const b = Number(all_proba.BUY  || 0);
    const h = Number(all_proba.HOLD || 0);
    const s = Number(all_proba.SELL || 0);
    const total = (b + h + s) || 1;

    return (
        <div className={`space-y-1.5 ${className}`}>
            <div className="flex items-center justify-between px-0.5">
                <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Scenario Probability</span>
                <div className="flex gap-2">
                    <span className="text-[8px] font-bold text-buy">{b.toFixed(0)}% B</span>
                    <span className="text-[8px] font-bold text-hold">{h.toFixed(0)}% H</span>
                    <span className="text-[8px] font-bold text-sell">{s.toFixed(0)}% S</span>
                </div>
            </div>
            <div className="h-1.5 w-full flex rounded-full overflow-hidden bg-white/5 border border-white/5">
                <div className="h-full transition-all duration-1000 bg-buy shadow-[0_0_10px_rgba(16,185,129,0.4)]" style={{ width: `${(b/total)*100}%` }} />
                <div className="h-full transition-all duration-1000 bg-hold opacity-80" style={{ width: `${(h/total)*100}%` }} />
                <div className="h-full transition-all duration-1000 bg-sell shadow-[0_0_10px_rgba(239,68,68,0.4)]" style={{ width: `${(s/total)*100}%` }} />
            </div>
        </div>
    );
}

// ── History Card ───────────────────────────────────────────────────────────────
export function HistoryCard({ record, onClick }) {
    const sig    = SIGNAL[record.prediction] || SIGNAL.HOLD;
    const SigIcon = sig.icon;
    const conf   = Number(record.confidence_score ?? record.confidence ?? 0);
    const symbol = record.stocks?.symbol || record.symbol || 'UNKNOWN';

    const latestClose = record.chart_data?.length
        ? record.chart_data[record.chart_data.length - 1]?.close
        : null;

    const fmtPrice = (v) => v != null
        ? `Rs. ${Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        : null;
    const fmtPct = (v) => v != null
        ? `${Number(v) >= 0 ? '+' : ''}${Number(v).toFixed(2)}%`
        : null;

    const dateFormatted = record.created_at
        ? new Date(record.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        : null;

    return (
        <div
            onClick={onClick}
            className="group relative flex flex-col cursor-pointer rounded-2xl overflow-hidden transition-all duration-300 hover:-translate-y-[2px]"
            style={{
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.04)',
            }}
            onMouseEnter={e => {
                e.currentTarget.style.background = `${sig.color}12`;
                e.currentTarget.style.borderColor = `${sig.color}30`;
                e.currentTarget.style.boxShadow = `0 10px 40px -10px rgba(0,0,0,0.5), 0 0 20px 2px ${sig.color}22`;
            }}
            onMouseLeave={e => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.02)';
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.04)';
                e.currentTarget.style.boxShadow = 'none';
            }}
        >
            {/* Radial glow overlay */}
            <div className="absolute inset-0 opacity-0 group-hover:opacity-40 transition-opacity duration-700 pointer-events-none"
                 style={{ background: `radial-gradient(circle at 50% 0%, ${sig.color}15 0%, transparent 70%)` }} />

            {/* Colored top accent gradient line */}
            <div
                className="absolute top-0 left-0 right-0 h-[2px] opacity-60 group-hover:opacity-100 transition-all duration-300"
                style={{ background: `linear-gradient(90deg, transparent, ${sig.color}, transparent)`, boxShadow: `0 0 10px ${sig.color}80` }}
            />

            {/* Left colored vertical bar */}
            <div
                className="absolute left-0 top-0 bottom-0 w-[3px] opacity-70 group-hover:opacity-100 group-hover:w-[4px] transition-all duration-300"
                style={{ background: `linear-gradient(180deg, ${sig.color}, ${sig.color}40)`, boxShadow: `2px 0 15px 0 ${sig.color}50` }}
            />

            {/* Card body */}
            <div className="pl-4 pr-3.5 pt-3.5 pb-2.5 flex flex-col gap-3">

                {/* Row 1: Symbol + Time | Sparkline + Signal badge */}
                <div className="flex items-start justify-between gap-2">
                    {/* Left: Symbol + timestamp */}
                    <div className="min-w-0">
                        <p
                            className="text-base sm:text-lg font-black leading-tight truncate transition-all group-hover:!text-[var(--acc-color)] group-hover:translate-x-1"
                            style={{ '--acc-color': sig.color, color: '#60a5fa' }}
                        >
                            {symbol}
                        </p>
                        <div className="flex flex-wrap items-center gap-1 sm:gap-1.5 mt-0.5">
                            <Clock className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-slate-600 shrink-0" />
                            <span className="text-[10px] sm:text-[11px] text-slate-500 font-medium">
                                {relativeTime(record.created_at)}
                            </span>
                            {dateFormatted && (
                                <>
                                    <span className="hidden xs:inline text-slate-700">·</span>
                                    <span className="hidden xs:inline text-[10px] sm:text-[11px] text-slate-600">{dateFormatted}</span>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Right: Sparkline + Signal badge */}
                    <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                        {record.backtest_stats && (
                            <div className="hidden sm:flex flex-col items-end px-2 py-1 rounded-lg bg-white/5 border border-white/5">
                                <span className="text-[7px] font-black text-slate-500 uppercase tracking-widest">Backtest</span>
                                <span className={`text-[10px] font-black tabular-nums ${record.backtest_stats.return_pct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                    {record.backtest_stats.return_pct >= 0 ? '+' : ''}{record.backtest_stats.return_pct.toFixed(1)}%
                                </span>
                            </div>
                        )}
                        <div className="hidden md:block opacity-70 group-hover:opacity-100 transition-opacity">
                            <MiniSparkline chartData={record.chart_data} signal={record.prediction} />
                        </div>
                        <div
                            className="flex items-center gap-1 px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg sm:rounded-xl border text-[8px] sm:text-[10px] font-black tracking-widest sm:tracking-[0.15em] transition-all group-hover:scale-105"
                            style={{
                                background: `${sig.color}18`,
                                borderColor: `${sig.color}50`,
                                color: sig.color,
                                boxShadow: `0 0 15px ${sig.color}22`
                            }}
                        >
                            <SigIcon className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                            {record.prediction}
                        </div>
                    </div>
                </div>

                {/* Row 2: Stats grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-x-3 gap-y-2.5 sm:gap-x-4 sm:gap-y-3">
                    <StatCell
                        icon={Activity}
                        label="Latest Close"
                        value={fmtPrice(latestClose)}
                    />
                    <StatCell
                        icon={Target}
                        label="Target"
                        value={fmtPrice(record.target_price)}
                        sub={fmtPct(record.target_pct)}
                        valueClass={record.prediction === 'SELL' ? 'text-sell' : 'text-buy'}
                    />
                    <StatCell
                        icon={Shield}
                        label="Stop Loss"
                        value={fmtPrice(record.stop_loss)}
                        sub={record.stop_loss_pct != null ? `-${Math.abs(Number(record.stop_loss_pct)).toFixed(2)}%` : null}
                        valueClass="text-sell"
                    />
                    <StatCell
                        icon={CalendarClock}
                        label="Timeline"
                        value={record.estimated_days != null ? `${record.estimated_days} days` : null}
                        valueClass="text-blue-400"
                    />
                    <StatCell
                        icon={Percent}
                        label="Risk : Reward"
                        value={record.risk_reward != null ? `1 : ${Number(record.risk_reward).toFixed(2)}` : null}
                        valueClass={
                            Number(record.risk_reward) >= 1.5 ? 'text-buy'
                          : Number(record.risk_reward) >= 0.8 ? 'text-hold'
                          : 'text-sell'
                        }
                    />
                </div>

                {/* Row 3: Signal Probability Strip */}
                <SignalProbaStrip all_proba={record.all_proba} prediction={record.prediction} className="mt-1" />

            </div>

            {/* Bottom: Full-width confidence bar */}
            <div className="relative mt-auto">
                {/* Track */}
                <div className="h-[3px] w-full" style={{ background: 'rgba(255,255,255,0.04)' }}>
                    {/* Fill */}
                    <div
                        className="h-full transition-all duration-700"
                        style={{ width: `${conf}%`, background: sig.color }}
                    />
                </div>
                <div className="flex items-center justify-between px-4 sm:px-5 py-3 relative z-10" style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)' }}>
                    <span className="text-[10px] text-slate-500 font-black uppercase tracking-widest group-hover:text-slate-400 transition-colors">Confidence</span>
                    <div className="flex items-center gap-2">
                        <span
                            className="text-sm font-black tabular-nums drop-shadow-md transition-all group-hover:scale-110"
                            style={{ color: sig.color }}
                        >
                            {conf.toFixed(1)}%
                        </span>
                        <ChevronRight
                            className="w-4 h-4 text-slate-600 group-hover:text-white group-hover:translate-x-1.5 transition-all duration-300"
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
