import React, { useState, useEffect, useCallback } from 'react';
import { Activity, Radio, TrendingUp, TrendingDown, BarChart2, DollarSign, Clock, Wifi, WifiOff, Home, History } from 'lucide-react';
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

export default function Navbar({ page, setPage }) {
    const [marketData, setMarketData] = useState(null);
    const [now, setNow]               = useState(new Date());

    // ── Fetch live NEPSE data every 10s ──────────────────────────────────────
    const fetchMarket = useCallback(async () => {
        try {
            const res = await api.getNepseLive();
            if (!res.data?.error) setMarketData(res.data);
        } catch { /* silent — navbar degrades gracefully */ }
    }, []);

    useEffect(() => {
        fetchMarket();
        const id = setInterval(fetchMarket, 5_000);
        return () => clearInterval(id);
    }, [fetchMarket]);

    // ── Live clock synced to NPT (server timestamp offset) ───────────────────
    useEffect(() => {
        let offset = 0;
        if (marketData?.timestamp) {
            offset = new Date(marketData.timestamp).getTime() - Date.now();
        }
        const id = setInterval(() => setNow(new Date(Date.now() + offset)), 1000);
        setNow(new Date(Date.now() + offset));
        return () => clearInterval(id);
    }, [marketData?.timestamp]);

    const index      = marketData?.index;
    const summary    = marketData?.summary;
    const isOpen     = marketData?.market_open;
    const status     = marketData?.market_status;
    const idxUp      = (index?.change ?? 0) >= 0;
    const idxColor   = idxUp ? '#22c55e' : '#ef4444';

    // market status theme
    const isPreOpen  = status === 'PRE-OPEN';
    const mktColor   = isOpen ? '#22c55e' : isPreOpen ? '#f59e0b' : '#ef4444';
    const mktBg      = isOpen ? 'rgba(34,197,94,0.08)'   : isPreOpen ? 'rgba(245,158,11,0.08)'  : 'rgba(239,68,68,0.08)';
    const mktBorder  = isOpen ? 'rgba(34,197,94,0.25)'   : isPreOpen ? 'rgba(245,158,11,0.25)'  : 'rgba(239,68,68,0.25)';
    const mktLabel   = status || (isOpen ? 'OPEN' : 'CLOSED');

    const dateStr = now.toLocaleDateString('en-US', {
        timeZone: 'Asia/Kathmandu', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
    });
    const timeStr = now.toLocaleTimeString('en-US', {
        timeZone: 'Asia/Kathmandu', hour: '2-digit', minute: '2-digit', second: '2-digit',
    });

    const TABS = [
        { key: 'home',      label: 'Home',        Icon: Home    },
        { key: 'live',      label: 'Live Market', Icon: Radio   },
        { key: 'dashboard', label: 'Signal AI',   Icon: Activity },
        { key: 'history',   label: 'History',     Icon: History },
    ];

    return (
        <header
            className="sticky top-0 z-40 w-full"
            style={{
                background: 'rgba(5, 10, 20, 0.92)',
                borderBottom: '1px solid rgba(255,255,255,0.07)',
                backdropFilter: 'blur(16px)',
            }}
        >
            <div className="max-w-7xl mx-auto px-5 sm:px-8 h-28 flex items-center justify-between gap-6">

                {/* ── LEFT: Logo + NEPSE stats ─────────────────────────────── */}
                <div className="flex items-center gap-3 min-w-0">

                    {/* Logo */}
                    <div className="flex items-center gap-2.5 shrink-0">
                        <div className="p-2 rounded-xl" style={{ background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.25)' }}>
                            <Activity className="w-5 h-5 text-blue-400" />
                        </div>
                        <span className="text-base font-black tracking-tight text-white hidden sm:block">
                            Trade Signal <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-400">AI</span>
                        </span>
                    </div>

                    {/* Divider */}
                    <div className="hidden md:block w-px h-10 rounded-full" style={{ background: 'rgba(255,255,255,0.1)' }} />

                    {/* NEPSE Index */}
                    <div className="hidden md:flex flex-col gap-1.5">
                        {/* Row 1: NEPSE index value + point change + % change */}
                        {index?.value ? (
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold" style={{ color: '#475569' }}>NEPSE</span>
                                <span className="text-base font-black tabular-nums text-white">{fmt(index.value)}</span>
                                <span className="text-xs font-bold tabular-nums" style={{ color: idxColor }}>
                                    {idxUp ? '+' : ''}{fmt(index.change)} pts
                                </span>
                                <span className="flex items-center gap-1 text-xs font-bold tabular-nums px-2 py-1 rounded-lg"
                                    style={{
                                        color: idxColor,
                                        background: idxUp ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                                        border: `1px solid ${idxUp ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
                                    }}>
                                    {idxUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                                    {idxUp ? '+' : ''}{fmt(index.change_pct)}%
                                </span>
                            </div>
                        ) : (
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold" style={{ color: '#475569' }}>NEPSE</span>
                                <span className="text-base font-black" style={{ color: '#334155' }}>—</span>
                            </div>
                        )}

                        {/* Row 2: Volume + Turnover below NEPSE */}
                        <div className="flex items-center gap-3">
                            <div className="flex items-center gap-1.5">
                                <BarChart2 className="w-3.5 h-3.5" style={{ color: '#8b5cf6' }} />
                                <span className="text-xs font-semibold" style={{ color: '#475569' }}>Vol</span>
                                <span className="text-sm font-bold text-white tabular-nums">
                                    {summary?.total_volume ? fmtVol(summary.total_volume) : '—'}
                                </span>
                            </div>
                            <div className="w-px h-3.5 rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }} />
                            <div className="flex items-center gap-1.5">
                                <DollarSign className="w-3.5 h-3.5" style={{ color: '#3b82f6' }} />
                                <span className="text-xs font-semibold" style={{ color: '#475569' }}>T/O</span>
                                <span className="text-sm font-bold text-white tabular-nums">
                                    {summary?.total_turnover ? `Rs.${fmtVol(summary.total_turnover)}` : '—'}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ── CENTER: Nav tabs ─────────────────────────────────────── */}
                <nav className="flex items-center gap-1 p-1 rounded-xl shrink-0"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                    {TABS.map(({ key, label, Icon }) => {
                        const active = page === key;
                        return (
                            <button
                                key={key}
                                onClick={() => setPage(key)}
                                className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold transition-all"
                                style={{
                                    background: active ? 'rgba(59,130,246,0.2)'              : 'transparent',
                                    color:      active ? '#60a5fa'                            : '#475569',
                                    border:     active ? '1px solid rgba(59,130,246,0.35)'   : '1px solid transparent',
                                }}>
                                <Icon className="w-4 h-4" />
                                {label}
                                {key === 'live' && (
                                    <span className="w-2 h-2 rounded-full animate-pulse"
                                        style={{ background: mktColor }} />
                                )}
                            </button>
                        );
                    })}
                </nav>

                {/* ── RIGHT: Date & Time + Market Status (NPT) ────────────── */}
                <div className="flex flex-col items-end gap-1 shrink-0">
                    {/* Clock box */}
                    <div className="hidden sm:flex flex-col items-end px-4 py-2 rounded-xl"
                        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: '#475569' }}>
                            {dateStr}
                        </span>
                        <span className="flex items-center gap-1.5 text-sm font-black tabular-nums" style={{ color: '#94a3b8' }}>
                            <Clock className="w-3 h-3 shrink-0" style={{ color: '#475569' }} />
                            {timeStr}
                        </span>
                    </div>
                    {/* xs: compact time only */}
                    <div className="flex sm:hidden items-center gap-1.5 px-3 py-2 rounded-lg"
                        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <Clock className="w-3.5 h-3.5" style={{ color: '#475569' }} />
                        <span className="text-xs font-bold tabular-nums" style={{ color: '#94a3b8' }}>{timeStr}</span>
                    </div>
                    {/* Market status — outside below the clock box */}
                    <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg"
                        style={{ background: mktBg, border: `1px solid ${mktBorder}` }}>
                        {(isOpen || isPreOpen)
                            ? <Wifi className="w-2.5 h-2.5" style={{ color: mktColor }} />
                            : <WifiOff className="w-2.5 h-2.5" style={{ color: mktColor }} />}
                        <span className="text-[9px] font-black tracking-widest uppercase" style={{ color: mktColor }}>
                            MARKET {mktLabel}
                        </span>
                        {(isOpen || isPreOpen) && (
                            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: mktColor }} />
                        )}
                    </div>
                </div>

            </div>
        </header>
    );
}
