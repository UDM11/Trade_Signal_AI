import React, { useState, useEffect, useCallback } from 'react';
import {
    Activity, Radio, TrendingUp, TrendingDown, BarChart2, DollarSign,
    Clock, Wifi, WifiOff, Home, History, Menu, X,
} from 'lucide-react';
import { api } from '../../api';

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
    { key: 'home',      label: 'Home',        Icon: Home     },
    { key: 'live',      label: 'Live Market', Icon: Radio    },
    { key: 'dashboard', label: 'Signal AI',   Icon: Activity },
    { key: 'history',   label: 'History',     Icon: History  },
];

export default function Navbar({ page, setPage }) {
    const [marketData, setMarketData] = useState(null);
    const [now, setNow]               = useState(new Date());
    const [menuOpen, setMenuOpen]     = useState(false);

    const fetchMarket = useCallback(async () => {
        try {
            const res = await api.getNepseLive();
            if (!res.data?.error) setMarketData(res.data);
        } catch { /* silent */ }
    }, []);

    useEffect(() => {
        fetchMarket();
        const id = setInterval(fetchMarket, 5_000);
        return () => clearInterval(id);
    }, [fetchMarket]);

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
    const mktColor  = isOpen ? '#22c55e' : isPreOpen ? '#f59e0b' : '#ef4444';
    const mktBg     = isOpen ? 'rgba(34,197,94,0.08)'  : isPreOpen ? 'rgba(245,158,11,0.08)'  : 'rgba(239,68,68,0.08)';
    const mktBorder = isOpen ? 'rgba(34,197,94,0.25)'  : isPreOpen ? 'rgba(245,158,11,0.25)'  : 'rgba(239,68,68,0.25)';
    const mktLabel  = status || (isOpen ? 'OPEN' : 'CLOSED');

    const dateStr = now.toLocaleDateString('en-US', {
        timeZone: 'Asia/Kathmandu', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
    });
    const timeStr = now.toLocaleTimeString('en-US', {
        timeZone: 'Asia/Kathmandu', hour: '2-digit', minute: '2-digit', second: '2-digit',
    });

    const handleNav = (key) => { setPage(key); setMenuOpen(false); };

    return (
        <header className="sticky top-0 z-40 w-full"
            style={{ background: 'rgba(5,10,20,0.95)', borderBottom: '1px solid rgba(255,255,255,0.07)', backdropFilter: 'blur(16px)' }}>

            {/* ── Main bar ──────────────────────────────────────────────────── */}
            <div className="w-full px-4 sm:px-8 h-20 grid grid-cols-[1fr_auto_1fr] items-center gap-3">

                {/* LEFT: Logo + NEPSE stats */}
                <div className="flex items-center gap-2 min-w-0">
                    {/* Logo */}
                    <div className="flex items-center gap-2 shrink-0">
                        <div className="p-1.5 rounded-lg" style={{ background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.25)' }}>
                            <Activity className="w-4 h-4 text-blue-400" />
                        </div>
                        <span className="text-sm font-black tracking-tight text-white hidden sm:block">
                            Trade Signal <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-400">AI</span>
                        </span>
                    </div>

                    {/* Divider */}
                    <div className="hidden lg:block w-px h-8 mx-1" style={{ background: 'rgba(255,255,255,0.1)' }} />

                    {/* NEPSE index block */}
                    <div className="hidden lg:flex flex-col gap-0.5 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#475569' }}>NEPSE</span>
                            <span className="text-sm font-black tabular-nums text-white">
                                {index?.value ? fmt(index.value) : '—'}
                            </span>
                            {index?.change != null && (
                                <span className="text-xs font-bold tabular-nums" style={{ color: idxColor }}>
                                    {idxUp ? '+' : ''}{fmt(index.change)} pts
                                </span>
                            )}
                            {index?.change_pct != null && (
                                <span className="flex items-center gap-0.5 text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded"
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
                        <div className="flex items-center gap-2">
                            <div className="flex items-center gap-1">
                                <BarChart2 className="w-3 h-3" style={{ color: '#8b5cf6' }} />
                                <span className="text-[10px] font-semibold" style={{ color: '#475569' }}>Vol</span>
                                <span className="text-xs font-bold text-white tabular-nums">
                                    {summary?.total_volume ? fmtVol(summary.total_volume) : '—'}
                                </span>
                            </div>
                            <div className="w-px h-3" style={{ background: 'rgba(255,255,255,0.08)' }} />
                            <div className="flex items-center gap-1">
                                <DollarSign className="w-3 h-3" style={{ color: '#3b82f6' }} />
                                <span className="text-[10px] font-semibold" style={{ color: '#475569' }}>T/O</span>
                                <span className="text-xs font-bold text-white tabular-nums">
                                    {summary?.total_turnover ? `Rs.${fmtVol(summary.total_turnover)}` : '—'}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* CENTER: Nav tabs — always truly centered */}
                <nav className="hidden md:flex items-center gap-0.5 p-1 rounded-xl"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                    {TABS.map(({ key, label, Icon }) => {
                        const active = page === key;
                        return (
                            <button key={key} onClick={() => handleNav(key)}
                                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap"
                                style={{
                                    background: active ? 'rgba(59,130,246,0.2)'            : 'transparent',
                                    color:      active ? '#60a5fa'                          : '#475569',
                                    border:     active ? '1px solid rgba(59,130,246,0.35)' : '1px solid transparent',
                                }}>
                                <Icon className="w-3.5 h-3.5" />
                                {label}
                                {key === 'live' && (
                                    <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: mktColor }} />
                                )}
                            </button>
                        );
                    })}
                </nav>

                {/* RIGHT: Date / Time / Market status + mobile hamburger */}
                <div className="flex items-center justify-end gap-2">
                    {/* Date + time + market (desktop) */}
                    <div className="hidden sm:flex flex-col items-end gap-0.5 px-3 py-1.5 rounded-xl"
                        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <span className="text-[10px] font-semibold" style={{ color: '#475569' }}>{dateStr}</span>
                        <span className="flex items-center gap-1 text-xs font-black tabular-nums" style={{ color: '#94a3b8' }}>
                            <Clock className="w-3 h-3 shrink-0" style={{ color: '#475569' }} />
                            {timeStr}
                        </span>
                        <div className="flex items-center gap-1 mt-0.5 px-2 py-0.5 rounded-md"
                            style={{ background: mktBg, border: `1px solid ${mktBorder}` }}>
                            {(isOpen || isPreOpen)
                                ? <Wifi className="w-2.5 h-2.5" style={{ color: mktColor }} />
                                : <WifiOff className="w-2.5 h-2.5" style={{ color: mktColor }} />}
                            <span className="text-[9px] font-black tracking-widest uppercase ml-1" style={{ color: mktColor }}>
                                MARKET {mktLabel}
                            </span>
                            {(isOpen || isPreOpen) && (
                                <span className="w-1.5 h-1.5 rounded-full animate-pulse ml-1" style={{ background: mktColor }} />
                            )}
                        </div>
                    </div>

                    {/* Mobile: compact market badge */}
                    <div className="flex sm:hidden items-center gap-1 px-2 py-1 rounded-lg"
                        style={{ background: mktBg, border: `1px solid ${mktBorder}` }}>
                        {(isOpen || isPreOpen)
                            ? <Wifi className="w-3 h-3" style={{ color: mktColor }} />
                            : <WifiOff className="w-3 h-3" style={{ color: mktColor }} />}
                        <span className="text-[9px] font-black tracking-widest uppercase" style={{ color: mktColor }}>
                            {mktLabel}
                        </span>
                    </div>

                    {/* Hamburger (mobile only) */}
                    <button className="md:hidden p-2 rounded-lg transition-colors"
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
                <div className="md:hidden border-t px-4 sm:px-8 py-3 space-y-1"
                    style={{ borderColor: 'rgba(255,255,255,0.07)', background: 'rgba(5,10,20,0.98)' }}>
                    {TABS.map(({ key, label, Icon }) => {
                        const active = page === key;
                        return (
                            <button key={key} onClick={() => handleNav(key)}
                                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all text-left"
                                style={{
                                    background: active ? 'rgba(59,130,246,0.15)'           : 'rgba(255,255,255,0.02)',
                                    color:      active ? '#60a5fa'                          : '#64748b',
                                    border:     active ? '1px solid rgba(59,130,246,0.3)'  : '1px solid rgba(255,255,255,0.04)',
                                }}>
                                <Icon className="w-4 h-4" />
                                {label}
                                {key === 'live' && (
                                    <span className="w-2 h-2 rounded-full animate-pulse ml-auto" style={{ background: mktColor }} />
                                )}
                            </button>
                        );
                    })}

                    {/* Mobile NEPSE stats */}
                    <div className="mt-2 px-4 py-3 rounded-xl space-y-2"
                        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#475569' }}>NEPSE</span>
                            <span className="text-sm font-black tabular-nums text-white">
                                {index?.value ? fmt(index.value) : '—'}
                            </span>
                            {index?.change != null && (
                                <span className="text-xs font-bold tabular-nums" style={{ color: idxColor }}>
                                    {idxUp ? '+' : ''}{fmt(index.change)} pts · {idxUp ? '+' : ''}{fmt(index.change_pct)}%
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-4">
                            <div className="flex items-center gap-1">
                                <BarChart2 className="w-3 h-3" style={{ color: '#8b5cf6' }} />
                                <span className="text-[10px]" style={{ color: '#475569' }}>Vol</span>
                                <span className="text-xs font-bold text-white tabular-nums">
                                    {summary?.total_volume ? fmtVol(summary.total_volume) : '—'}
                                </span>
                            </div>
                            <div className="flex items-center gap-1">
                                <DollarSign className="w-3 h-3" style={{ color: '#3b82f6' }} />
                                <span className="text-[10px]" style={{ color: '#475569' }}>T/O</span>
                                <span className="text-xs font-bold text-white tabular-nums">
                                    {summary?.total_turnover ? `Rs.${fmtVol(summary.total_turnover)}` : '—'}
                                </span>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 text-[10px]" style={{ color: '#475569' }}>
                            <Clock className="w-3 h-3" />
                            <span>{dateStr} · {timeStr}</span>
                        </div>
                    </div>
                </div>
            )}
        </header>
    );
}
