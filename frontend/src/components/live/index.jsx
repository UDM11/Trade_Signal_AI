﻿import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
    TrendingUp, TrendingDown, Search, X, BarChart3, ArrowLeft,
    ChevronUp, ChevronDown, Clock, Wifi, WifiOff, Zap, DollarSign,
    BarChart2, Activity, AlertCircle,
} from 'lucide-react';
import TradingChart from '../chart';
import { api } from '../../api';

// â"€â"€ Theme constants (matches existing app) â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
const SURFACE = 'rgba(8, 15, 26, 0.7)';
const BORDER  = 'rgba(255, 255, 255, 0.08)';

const GLOBAL_STYLES = `
@keyframes flash-green {
    0% { background-color: rgba(34, 197, 94, 0.2); }
    100% { background-color: transparent; }
}
@keyframes flash-red {
    0% { background-color: rgba(239, 68, 68, 0.2); }
    100% { background-color: transparent; }
}
.flash-up { animation: flash-green 1s ease-out; }
.flash-down { animation: flash-red 1s ease-out; }

@keyframes countdown-ring {
    from { stroke-dashoffset: 0; }
    to   { stroke-dashoffset: 100; }
}
.countdown-ring {
    animation: countdown-ring 5s linear infinite;
    transform-origin: center;
    transform: rotate(-90deg);
}

.custom-scrollbar::-webkit-scrollbar {
    height: 6px;
    width: 6px;
}
.custom-scrollbar::-webkit-scrollbar-track {
    background: rgba(255, 255, 255, 0.02);
    border-radius: 4px;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 4px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.2);
}
`;

// â"€â"€ Formatters â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
function fmt(n, d = 2) {
    if (n == null || isNaN(n)) return '—"';
    return Number(n).toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d });
}

function fmtVol(n) {
    if (!n) return '—"';
    if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e7) return (n / 1e7).toFixed(2) + 'Cr';
    if (n >= 1e5) return (n / 1e5).toFixed(2) + 'L';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return String(Math.round(n));
}

function chgColor(v) {
    if (v > 0) return '#22c55e';
    if (v < 0) return '#ef4444';
    return '#64748b';
}

// â"€â"€ Auto-refresh Countdown Ring â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
function CountdownRing({ refreshing }) {
    const R = 14;
    const C = 2 * Math.PI * R; // ~87.96
    return (
        <div className="relative flex items-center justify-center" style={{ width: 36, height: 36 }}>
            <svg width="36" height="36" style={{ position: 'absolute', top: 0, left: 0 }}>
                {/* Track */}
                <circle cx="18" cy="18" r={R} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="2" />
                {/* Animated progress */}
                <circle
                    cx="18" cy="18" r={R}
                    fill="none"
                    stroke={refreshing ? '#3b82f6' : 'rgba(59,130,246,0.45)'}
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeDasharray={`${C} ${C}`}
                    className="countdown-ring"
                    style={{ transition: refreshing ? 'stroke 0.3s' : undefined }}
                />
            </svg>
            {/* Center dot */}
            <span
                className="rounded-full"
                style={{
                    width: 6, height: 6,
                    background: refreshing ? '#3b82f6' : 'rgba(59,130,246,0.5)',
                    boxShadow: refreshing ? '0 0 6px #3b82f6' : 'none',
                    transition: 'all 0.3s',
                }}
            />
        </div>
    );
}

// â"€â"€ Sparkline Component â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
function Sparkline({ data, color }) {
    if (!data || data.length < 2) return null;
    
    // data format: [[timestamp, value], ...]
    const values = data.map(d => d[1]);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    
    // Normalize to 0-100 coordinates
    const points = values.map((val, i) => {
        const x = (i / (values.length - 1)) * 100;
        const y = 100 - ((val - min) / range) * 100;
        return `${x},${y}`;
    }).join(' ');
    
    // Area path adds corners at bottom
    const areaPath = `M0,100 L${points.split(' ')[0]} L${points} L100,100 Z`;

    return (
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full overflow-visible">
            <defs>
                <linearGradient id={`gradient-${color.replace('#','')}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity="0.3" />
                    <stop offset="100%" stopColor={color} stopOpacity="0" />
                </linearGradient>
            </defs>
            <path d={areaPath} fill={`url(#gradient-${color.replace('#','')})`} />
            <polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
    );
}
// â"€â"€ Summary Stats â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
function SummaryCards({ summary }) {
    const adv   = summary?.advancing ?? 0;
    const dec   = summary?.declining ?? 0;
    const unc   = summary?.unchanged ?? 0;
    const total = adv + dec + unc || 1;

    const advPct = Math.round((adv / total) * 100);
    const decPct = Math.round((dec / total) * 100);
    const uncPct = 100 - advPct - decPct;

    // Donut ring circumference
    const R = 28, C = 2 * Math.PI * R;
    const advArc = (adv / total) * C;
    const uncArc = (unc / total) * C;
    const decArc = (dec / total) * C;

    const cards = [
        {
            label: 'Total Turnover',
            value: `Rs. ${fmtVol(summary?.total_turnover)}`,
            sub: 'Daily traded value',
            Icon: DollarSign,
            color: '#3b82f6',
            glow: 'rgba(59,130,246,0.12)',
            border: 'rgba(59,130,246,0.2)',
        },
        {
            label: 'Total Volume',
            value: fmtVol(summary?.total_volume),
            sub: 'Shares traded',
            Icon: BarChart2,
            color: '#8b5cf6',
            glow: 'rgba(139,92,246,0.12)',
            border: 'rgba(139,92,246,0.2)',
        },
        {
            label: 'Total Trades',
            value: fmtVol(summary?.total_trades),
            sub: 'Transactions executed',
            Icon: Zap,
            color: '#f59e0b',
            glow: 'rgba(245,158,11,0.12)',
            border: 'rgba(245,158,11,0.2)',
        },
    ];

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {cards.map(({ label, value, sub, Icon, color, glow, border }) => (
                <div
                    key={label}
                    className="relative rounded-xl overflow-hidden transition-all hover:-translate-y-0.5"
                    style={{ background: SURFACE, border: `1px solid ${BORDER}`, boxShadow: '0 4px 20px rgba(0,0,0,0.15)' }}
                >
                    {/* Top accent line */}
                    <div className="absolute top-0 left-0 right-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${color}60, transparent)` }} />

                    <div className="p-4">
                        {/* Header row */}
                        <div className="flex items-center justify-between mb-3">
                            <span className="text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: '#475569' }}>
                                {label}
                            </span>
                            <div className="p-1.5 rounded-lg" style={{ background: glow, border: `1px solid ${border}` }}>
                                <Icon className="w-3 h-3" style={{ color }} />
                            </div>
                        </div>

                        {/* Value */}
                        <p className="text-xl font-black text-white tabular-nums leading-none mb-1">{value}</p>
                        <p className="text-[10px] font-medium" style={{ color: '#334155' }}>{sub}</p>

                        {/* Bottom fill bar */}
                        <div className="mt-3 h-0.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)' }}>
                            <div className="h-full rounded-full" style={{ width: '100%', background: `linear-gradient(90deg, ${color}80, ${color}20)` }} />
                        </div>
                    </div>
                </div>
            ))}

            {/* â"€â"€ Market Breadth card â"€â"€ */}
            <div
                className="relative rounded-xl overflow-hidden transition-all hover:-translate-y-0.5"
                style={{ background: SURFACE, border: `1px solid ${BORDER}`, boxShadow: '0 4px 20px rgba(0,0,0,0.15)' }}
            >
                <div className="absolute top-0 left-0 right-0 h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(100,116,139,0.4), transparent)' }} />

                <div className="p-4">
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: '#475569' }}>Market Breadth</span>
                        <span className="text-[10px] font-bold tabular-nums" style={{ color: '#475569' }}>{total} stocks</span>
                    </div>

                    <div className="flex items-center gap-3">
                        {/* Donut ring */}
                        <div className="shrink-0 relative" style={{ width: 64, height: 64 }}>
                            <svg width="64" height="64" style={{ transform: 'rotate(-90deg)' }}>
                                <circle cx="32" cy="32" r={R} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="6" />
                                {/* Advancing arc */}
                                <circle cx="32" cy="32" r={R} fill="none" stroke="#22c55e" strokeWidth="6"
                                    strokeDasharray={`${advArc} ${C}`}
                                    strokeDashoffset="0" strokeLinecap="butt" />
                                {/* Unchanged arc */}
                                <circle cx="32" cy="32" r={R} fill="none" stroke="#475569" strokeWidth="6"
                                    strokeDasharray={`${uncArc} ${C}`}
                                    strokeDashoffset={-advArc} strokeLinecap="butt" />
                                {/* Declining arc */}
                                <circle cx="32" cy="32" r={R} fill="none" stroke="#ef4444" strokeWidth="6"
                                    strokeDasharray={`${decArc} ${C}`}
                                    strokeDashoffset={-(advArc + uncArc)} strokeLinecap="butt" />
                            </svg>
                            {/* Center label */}
                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                                <span className="text-[10px] font-black" style={{ color: adv >= dec ? '#22c55e' : '#ef4444' }}>
                                    {adv >= dec ? advPct : decPct}%
                                </span>
                            </div>
                        </div>

                        {/* Stat pills */}
                        <div className="flex flex-col gap-1.5 flex-1">
                            <div className="flex items-center justify-between px-2 py-1 rounded-lg" style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.15)' }}>
                                <span className="text-[10px] font-bold text-emerald-400">▲ Up</span>
                                <span className="text-[11px] font-black text-emerald-400 tabular-nums">{adv} <span className="font-medium opacity-70">{advPct}%</span></span>
                            </div>
                            <div className="flex items-center justify-between px-2 py-1 rounded-lg" style={{ background: 'rgba(100,116,139,0.08)', border: '1px solid rgba(100,116,139,0.15)' }}>
                                <span className="text-[10px] font-bold" style={{ color: '#64748b' }}>—" Flat</span>
                                <span className="text-[11px] font-black tabular-nums" style={{ color: '#64748b' }}>{unc} <span className="font-medium opacity-70">{uncPct}%</span></span>
                            </div>
                            <div className="flex items-center justify-between px-2 py-1 rounded-lg" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)' }}>
                                <span className="text-[10px] font-bold text-red-400">▼ Down</span>
                                <span className="text-[11px] font-black text-red-400 tabular-nums">{dec} <span className="font-medium opacity-70">{decPct}%</span></span>
                            </div>
                        </div>
                    </div>

                    {/* Segmented bar */}
                    <div className="mt-3 h-1 rounded-full overflow-hidden flex gap-px">
                        <div style={{ width: `${advPct}%`, background: '#22c55e', borderRadius: '4px 0 0 4px' }} />
                        <div style={{ width: `${uncPct}%`, background: '#475569' }} />
                        <div style={{ width: `${decPct}%`, background: '#ef4444', borderRadius: '0 4px 4px 0' }} />
                    </div>
                </div>
            </div>
        </div>
    );
}

