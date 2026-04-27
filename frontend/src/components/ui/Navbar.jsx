import React, { useState, useEffect } from 'react';
import {
    Activity, Radio, TrendingUp, TrendingDown, BarChart2, DollarSign,
    Home, History, Menu, X, SlidersHorizontal,
} from 'lucide-react';
import { useMarketSocket } from '../../hooks/useMarketSocket.jsx';

function fmt(n, d = 2) {
    if (n == null || isNaN(n)) return '—';
    return Number(n).toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d });
}
function fmtVol(n) {
    if (!n) return '—';
    if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e7) return (n / 1e7).toFixed(2) + 'Cr';
    if (n >= 1e5) return (n / 1e5).toFixed(2) + 'L';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return String(Math.round(n));
}

const TABS = [
    { key: 'home',      label: 'Home',        Icon: Home              },
    { key: 'live',      label: 'Live Market', Icon: Radio             },
    { key: 'screener',  label: 'Screener',    Icon: SlidersHorizontal },
    { key: 'sentiment', label: 'Sentiment',   Icon: BarChart2         },
    { key: 'dashboard', label: 'Signal AI',   Icon: Activity          },
    { key: 'history',   label: 'History',     Icon: History           },
];

export default function Navbar({ page, setPage }) {
    const { marketData } = useMarketSocket();
    const [now, setNow]       = useState(new Date());
    const [menuOpen, setMenuOpen] = useState(false);

    useEffect(() => {
        let offset = 0;
        if (marketData?.timestamp) {
            offset = new Date(marketData.timestamp).getTime() - Date.now();
        }
        const id = setInterval(() => setNow(new Date(Date.now() + offset)), 1000);
        setNow(new Date(Date.now() + offset));
        return () => clearInterval(id);
    }, [marketData?.timestamp]);

    const index     = marketData?.index;
    const summary   = marketData?.summary;
    const isOpen    = marketData?.market_open;
    const status    = marketData?.market_status;
    const idxUp     = (index?.change ?? 0) >= 0;
    const idxColor  = idxUp ? '#22c55e' : '#ef4444';
    const isPreOpen = status === 'PRE-OPEN';
    const isHoliday = status === 'HOLIDAY';
    const mktColor  = isOpen ? '#22c55e' : isPreOpen ? '#f59e0b' : isHoliday ? '#a855f7' : '#ef4444';
    const mktBg     = isOpen ? 'rgba(34,197,94,0.08)'  : isPreOpen ? 'rgba(245,158,11,0.08)'  : isHoliday ? 'rgba(168,85,247,0.08)'  : 'rgba(239,68,68,0.08)';
    const mktBorder = isOpen ? 'rgba(34,197,94,0.25)'  : isPreOpen ? 'rgba(245,158,11,0.25)'  : isHoliday ? 'rgba(168,85,247,0.25)'  : 'rgba(239,68,68,0.25)';
    const mktLabel  = status || (isOpen ? 'OPEN' : 'CLOSED');

    const dateStr = now.toLocaleDateString('en-US', {
        timeZone: 'Asia/Kathmandu', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
    });
    const timeStr = now.toLocaleTimeString('en-US', {
        timeZone: 'Asia/Kathmandu', hour: '2-digit', minute: '2-digit', second: '2-digit',
    });

    const handleNav = (key) => { setPage(key); setMenuOpen(false); };

    return (
        <header className="sticky top-0 z-[100] w-full"
            style={{ background: 'rgba(5,10,20,0.95)', borderBottom: '1px solid rgba(255,255,255,0.07)', backdropFilter: 'blur(16px)' }}>

            {/* ── Main bar ──────────────────────────────────────────────────── */}
            <div className="w-full px-3 sm:px-6 lg:px-8 h-14 sm:h-20 lg:h-24 flex justify-between items-center md:grid md:grid-cols-[1fr_auto_1fr] gap-2">

                {/* LEFT: NEPSE stats */}
                <div className="flex items-center min-w-0">
                    <div className="flex flex-col gap-0.5 lg:gap-1 min-w-0">

                        {/* Row 1: NEPSE label + value + change */}
                        <div className="flex items-center gap-1 sm:gap-1.5 md:gap-2">
                            <span className="text-[9px] sm:text-[10px] lg:text-xs font-bold uppercase tracking-wider" style={{ color: '#475569' }}>
                                NEPSE
                            </span>
                            <span className="text-xs sm:text-sm lg:text-base font-black tabular-nums text-white">
                                {index?.value ? fmt(index.value) : '—'}
                            </span>
                            {index?.change != null && (
                                <span className="text-[9px] sm:text-xs lg:text-sm font-bold tabular-nums" style={{ color: idxColor }}>
                                    {idxUp ? '+' : ''}{fmt(index.change)}
                                </span>
                            )}
                            {index?.change_pct != null && (
                                <span className="hidden md:flex items-center gap-0.5 text-[10px] lg:text-xs font-bold tabular-nums px-1.5 py-0.5 rounded"
                                    style={{
                                        color: idxColor,
                                        background: idxUp ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                                        border: `1px solid ${idxUp ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
                                    }}>
                                    {idxUp ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
                                    {idxUp ? '+' : ''}{fmt(index.change_pct)}%
                                </span>
                            )}
                        </div>

                        {/* Row 2: Vol + T/O */}
                        <div className="flex items-center gap-1.5 sm:gap-2 lg:gap-2.5">
                            <div className="flex items-center gap-0.5 sm:gap-1">
                                <BarChart2 className="w-2.5 h-2.5 sm:w-3 sm:h-3 lg:w-3.5 lg:h-3.5" style={{ color: '#8b5cf6' }} />
                                <span className="text-[8px] sm:text-[10px] lg:text-xs font-semibold" style={{ color: '#475569' }}>Vol</span>
                                <span className="text-[9px] sm:text-xs lg:text-sm font-bold text-white tabular-nums">
                                    {summary?.total_volume ? fmtVol(summary.total_volume) : '—'}
                                </span>
                            </div>
                            <div className="w-px h-2.5 sm:h-3 lg:h-4" style={{ background: 'rgba(255,255,255,0.08)' }} />
                            <div className="flex items-center gap-0.5 sm:gap-1">
                                <DollarSign className="w-2.5 h-2.5 sm:w-3 sm:h-3 lg:w-3.5 lg:h-3.5" style={{ color: '#3b82f6' }} />
                                <span className="text-[8px] sm:text-[10px] lg:text-xs font-semibold" style={{ color: '#475569' }}>T/O</span>
                                <span className="text-[9px] sm:text-xs lg:text-sm font-bold text-white tabular-nums">
                                    {summary?.total_turnover ? `Rs.${fmtVol(summary.total_turnover)}` : '—'}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* CENTER: Nav tabs (desktop only) */}
                <nav className="hidden md:flex items-center gap-1 p-1 rounded-2xl shadow-inner"
                    style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    {TABS.map(({ key, label, Icon }) => {
                        const active = page === key;
                        return (
                            <button key={key} onClick={() => handleNav(key)}
                                className="flex items-center gap-1.5 lg:gap-2 px-3 lg:px-4 py-2 lg:py-2.5 rounded-xl text-[10px] lg:text-[11px] font-black uppercase tracking-widest transition-all whitespace-nowrap group relative"
                                style={{
                                    background: active ? 'rgba(59,130,246,0.15)' : 'transparent',
                                    color:      active ? '#60a5fa'                : '#64748b',
                                    border:     active ? '1px solid rgba(59,130,246,0.25)' : '1px solid transparent',
                                }}>
                                <Icon className={`w-3 h-3 lg:w-3.5 lg:h-3.5 transition-transform duration-300 ${active ? 'scale-110' : 'group-hover:scale-110'}`} />
                                {label}
                                {key === 'live' && (
                                    <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: mktColor }} />
                                )}
                                {active && (
                                    <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-blue-500 shadow-[0_0_10px_#3b82f6]" />
                                )}
                            </button>
                        );
                    })}
                </nav>

                {/* RIGHT: Date / Time / Status + hamburger */}
                <div className="flex items-center justify-end gap-1.5 sm:gap-2">

                    {/* Date + Time + Status block */}
                    <div className="flex flex-col items-end gap-0.5 lg:gap-1 px-2 sm:px-3 py-1 sm:py-2 lg:py-2.5 rounded-lg sm:rounded-xl lg:rounded-2xl"
                        style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                        {/* Date */}
                        <span className="text-[9px] sm:text-xs lg:text-sm font-black uppercase tracking-wide leading-none text-white">
                            {dateStr}
                        </span>
                        {/* Time + Status */}
                        <div className="flex items-center gap-1 sm:gap-2">
                            <span className="text-[9px] sm:text-xs lg:text-sm font-black tabular-nums text-white/90">
                                {timeStr}
                            </span>
                            <div className="flex items-center gap-1 px-1.5 py-0.5 rounded transition-all duration-500"
                                style={{
                                    background: mktBg,
                                    border: `1px solid ${mktBorder}`,
                                    boxShadow: isOpen ? '0 0 12px rgba(34,197,94,0.1)' : 'none'
                                }}>
                                <span className="text-[8px] sm:text-[10px] lg:text-xs font-black tracking-wider uppercase" style={{ color: mktColor }}>
                                    <span className="sm:hidden">{isOpen ? 'OPEN' : isPreOpen ? 'PRE' : 'CLSD'}</span>
                                    <span className="hidden sm:inline">{mktLabel}</span>
                                </span>
                                <span className="w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full animate-pulse"
                                    style={{ background: mktColor, boxShadow: `0 0 6px ${mktColor}` }} />
                            </div>
                        </div>
                    </div>

                    {/* Hamburger (mobile only) */}
                    <button className="md:hidden p-1.5 sm:p-2 rounded-lg transition-colors"
                        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
                        onClick={() => setMenuOpen(v => !v)}>
                        {menuOpen
                            ? <X className="w-4 h-4 text-white" />
                            : <Menu className="w-4 h-4" style={{ color: '#94a3b8' }} />}
                    </button>
                </div>
            </div>

            {/* ── Mobile dropdown nav ───────────────────────────────────────── */}
            {menuOpen && (
                <div className="md:hidden border-t px-4 py-3 space-y-1"
                    style={{ borderColor: 'rgba(255,255,255,0.07)', background: 'rgba(5,10,20,0.98)' }}>
                    {TABS.map(({ key, label, Icon }) => {
                        const active = page === key;
                        return (
                            <button key={key} onClick={() => handleNav(key)}
                                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all text-left"
                                style={{
                                    background: active ? 'rgba(59,130,246,0.15)'          : 'rgba(255,255,255,0.02)',
                                    color:      active ? '#60a5fa'                         : '#64748b',
                                    border:     active ? '1px solid rgba(59,130,246,0.3)' : '1px solid rgba(255,255,255,0.04)',
                                }}>
                                <Icon className="w-4 h-4" />
                                {label}
                                {key === 'live' && (
                                    <span className="w-2 h-2 rounded-full animate-pulse ml-auto" style={{ background: mktColor }} />
                                )}
                            </button>
                        );
                    })}
                </div>
            )}
        </header>
    );
}