// â"€â"€ Movers Section â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
function MoverRow({ stock, isGainer, rank, maxPct, mode, onClick }) {
    const isTurnover = mode === 'turnover';
    const cc       = isTurnover ? '#f59e0b' : isGainer ? '#22c55e' : '#ef4444';
    const bgHover  = isTurnover ? 'rgba(245,158,11,0.07)' : isGainer ? 'rgba(34,197,94,0.06)'  : 'rgba(239,68,68,0.05)';
    const bgNormal = isTurnover ? 'rgba(245,158,11,0.03)' : isGainer ? 'rgba(34,197,94,0.03)'  : 'rgba(239,68,68,0.02)';
    const barColor = isTurnover ? 'rgba(245,158,11,0.22)' : isGainer ? 'rgba(34,197,94,0.25)'  : 'rgba(239,68,68,0.2)';
    const borderC  = isTurnover ? 'rgba(245,158,11,0.08)' : isGainer ? 'rgba(34,197,94,0.08)'  : 'rgba(239,68,68,0.06)';
    const val      = isTurnover ? (stock.turnover ?? 0) : Math.abs(stock.change_pct ?? 0);
    const barWidth = maxPct > 0 ? `${(val / maxPct) * 100}%` : '0%';

    const prevLtpRef = useRef(stock.ltp);
    const [flashClass, setFlashClass] = useState('');

    useEffect(() => {
        if (stock.ltp !== prevLtpRef.current && stock.ltp > 0) {
            const isUp = stock.ltp > prevLtpRef.current;
            setFlashClass(isUp ? 'flash-up' : 'flash-down');
            const t = setTimeout(() => setFlashClass(''), 1000);
            prevLtpRef.current = stock.ltp;
            return () => clearTimeout(t);
        }
    }, [stock.ltp]);

    return (
        <button
            onClick={() => onClick(stock)}
            className={`group w-full text-left rounded-xl transition-all duration-150 ${flashClass}`}
            style={{ background: bgNormal, border: `1px solid ${borderC}` }}
            onMouseEnter={e => e.currentTarget.style.background = bgHover}
            onMouseLeave={e => e.currentTarget.style.background = bgNormal}
        >
            {/* Progress bar background */}
            <div className="relative overflow-hidden rounded-xl">
                <div className="absolute inset-y-0 left-0 rounded-xl transition-all duration-500"
                    style={{ width: barWidth, background: barColor }} />

                <div className="relative flex items-center gap-3 px-3 py-2.5">
                    {/* Rank badge */}
                    <span className="shrink-0 w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-black"
                        style={{ background: 'rgba(255,255,255,0.05)', color: '#475569' }}>
                        {rank}
                    </span>

                    {/* Symbol + price */}
                    <div className="flex-1 min-w-0">
                        <p className="text-xs font-black text-white leading-tight">{stock.symbol}</p>
                        <p className="text-[10px] tabular-nums font-medium mt-0.5" style={{ color: '#475569' }}>
                            Rs.&nbsp;{fmt(stock.ltp)}
                        </p>
                    </div>

                    {/* Value badge */}
                    <div className="shrink-0 flex flex-col items-end">
                        {isTurnover ? (
                            <span className="text-sm font-black tabular-nums" style={{ color: cc }}>
                                Rs.{fmtVol(stock.turnover)}
                            </span>
                        ) : (
                            <>
                                <span className="text-sm font-black tabular-nums" style={{ color: cc }}>
                                    {isGainer ? '+' : ''}{fmt(stock.change_pct)}%
                                </span>
                                {stock.change != null && (
                                    <span className="text-[10px] tabular-nums font-semibold" style={{ color: cc, opacity: 0.7 }}>
                                        {isGainer ? '+' : ''}{fmt(stock.change)}
                                    </span>
                                )}
                            </>
                        )}
                    </div>
                </div>
            </div>
        </button>
    );
}

function MoversSection({ gainers, losers, turnovers, onSelect }) {
    const panels = [
        { title: 'Top Gainers',   Icon: TrendingUp,   iconColor: '#22c55e', accentBg: 'rgba(34,197,94,0.07)',   accentBorder: 'rgba(34,197,94,0.2)',   list: gainers,   isGainer: true,  mode: 'pct'      },
        { title: 'Top Losers',    Icon: TrendingDown, iconColor: '#ef4444', accentBg: 'rgba(239,68,68,0.06)',  accentBorder: 'rgba(239,68,68,0.18)',  list: losers,    isGainer: false, mode: 'pct'      },
        { title: 'Top Turnovers', Icon: DollarSign,   iconColor: '#f59e0b', accentBg: 'rgba(245,158,11,0.07)', accentBorder: 'rgba(245,158,11,0.2)',  list: turnovers, isGainer: null,  mode: 'turnover' },
    ];

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {panels.map(({ title, Icon, iconColor, accentBg, accentBorder, list, isGainer, mode }) => {
                const top    = list.slice(0, 7);
                const maxVal = mode === 'turnover'
                    ? Math.max(...top.map(s => s.turnover ?? 0), 1)
                    : Math.max(...top.map(s => Math.abs(s.change_pct ?? 0)), 1);

                return (
                    <div key={title} className="relative rounded-xl overflow-hidden"
                        style={{ background: SURFACE, border: `1px solid ${BORDER}`, boxShadow: '0 4px 24px rgba(0,0,0,0.15)' }}>

                        <div className="absolute top-0 left-0 right-0 h-px"
                            style={{ background: `linear-gradient(90deg, transparent, ${iconColor}55, transparent)` }} />

                        {/* Header */}
                        <div className="px-4 pt-4 pb-3 flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                                <div className="p-1.5 rounded-lg" style={{ background: accentBg, border: `1px solid ${accentBorder}` }}>
                                    <Icon className="w-3.5 h-3.5" style={{ color: iconColor }} />
                                </div>
                                <div>
                                    <p className="text-xs font-black text-white tracking-wide">{title}</p>
                                    <p className="text-[10px] font-medium" style={{ color: '#334155' }}>
                                        {list.length} stocks Â· Today
                                    </p>
                                </div>
                            </div>
                            {top[0] && (
                                <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg"
                                    style={{ background: accentBg, border: `1px solid ${accentBorder}` }}>
                                    <span className="text-[10px] font-black" style={{ color: iconColor }}>
                                        {mode === 'turnover'
                                            ? `Rs.${fmtVol(top[0].turnover)}`
                                            : `${isGainer ? '+' : ''}${fmt(top[0].change_pct)}%`}
                                    </span>
                                    <span className="text-[9px] font-semibold" style={{ color: '#475569' }}>top</span>
                                </div>
                            )}
                        </div>

                        <div className="mx-4 mb-3 h-px" style={{ background: 'rgba(255,255,255,0.04)' }} />

                        <div className="px-3 pb-3 space-y-1.5">
                            {top.map((s, i) => (
                                <MoverRow
                                    key={s.symbol}
                                    stock={s}
                                    isGainer={isGainer}
                                    rank={i + 1}
                                    maxPct={maxVal}
                                    mode={mode}
                                    onClick={onSelect}
                                />
                            ))}
                            {list.length === 0 && (
                                <div className="py-6 flex flex-col items-center gap-2">
                                    <Activity className="w-6 h-6" style={{ color: 'rgba(255,255,255,0.06)' }} />
                                    <p className="text-xs" style={{ color: '#334155' }}>No data available</p>
                                </div>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

// â"€â"€ All Stocks Table â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
const COLS = [
    { key: 'symbol',     label: 'Symbol',  numeric: false },
    { key: 'ltp',        label: 'LTP',     numeric: true  },
    { key: 'change',     label: 'Chg',     numeric: true  },
    { key: 'change_pct', label: '%',        numeric: true  },
    { key: 'open',       label: 'Open',    numeric: true  },
    { key: 'high',       label: 'High',    numeric: true  },
    { key: 'low',        label: 'Low',     numeric: true  },
    { key: 'volume',     label: 'Volume',  numeric: true  },
    { key: 'trades',     label: 'Trades',  numeric: true  },
];

function SortIcon({ col, sort }) {
    if (sort.key !== col) return <ChevronUp className="w-3 h-3 opacity-20" />;
    return sort.dir === 1
        ? <ChevronUp className="w-3 h-3 text-blue-400" />
        : <ChevronDown className="w-3 h-3 text-blue-400" />;
}

// Animated table row with price-flash
function StockRow({ stock, onSelect }) {
    const cc = chgColor(stock.change);
    const prevLtpRef = useRef(stock.ltp);
    const [flashClass, setFlashClass] = useState('');

    useEffect(() => {
        if (stock.ltp !== prevLtpRef.current && stock.ltp > 0) {
            setFlashClass(stock.ltp > prevLtpRef.current ? 'flash-up' : 'flash-down');
            const t = setTimeout(() => setFlashClass(''), 1000);
            prevLtpRef.current = stock.ltp;
            return () => clearTimeout(t);
        }
    }, [stock.ltp]);

    const pctAbs = Math.abs(stock.change_pct ?? 0);
    const barColor = stock.change > 0 ? 'rgba(34,197,94,0.18)' : stock.change < 0 ? 'rgba(239,68,68,0.15)' : 'rgba(100,116,139,0.12)';

    return (
        <tr
            className={`cursor-pointer border-t group ${flashClass}`}
            style={{ borderColor: 'rgba(255,255,255,0.03)', transition: 'background 0.15s' }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.035)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            onClick={() => onSelect(stock)}
        >
            {/* Symbol */}
            <td className="px-3 py-2.5 sticky left-0" style={{ background: 'inherit', zIndex: 1 }}>
                <span className="font-black text-white text-xs">{stock.symbol}</span>
                {stock.name && (
                    <p className="text-[10px] truncate max-w-[130px] mt-0.5" style={{ color: '#475569' }}>
                        {stock.name}
                    </p>
                )}
            </td>

            {/* LTP */}
            <td className="px-3 py-2.5 font-bold tabular-nums text-xs" style={{ color: cc }}>
                {fmt(stock.ltp)}
            </td>

            {/* Chg */}
            <td className="px-3 py-2.5 font-semibold tabular-nums text-xs" style={{ color: cc }}>
                {stock.change >= 0 ? '+' : ''}{fmt(stock.change)}
            </td>

            {/* % with inline bar */}
            <td className="px-3 py-2.5">
                <div className="flex items-center gap-2">
                    <span
                        className="font-bold px-2 py-0.5 rounded text-[11px] tabular-nums shrink-0"
                        style={{
                            color: cc,
                            background: stock.change > 0 ? 'rgba(34,197,94,0.1)' : stock.change < 0 ? 'rgba(239,68,68,0.1)' : 'rgba(100,116,139,0.1)',
                            border: `1px solid ${stock.change > 0 ? 'rgba(34,197,94,0.2)' : stock.change < 0 ? 'rgba(239,68,68,0.18)' : 'rgba(100,116,139,0.15)'}`,
                        }}
                    >
                        {stock.change_pct >= 0 ? '+' : ''}{fmt(stock.change_pct)}%
                    </span>
                    {/* Mini bar */}
                    <div className="hidden sm:block w-12 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)' }}>
                        <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{ width: `${Math.min((pctAbs / 10) * 100, 100)}%`, background: barColor }}
                        />
                    </div>
                </div>
            </td>

            {/* Open */}
            <td className="px-3 py-2.5 tabular-nums text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>
                {fmt(stock.open)}
            </td>

            {/* High */}
            <td className="px-3 py-2.5 tabular-nums text-xs" style={{ color: '#4ade80' }}>
                {fmt(stock.high)}
            </td>

            {/* Low */}
            <td className="px-3 py-2.5 tabular-nums text-xs" style={{ color: '#f87171' }}>
                {fmt(stock.low)}
            </td>

            {/* Volume */}
            <td className="px-3 py-2.5 tabular-nums text-xs" style={{ color: '#475569' }}>
                {fmtVol(stock.volume)}
            </td>

            {/* Trades */}
            <td className="px-3 py-2.5 tabular-nums text-xs" style={{ color: '#475569' }}>
                {fmtVol(stock.trades)}
            </td>

            {/* View */}
            <td className="px-3 py-2.5">
                <button
                    className="px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all"
                    style={{ background: 'rgba(59,130,246,0.08)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.18)' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(59,130,246,0.18)'; e.currentTarget.style.borderColor = 'rgba(59,130,246,0.4)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(59,130,246,0.08)'; e.currentTarget.style.borderColor = 'rgba(59,130,246,0.18)'; }}
                    onClick={e => { e.stopPropagation(); onSelect(stock); }}
                >
                    View
                </button>
            </td>
        </tr>
    );
}

function StocksTable({ stocks, search, setSearch, sort, setSort, onSelect }) {
    const filtered = useMemo(() => {
        const q = search.trim().toUpperCase();
        const list = q
            ? stocks.filter(s => s.symbol.includes(q) || (s.name || '').toUpperCase().includes(q))
            : stocks;
        return [...list].sort((a, b) => {
            const av = a[sort.key] ?? 0;
            const bv = b[sort.key] ?? 0;
            if (typeof av === 'string') return sort.dir * av.localeCompare(bv);
            return sort.dir * (av - bv);
        });
    }, [stocks, search, sort]);

    function toggleSort(key) {
        setSort(prev => prev.key === key ? { key, dir: -prev.dir } : { key, dir: -1 });
    }

    return (
        <div className="rounded-2xl overflow-hidden"
            style={{ background: SURFACE, border: `1px solid ${BORDER}`, boxShadow: '0 4px 24px rgba(0,0,0,0.2)' }}>

            {/* Top accent line */}
            <div className="h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(59,130,246,0.4), transparent)' }} />

            {/* Header bar */}
            <div className="px-4 py-3 border-b flex flex-col sm:flex-row sm:items-center gap-3"
                style={{ borderColor: BORDER }}>

                {/* Left: icon + title + count */}
                <div className="flex items-center gap-2.5 shrink-0">
                    <div className="p-1.5 rounded-lg" style={{ background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)' }}>
                        <BarChart3 className="w-3.5 h-3.5 text-blue-400" />
                    </div>
                    <span className="text-sm font-black text-white">All Listed Stocks</span>
                    <span
                        className="text-[10px] px-2 py-0.5 rounded-full font-black tabular-nums"
                        style={{ background: 'rgba(59,130,246,0.1)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.2)' }}
                    >
                        {filtered.length}
                    </span>
                </div>

                {/* Right: search —" full width on mobile */}
                <div className="sm:ml-auto flex items-center gap-2 px-3 py-2 rounded-xl w-full sm:w-auto"
                    style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                    <Search className="w-3.5 h-3.5 shrink-0" style={{ color: '#475569' }} />
                    <input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search symbol or name—¦"
                        className="bg-transparent text-xs text-white placeholder-slate-600 outline-none flex-1 min-w-0"
                        style={{ minWidth: 0 }}
                    />
                    {search && (
                        <button onClick={() => setSearch('')} className="shrink-0">
                            <X className="w-3.5 h-3.5 text-slate-600 hover:text-slate-400 transition-colors" />
                        </button>
                    )}
                </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-xs" style={{ borderCollapse: 'collapse', minWidth: 680 }}>
                    <thead className="sticky top-0" style={{ background: '#05101e', zIndex: 2 }}>
                        <tr>
                            {COLS.map(col => (
                                <th
                                    key={col.key}
                                    className="px-3 py-3 text-left cursor-pointer select-none whitespace-nowrap"
                                    style={{ color: '#475569', fontWeight: 700, fontSize: 10, letterSpacing: '0.07em', textTransform: 'uppercase' }}
                                    onClick={() => toggleSort(col.key)}
                                >
                                    <div className="flex items-center gap-1 hover:text-slate-300 transition-colors">
                                        {col.label}
                                        <SortIcon col={col.key} sort={sort} />
                                    </div>
                                </th>
                            ))}
                            <th className="px-3 py-3 text-left"
                                style={{ color: '#475569', fontWeight: 700, fontSize: 10, letterSpacing: '0.07em', textTransform: 'uppercase' }}>
                                Chart
                            </th>
                        </tr>
                        {/* Header bottom border */}
                        <tr><td colSpan={COLS.length + 1} style={{ padding: 0, height: 1, background: 'rgba(255,255,255,0.05)' }} /></tr>
                    </thead>
                    <tbody>
                        {filtered.map(stock => (
                            <StockRow key={stock.symbol} stock={stock} onSelect={onSelect} />
                        ))}
                    </tbody>
                </table>

                {filtered.length === 0 && (
                    <div className="py-16 flex flex-col items-center gap-3">
                        <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
                            style={{ background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.12)' }}>
                            <Search className="w-5 h-5" style={{ color: 'rgba(59,130,246,0.4)' }} />
                        </div>
                        <p className="text-sm font-semibold" style={{ color: '#475569' }}>
                            No results{search ? ` for "${search}"` : ''}
                        </p>
                        {search && (
                            <button
                                onClick={() => setSearch('')}
                                className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                                style={{ background: 'rgba(59,130,246,0.08)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.15)' }}
                            >
                                Clear search
                            </button>
                        )}
                    </div>
                )}
            </div>

            {/* Footer */}
            {filtered.length > 0 && (
                <div className="px-4 py-2 border-t flex items-center justify-between"
                    style={{ borderColor: 'rgba(255,255,255,0.04)', background: 'rgba(0,0,0,0.2)' }}>
                    <span className="text-[10px] font-semibold" style={{ color: '#334155' }}>
                        Showing {filtered.length} of {stocks.length} stocks
                    </span>
                    <span className="text-[10px] font-semibold" style={{ color: '#1e293b' }}>
                        Click any row to view chart
                    </span>
                </div>
            )}
        </div>
    );
}

// â"€â"€ Stock Detail Panel (slide-in from right) â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
function getNPTDateStr() {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kathmandu' }).format(new Date());
}

function StockDetailPanel({ stock, chartData, chartLoading, onClose, isMarketOpen, stocks, onSwitch }) {
    const [tab, setTab] = useState('chart'); // 'chart' | 'history'
    const [symQuery, setSymQuery] = useState('');
    const [symOpen, setSymOpen]   = useState(false);
    const symRef = useRef(null);

    // Initialize with today's session data from the stocks table (available immediately)
    const [liveCandle, setLiveCandle] = useState(() =>
        stock?.ltp ? {
            time:  getNPTDateStr(),
            open:  stock.open  || stock.ltp,
            high:  stock.high  || stock.ltp,
            low:   stock.low   || stock.ltp,
            close: stock.ltp,
            value: stock.volume || 0,
        } : null
    );

    // Close symbol dropdown when clicking outside
    useEffect(() => {
        const handler = (e) => { if (symRef.current && !symRef.current.contains(e.target)) setSymOpen(false); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const symResults = useMemo(() => {
        const q = symQuery.trim().toUpperCase();
        if (!q || !stocks?.length) return [];
        return stocks
            .filter(s => s.symbol.includes(q) || (s.name || '').toUpperCase().includes(q))
            .slice(0, 8);
    }, [symQuery, stocks]);

    const cc = chgColor(stock.change);
    const up = stock.change >= 0;

    // Sorted newest-first for the history table
    const historyRows = useMemo(
        () => [...chartData].reverse(),
        [chartData]
    );

    // Derive prev close from chart history when pvh data doesn't include it
    // chartData is sorted oldest-first; second-to-last row = previous trading day
    const prevClose = useMemo(() => {
        if (stock.prev_close > 0) return stock.prev_close;
        if (chartData.length >= 2) return chartData[chartData.length - 2].close;
        return 0;
    }, [stock.prev_close, chartData]);

    // Poll for live price updates every 5 seconds when market is open
    useEffect(() => {
        if (!isMarketOpen) return;
        const poll = async () => {
            try {
                const res = await api.getNepseQuote(stock.symbol);
                const q = res.data;
                if (q?.ltp > 0) {
                    setLiveCandle({
                        time:  getNPTDateStr(),
                        open:  q.open  || q.ltp,
                        high:  q.high  || q.ltp,
                        low:   q.low   || q.ltp,
                        close: q.ltp,
                        value: q.volume || 0,
                    });
                }
            } catch { /* ignore — chart keeps showing last known price */ }
        };
        poll();
        const id = setInterval(poll, 5000);
        return () => clearInterval(id);
    }, [isMarketOpen, stock.symbol]);

    return (
        <div className="w-full flex flex-col" style={{ fontFamily: 'Inter,system-ui,sans-serif', background: '#050d1a', minHeight: '80vh' }}>
            <div className="w-full flex flex-col">

                {/* Header */}
                <div className="px-5 py-4 border-b flex items-center justify-between gap-4 shrink-0 rounded-2xl mb-4"
                    style={{ background: 'rgba(8,15,26,0.8)', borderColor: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.06)' }}>

                    {/* Left: symbol info + price */}
                    <div className="flex items-center gap-4 flex-wrap min-w-0">
                        <div className="min-w-0">
                            <div className="flex items-center gap-2">
                                <span className="text-xl font-black text-white">{stock.symbol}</span>
                                <span className="text-[10px] px-2 py-0.5 rounded font-bold shrink-0"
                                    style={{ background: 'rgba(59,130,246,0.12)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.2)' }}>
                                    NEPSE
                                </span>
                            </div>
                            {stock.name && (
                                <p className="text-xs truncate max-w-[180px]" style={{ color: '#475569' }}>{stock.name}</p>
                            )}
                        </div>
                        <div className="flex items-center gap-3">
                            <span className="text-2xl font-black" style={{ color: cc }}>
                                Rs. {fmt(stock.ltp)}
                            </span>
                            <span className="text-sm font-bold px-2.5 py-1 rounded-lg"
                                style={{ color: cc, background: up ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.08)' }}>
                                {up ? '▲' : '▼'} {up ? '+' : ''}{fmt(stock.change)} ({up ? '+' : ''}{fmt(stock.change_pct)}%)
                            </span>
                        </div>
                    </div>

                    {/* Right: symbol switcher + close */}
                    <div className="flex items-center gap-2 shrink-0">

                        {/* Symbol search — switch to any other stock without closing */}
                        <div ref={symRef} className="relative">
                            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
                                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }}>
                                <Search className="w-3.5 h-3.5 shrink-0" style={{ color: '#475569' }} />
                                <input
                                    value={symQuery}
                                    onChange={e => { setSymQuery(e.target.value); setSymOpen(true); }}
                                    onFocus={() => setSymOpen(true)}
                                    placeholder="Switch symbol..."
                                    className="bg-transparent text-xs text-white placeholder-slate-600 outline-none w-28"
                                />
                                {symQuery && (
                                    <button onClick={() => { setSymQuery(''); setSymOpen(false); }}>
                                        <X className="w-3 h-3" style={{ color: '#475569' }} />
                                    </button>
                                )}
                            </div>

                            {/* Dropdown results */}
                            {symOpen && symResults.length > 0 && (
                                <div className="absolute right-0 top-full mt-1 w-64 rounded-xl overflow-hidden shadow-2xl z-10"
                                    style={{ background: '#0a1628', border: '1px solid rgba(255,255,255,0.1)' }}>
                                    {symResults.map(s => (
                                        <button key={s.symbol}
                                            className="w-full flex items-center justify-between px-4 py-2.5 text-left transition-colors"
                                            style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                            onClick={() => { onSwitch(s); setSymQuery(''); setSymOpen(false); }}>
                                            <div>
                                                <p className="text-xs font-black text-white">{s.symbol}</p>
                                                {s.name && <p className="text-[10px] truncate max-w-[150px]" style={{ color: '#475569' }}>{s.name}</p>}
                                            </div>
                                            <span className="text-xs font-bold tabular-nums shrink-0 ml-3"
                                                style={{ color: chgColor(s.change) }}>
                                                {fmt(s.ltp)}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        <button onClick={onClose}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors"
                            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8' }}
                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}>
                            <ArrowLeft className="w-4 h-4" />
                            Back to Market
                        </button>
                    </div>
                </div>

                {/* OHLC stats strip */}
                <div className="px-5 py-3 grid grid-cols-2 sm:grid-cols-4 gap-4 rounded-2xl mb-4"
                    style={{ background: 'rgba(8,15,26,0.8)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    {[
                        { label: 'Open',       value: stock.open > 0 ? fmt(stock.open) : '—"',   color: stock.open > 0 ? 'white' : '#334155'    },
                        { label: 'High',       value: fmt(stock.high),                           color: '#22c55e'                               },
                        { label: 'Low',        value: fmt(stock.low),                            color: '#ef4444'                               },
                        { label: 'Prev Close', value: prevClose > 0 ? fmt(prevClose) : '—"',      color: prevClose > 0 ? '#94a3b8' : '#334155'   },
                    ].map(({ label, value, color }) => (
                        <div key={label}>
                            <p className="text-[10px] font-semibold uppercase tracking-widest mb-0.5"
                                style={{ color: '#475569' }}>{label}</p>
                            <p className="text-sm font-bold" style={{ color }}>{value}</p>
                        </div>
                    ))}
                </div>

                {/* Tab switcher */}
                <div className="flex items-center gap-2 mb-0"
                    style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    {[
                        { id: 'chart',   label: 'Chart' },
                        { id: 'history', label: `Price History${chartData.length ? ` (${chartData.length})` : ''}` },
                    ].map(t => (
                        <button key={t.id}
                            onClick={() => setTab(t.id)}
                            className="px-4 py-2 text-xs font-bold transition-all rounded-t-lg"
                            style={{
                                color:        tab === t.id ? '#60a5fa' : '#475569',
                                borderBottom: tab === t.id ? '2px solid #3b82f6' : '2px solid transparent',
                                background:   tab === t.id ? 'rgba(59,130,246,0.06)' : 'transparent',
                            }}>
                            {t.label}
                        </button>
                    ))}
                </div>

                {/* Chart area */}
                {tab === 'chart' && (
                    <div className="relative overflow-hidden rounded-2xl" style={{ height: '70vh', background: '#050d1a', border: '1px solid rgba(255,255,255,0.06)' }}>
                        {chartLoading ? (
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                                <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                                <p className="text-xs" style={{ color: '#475569' }}>Loading historical data—¦</p>
                            </div>
                        ) : chartData.length > 0 ? (
                            <TradingChart data={chartData} liveCandle={liveCandle} />
                        ) : (
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                                <BarChart3 className="w-10 h-10" style={{ color: 'rgba(255,255,255,0.05)' }} />
                                <p className="text-sm" style={{ color: '#475569' }}>No historical chart data available</p>
                            </div>
                        )}
                    </div>
                )}

                {/* Price History table */}
                {tab === 'history' && (
                    <div className="overflow-auto rounded-2xl" style={{ maxHeight: '70vh', background: 'rgba(8,15,26,0.8)', border: '1px solid rgba(255,255,255,0.06)' }}>
                        {chartLoading ? (
                            <div className="flex flex-col items-center justify-center py-16 gap-3">
                                <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                                <p className="text-xs" style={{ color: '#475569' }}>Loading historical data—¦</p>
                            </div>
                        ) : historyRows.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-16 gap-2">
                                <BarChart3 className="w-10 h-10" style={{ color: 'rgba(255,255,255,0.05)' }} />
                                <p className="text-sm" style={{ color: '#475569' }}>No price history available</p>
                            </div>
                        ) : (
                            <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
                                <thead className="sticky top-0" style={{ background: '#030910', zIndex: 1 }}>
                                    <tr>
                                        {['Date', 'Open', 'High', 'Low', 'Close', 'Volume', 'Change'].map(h => (
                                            <th key={h} className="px-4 py-2.5 text-left font-bold uppercase tracking-widest"
                                                style={{ color: '#475569', fontSize: 10 }}>
                                                {h}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {historyRows.map((row, idx) => {
                                        // NEPSE history endpoint omits openPrice —" use prev row's close for change%
                                        const prevClose = historyRows[idx + 1]?.close || 0;
                                        const chg    = prevClose > 0 ? row.close - prevClose : 0;
                                        const chgPct = prevClose > 0 ? (chg / prevClose) * 100 : 0;
                                        const rc     = chgColor(chg);
                                        return (
                                            <tr key={row.time}
                                                className="border-t transition-colors"
                                                style={{ borderColor: 'rgba(255,255,255,0.03)' }}
                                                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.025)'}
                                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                                <td className="px-4 py-2.5 font-semibold" style={{ color: '#94a3b8' }}>
                                                    {row.time}
                                                </td>
                                                <td className="px-4 py-2.5 tabular-nums" style={{ color: row.open > 0 ? 'white' : '#334155' }}>
                                                    {row.open > 0 ? fmt(row.open) : '—"'}
                                                </td>
                                                <td className="px-4 py-2.5 tabular-nums text-emerald-400">{fmt(row.high)}</td>
                                                <td className="px-4 py-2.5 tabular-nums text-red-400">{fmt(row.low)}</td>
                                                <td className="px-4 py-2.5 tabular-nums font-bold" style={{ color: rc }}>
                                                    {fmt(row.close)}
                                                </td>
                                                <td className="px-4 py-2.5 tabular-nums" style={{ color: '#475569' }}>
                                                    {fmtVol(row.value)}
                                                </td>
                                                <td className="px-4 py-2.5">
                                                    {prevClose > 0 ? (
                                                        <span className="font-bold px-2 py-0.5 rounded text-[11px]"
                                                            style={{
                                                                color: rc,
                                                                background: chg > 0 ? 'rgba(34,197,94,0.08)' : chg < 0 ? 'rgba(239,68,68,0.08)' : 'rgba(100,116,139,0.08)',
                                                            }}>
                                                            {chg >= 0 ? '+' : ''}{fmt(chgPct)}%
                                                        </span>
                                                    ) : (
                                                        <span style={{ color: '#334155' }}>—"</span>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        )}
                    </div>
                )}

                {/* Footer — volume / turnover */}
                <div className="px-5 py-3 mt-4 rounded-2xl flex flex-wrap items-center gap-6"
                    style={{ background: 'rgba(8,15,26,0.8)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    {[
                        { label: 'Volume',   value: fmtVol(stock.volume) },
                        { label: 'Trades',   value: fmtVol(stock.trades) },
                        stock.turnover > 0
                            ? { label: 'Turnover', value: `Rs. ${fmtVol(stock.turnover)}` }
                            : null,
                        chartData.length > 0
                            ? { label: 'History',  value: `${chartData.length} days` }
                            : null,
                    ].filter(Boolean).map(({ label, value }) => (
                        <div key={label}>
                            <p className="text-[10px] font-semibold uppercase tracking-widest"
                                style={{ color: '#475569' }}>{label}</p>
                            <p className="text-sm font-bold text-white">{value}</p>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

// -- NEPSE Index Chart with inline stock chart switcher --
function NepseChartSection({ data, stocks }) {
    const [query,      setQuery]      = useState('');
    const [open,       setOpen]       = useState(false);
    const [picked,     setPicked]     = useState(null);   // selected stock object
    const [stockChart, setStockChart] = useState([]);
    const [chartLoading, setChartLoading] = useState(false);
    const wrapRef = useRef(null);

    useEffect(() => {
        const handler = (e) => {
            if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const results = useMemo(() => {
        const q = query.trim().toUpperCase();
        if (!q || !stocks?.length) return [];
        return stocks
            .filter(s => s.symbol.includes(q) || (s.name || '').toUpperCase().includes(q))
            .slice(0, 8);
    }, [query, stocks]);

    const handlePick = useCallback(async (s) => {
        setQuery('');
        setOpen(false);
        setPicked(s);
        setStockChart([]);
        setChartLoading(true);
        try {
            const res = await api.getNepseChart(s.symbol);
            setStockChart(res.data?.chart_data ?? []);
        } catch {
            setStockChart([]);
        } finally {
            setChartLoading(false);
        }
    }, []);

    const handleBack = useCallback(() => {
        setPicked(null);
        setStockChart([]);
        setQuery('');
    }, []);

    const showStock = picked !== null;

    return (
        <div className="w-full rounded-2xl overflow-hidden border flex flex-col"
            style={{ borderColor: 'rgba(255,255,255,0.08)', background: '#050d1a' }}>

            {/* Header bar */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b shrink-0"
                style={{ borderColor: 'rgba(255,255,255,0.06)' }}>

                {/* Left: title / back */}
                <div className="flex items-center gap-2">
                    {showStock ? (
                        <>
                            <button onClick={handleBack}
                                className="flex items-center gap-1.5 px-2 py-1 rounded-lg transition-colors"
                                style={{ background: 'rgba(255,255,255,0.05)' }}
                                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                                onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}>
                                <ArrowLeft className="w-3.5 h-3.5" style={{ color: '#94a3b8' }} />
                                <span className="text-[10px]" style={{ color: '#94a3b8' }}>NEPSE Index</span>
                            </button>
                            <span className="text-xs font-black text-white">{picked.symbol}</span>
                            {picked.name && (
                                <span className="text-[10px] hidden sm:block truncate max-w-40" style={{ color: '#475569' }}>
                                    {picked.name}
                                </span>
                            )}
                            {picked.ltp > 0 && (
                                <span className="text-xs font-bold tabular-nums" style={{ color: chgColor(picked.change) }}>
                                    {fmt(picked.ltp)}
                                </span>
                            )}
                        </>
                    ) : (
                        <>
                            <BarChart3 className="w-4 h-4 text-blue-400" />
                            <span className="text-xs font-black text-white">NEPSE Index</span>
                            <span className="text-[10px] px-2 py-0.5 rounded font-bold"
                                style={{ background: 'rgba(59,130,246,0.1)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.2)' }}>
                                Historical
                            </span>
                        </>
                    )}
                </div>

                {/* Right: stock search */}
                <div ref={wrapRef} className="relative">
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
                        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }}>
                        <Search className="w-3.5 h-3.5 shrink-0" style={{ color: '#475569' }} />
                        <input
                            value={query}
                            onChange={e => { setQuery(e.target.value); setOpen(true); }}
                            onFocus={() => setOpen(true)}
                            placeholder="Search stock..."
                            className="bg-transparent text-xs text-white placeholder-slate-600 outline-none w-32"
                        />
                        {query && (
                            <button onClick={() => { setQuery(''); setOpen(false); }}>
                                <X className="w-3 h-3" style={{ color: '#475569' }} />
                            </button>
                        )}
                    </div>

                    {open && results.length > 0 && (
                        <div className="absolute right-0 top-full mt-1 w-64 rounded-xl overflow-hidden shadow-2xl z-10"
                            style={{ background: '#0a1628', border: '1px solid rgba(255,255,255,0.1)' }}>
                            {results.map(s => (
                                <button key={s.symbol}
                                    className="w-full flex items-center justify-between px-4 py-2.5 text-left"
                                    style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                    onClick={() => { void handlePick(s); }}>
                                    <div>
                                        <p className="text-xs font-black text-white">{s.symbol}</p>
                                        {s.name && <p className="text-[10px] truncate max-w-37.5" style={{ color: '#475569' }}>{s.name}</p>}
                                    </div>
                                    <span className="text-xs font-bold tabular-nums ml-3 shrink-0"
                                        style={{ color: chgColor(s.change) }}>
                                        {fmt(s.ltp)}
                                    </span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Chart area */}
            <div className="h-150 sm:h-187.5 relative">
                {showStock ? (
                    chartLoading ? (
                        <div className="absolute inset-0 flex items-center justify-center">
                            <div className="w-7 h-7 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
                        </div>
                    ) : (
                        <TradingChart data={stockChart} />
                    )
                ) : (
                    <TradingChart data={data} />
                )}
            </div>
        </div>
    );
}

// ── Error State ───────────────────────────────────────────────────────────────
function ErrorState({ error, onRetry }) {
    const isInstallError = error?.includes('not installed');
    return (
        <div className="rounded-2xl p-10 text-center"
            style={{ background: SURFACE, border: '1px solid rgba(239,68,68,0.2)' }}>
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
                style={{ background: 'rgba(239,68,68,0.08)' }}>
                {isInstallError
                    ? <AlertCircle className="w-7 h-7 text-red-400" />
                    : <WifiOff className="w-7 h-7 text-red-400" />}
            </div>
            <p className="text-base font-bold text-white mb-2">Could not load market data</p>
            <p className="text-sm text-red-400 mb-1">{error}</p>

            {isInstallError && (
                <div className="mt-4 p-4 rounded-xl text-left mx-auto max-w-lg"
                    style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <p className="text-xs font-bold text-white mb-2">Install the NEPSE data library in your backend venv:</p>
                    <code className="text-xs text-blue-400 break-all">
                        pip install git+https://github.com/basic-bgnr/NepseUnofficialApi
                    </code>
                    <p className="text-[11px] mt-2" style={{ color: '#475569' }}>Then restart the backend server.</p>
                </div>
            )}

            <button onClick={onRetry}
                className="mt-5 px-4 py-2 rounded-lg text-sm font-semibold"
                style={{ background: 'rgba(59,130,246,0.1)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.2)' }}>
                Try Again
            </button>
        </div>
    );
}

// â"€â"€ Main LiveMarket Component â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
export default function LiveMarket() {
    const [data,         setData]         = useState(null);
    const [loading,      setLoading]      = useState(true);
    const [refreshing,   setRefreshing]   = useState(false);
    const [error,        setError]        = useState(null);
    const [search,       setSearch]       = useState('');
    const [sort,         setSort]         = useState({ key: 'change_pct', dir: -1 });
    const [selected,     setSelected]     = useState(null);
    const [chartData,    setChartData]    = useState([]);
    const [chartLoading, setChartLoading] = useState(false);
    const [nepseHistory, setNepseHistory] = useState([]);

    const pendingSymbol = useRef(null);




    // â"€â"€ Fetch NEPSE Historical Data once â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
    useEffect(() => {
        api.getNepseHistory()
            .then(res => {
                if (res.data && Array.isArray(res.data)) {
                    setNepseHistory(res.data);
                }
            })
            .catch(err => console.error("Failed to fetch NEPSE history", err));
    }, []);

    // â"€â"€ Fetch all live market data â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
    const fetchData = useCallback(async (isRefresh = false) => {
        if (isRefresh) setRefreshing(true);
        else { setLoading(true); setError(null); }

        try {
            const res = await api.getNepseLive();
            if (res.data?.error) {
                setError(res.data.error);
                setData(null);
            } else {
                setData(res.data);
                setError(null);
            }
        } catch (e) {
            setError(e.response?.data?.detail || e.message || 'Network error');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    // â"€â"€ Fetch chart for selected stock â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
    const fetchChart = useCallback(async (symbol) => {
        setChartLoading(true);
        setChartData([]);
        try {
            const res = await api.getNepseChart(symbol);
            if (res.data?.chart_data?.length) {
                setChartData(res.data.chart_data);
            }
        } catch (e) {
            console.error('Chart fetch error:', e);
        } finally {
            setChartLoading(false);
        }
    }, []);

    // â"€â"€ Select a stock and load its chart â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
    const handleSelect = useCallback((stock) => {

        const fullStock = data?.stocks?.find(s => s.symbol === stock.symbol) || stock;

        setSelected(fullStock);

        fetchChart(fullStock.symbol);

        window.history.pushState({ symbol: fullStock.symbol }, '', '/live/' + fullStock.symbol);

    }, [data?.stocks, fetchChart]);



    const handleClose = useCallback(() => {

        setSelected(null);

        setChartData([]);

        window.history.pushState({}, '', '/live');

    }, []);



    useEffect(() => {

        if (!data?.stocks?.length) return;

        const sym = pendingSymbol.current;

        if (sym) {

            pendingSymbol.current = null;

            const stock = data.stocks.find(s => s.symbol === sym);

            if (stock) { setSelected(stock); fetchChart(stock.symbol); }

        }

    }, [data?.stocks, fetchChart]);



    useEffect(() => {

        const match = window.location.pathname.match(/^\/live\/(.+)$/);

        if (match) pendingSymbol.current = decodeURIComponent(match[1]);

    }, []);



    useEffect(() => {

        const onPop = () => {

            const match = window.location.pathname.match(/^\/live\/(.+)$/);

            if (match) {

                const sym = decodeURIComponent(match[1]);

                const stock = data?.stocks?.find(s => s.symbol === sym);

                if (stock) { setSelected(stock); fetchChart(stock.symbol); }

            } else {

                setSelected(null);

                setChartData([]);

            }

        };

        window.addEventListener('popstate', onPop);

        return () => window.removeEventListener('popstate', onPop);

    }, [data?.stocks, fetchChart]);

    // â"€â"€ Initial load â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
    useEffect(() => {
        const id = setTimeout(() => void fetchData(), 0);
        return () => clearTimeout(id);
    }, [fetchData]);

    useEffect(() => {
        const interval = data?.stale ? 30_000 : 5_000;
        const id = setInterval(() => void fetchData(true), interval);
        return () => clearInterval(id);
    }, [fetchData, data?.stale]);

    const nepseTradingData = useMemo(() => {
        let history = [...nepseHistory];
        
        // If we have live data, we can synthesize today's candle and append it
        if (data?.index) {
            const todayStr = new Date().toISOString().slice(0, 10);
            
            // Generate a rough today's candle from live index value
            // (Using the current value to approximate O/H/L/C since true live OHLC for the index is complex)
            const liveCandle = {
                time: todayStr,
                open: data.index.value - data.index.change, // previous close approximation
                high: data.index.value,
                low: data.index.value,
                close: data.index.value,
                volume: 0,
            };
            
            // If the last candle in history is already today, replace it. Otherwise append.
            if (history.length > 0 && history[history.length - 1].time === todayStr) {
                history[history.length - 1] = {
                    ...history[history.length - 1],
                    close: liveCandle.close,
                    high: Math.max(history[history.length - 1].high, liveCandle.high),
                    low: Math.min(history[history.length - 1].low, liveCandle.low),
                };
            } else if (history.length > 0) {
                // To make the candle look somewhat realistic using intraday data:
                if (data.nepse_chart && Array.isArray(data.nepse_chart) && data.nepse_chart.length > 0) {
                    const vals = data.nepse_chart.map(d => d[1]);
                    liveCandle.open = vals[0];
                    liveCandle.high = Math.max(...vals);
                    liveCandle.low = Math.min(...vals);
                    liveCandle.close = vals[vals.length - 1];
                }
                history.push(liveCandle);
            }
        }
        
        return history;
    }, [nepseHistory, data]);

    // â"€â"€ Loading skeleton â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
        if (loading) {
        const Bone = ({ w = 'w-full', h = 'h-4', extra = '' }) => (
            <div className={`${w} ${h} ${extra} rounded-lg animate-pulse`}
                style={{ background: 'rgba(255,255,255,0.06)' }} />
        );
        return (
            <div className="max-w-7xl mx-auto space-y-4">
                {/* Summary cards skeleton */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {[...Array(4)].map((_, i) => (
                        <div key={i} className="rounded-xl p-4 space-y-3" style={{ background: 'rgba(8,15,26,0.7)', border: '1px solid rgba(255,255,255,0.08)' }}>
                            <div className="flex items-center justify-between">
                                <Bone w="w-20" h="h-3" />
                                <Bone w="w-7" h="h-7" extra="rounded-lg" />
                            </div>
                            <Bone w="w-32" h="h-6" />
                            <Bone w="w-20" h="h-2.5" />
                            <Bone w="w-full" h="h-0.5" />
                        </div>
                    ))}
                </div>

                {/* Chart skeleton */}
                <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(8,15,26,0.7)', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <div className="px-4 py-2.5 border-b flex items-center justify-between" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                        <div className="flex items-center gap-2">
                            <Bone w="w-4" h="h-4" extra="rounded" />
                            <Bone w="w-28" h="h-4" />
                            <Bone w="w-16" h="h-5" extra="rounded-full" />
                        </div>
                        <Bone w="w-36" h="h-7" extra="rounded-lg" />
                    </div>
                    <Bone w="w-full" h="h-64" extra="rounded-none" />
                </div>

                {/* Movers skeleton */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {[...Array(3)].map((_, i) => (
                        <div key={i} className="rounded-xl p-4 space-y-3" style={{ background: 'rgba(8,15,26,0.7)', border: '1px solid rgba(255,255,255,0.08)' }}>
                            <div className="flex items-center justify-between mb-1">
                                <div className="flex items-center gap-2">
                                    <Bone w="w-7" h="h-7" extra="rounded-lg" />
                                    <div className="space-y-1.5">
                                        <Bone w="w-24" h="h-3" />
                                        <Bone w="w-16" h="h-2.5" />
                                    </div>
                                </div>
                                <Bone w="w-14" h="h-6" extra="rounded-lg" />
                            </div>
                            <div className="h-px" style={{ background: 'rgba(255,255,255,0.04)' }} />
                            {[...Array(7)].map((_, j) => (
                                <div key={j} className="flex items-center gap-2">
                                    <Bone w="w-5" h="h-5" extra="rounded-md" />
                                    <div className="flex-1 space-y-1">
                                        <Bone w="w-16" h="h-3" />
                                        <Bone w="w-12" h="h-2.5" />
                                    </div>
                                    <Bone w="w-12" h="h-4" />
                                </div>
                            ))}
                        </div>
                    ))}
                </div>

                {/* Table skeleton */}
                <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(8,15,26,0.7)', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
                        <div className="flex items-center gap-2">
                            <Bone w="w-7" h="h-7" extra="rounded-lg" />
                            <Bone w="w-32" h="h-4" />
                            <Bone w="w-8" h="h-5" extra="rounded-full" />
                        </div>
                        <Bone w="w-48" h="h-8" extra="rounded-xl" />
                    </div>
                    <div className="p-3 space-y-2">
                        {[...Array(10)].map((_, i) => (
                            <div key={i} className="flex items-center gap-3 px-2 py-1.5">
                                <Bone w="w-20" h="h-4" />
                                <Bone w="w-16" h="h-4" />
                                <Bone w="w-12" h="h-4" />
                                <Bone w="w-16" h="h-5" extra="rounded-full" />
                                <Bone w="w-14" h="h-4" />
                                <Bone w="w-14" h="h-4" />
                                <Bone w="w-14" h="h-4" />
                                <Bone w="w-12" h="h-4" />
                                <Bone w="w-12" h="h-4" />
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }
if (error) {
        return (
            <div className="max-w-7xl mx-auto py-8">
                <ErrorState error={error} onRetry={() => fetchData()} />
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto space-y-4">

            {/* Stock detail full page — replaces market list when stock selected */}
            {selected && (
                <StockDetailPanel
                    stock={selected}
                    chartData={chartData}
                    chartLoading={chartLoading}
                    isMarketOpen={data?.market_open ?? false}
                    stocks={data?.stocks ?? []}
                    onSwitch={handleSelect}
                    onClose={handleClose}
                />
            )}

            {/* Market list — hidden when stock is selected */}
            {!selected && (<>

            {/* Market status + NEPSE index */}
                        {/* Volume / turnover / A-D stats */}
            {data?.summary && <SummaryCards summary={data.summary} />}

            {/* NEPSE Index Trading Chart */}
            {nepseTradingData?.length > 0 && (
                <NepseChartSection
                    data={nepseTradingData}
                    stocks={data?.stocks ?? []}
                />
            )}

            {/* Top gainers + losers + turnovers */}
            {(data?.gainers?.length > 0 || data?.losers?.length > 0 || data?.top_turnovers?.length > 0) && (
                <MoversSection
                    gainers={data.gainers ?? []}
                    losers={data.losers  ?? []}
                    turnovers={data.top_turnovers ?? []}
                    onSelect={handleSelect}
                />
            )}

            {/* Full stocks table */}
            {data?.stocks?.length > 0 && (
                <StocksTable
                    stocks={data.stocks}
                    search={search}
                    setSearch={setSearch}
                    sort={sort}
                    setSort={setSort}
                    onSelect={handleSelect}
                />
            )}

            {/* Empty state when no stock data came back */}
            {!data?.stocks?.length && (
                <div className="rounded-2xl p-12 flex flex-col items-center gap-3"
                    style={{ background: SURFACE, border: `1px solid ${BORDER}` }}>
                    <Activity className="w-10 h-10" style={{ color: 'rgba(255,255,255,0.06)' }} />
                    <p className="text-sm font-semibold text-white">No stock data available</p>
                    <p className="text-xs text-center max-w-sm" style={{ color: '#475569' }}>
                        {data?.market_open
                            ? 'Waiting for data from NEPSE…'
                            : 'Market is closed. Price data from the last session may take a moment to load — the data server sometimes needs time to wake up.'}
                    </p>
                    <button
                        onClick={() => fetchData(true)}
                        className="mt-2 px-4 py-2 rounded-lg text-xs font-semibold"
                        style={{ background: 'rgba(59,130,246,0.1)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.2)' }}>
                        Try loading data
                    </button>
                </div>
            )}
            </>)}
        </div>
    );
}
