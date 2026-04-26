import React from 'react';
import { TrendingUp, TrendingDown, DollarSign, BarChart2, Activity } from 'lucide-react';
import { fmt, fmtVol } from '../../utils/formatters';
import LiveMoverRow from './LiveMoverRow';

export default function MoversSection({ gainers, losers, turnovers, volumes, onSelect, predictions = [] }) {
    const panels = [
        { title: 'Top Gainers',  Icon: TrendingUp,   color: '#22c55e', glow: 'rgba(34,197,94,0.1)',   border: 'rgba(34,197,94,0.2)',   list: gainers || [],   isGainer: true,  mode: 'pct'      },
        { title: 'Top Losers',   Icon: TrendingDown, color: '#ef4444', glow: 'rgba(239,68,68,0.1)',   border: 'rgba(239,68,68,0.2)',   list: losers || [],    isGainer: false, mode: 'pct'      },
        { title: 'Top Turnover', Icon: DollarSign,   color: '#f59e0b', glow: 'rgba(245,158,11,0.1)',  border: 'rgba(245,158,11,0.2)',  list: turnovers || [], isGainer: null,  mode: 'turnover' },
        { title: 'Top Volume',   Icon: BarChart2,    color: '#8b5cf6', glow: 'rgba(139,92,246,0.1)',  border: 'rgba(139,92,246,0.2)',  list: volumes || [],   isGainer: null,  mode: 'volume'   },
    ];

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {panels.map(({ title, Icon, color, glow, border, list, isGainer, mode }) => {
                const top = list.slice(0, 7);
                const maxVal = mode === 'turnover'
                    ? Math.max(...top.map(s => s.turnover ?? 0), 1)
                    : mode === 'volume'
                    ? Math.max(...top.map(s => s.volume ?? 0), 1)
                    : Math.max(...top.map(s => Math.abs(s.change_pct ?? 0)), 1);

                return (
                    <div key={title} className="group/card relative rounded-2xl overflow-hidden transition-all duration-300 hover:shadow-[0_8px_30px_rgba(0,0,0,0.3)] hover:-translate-y-0.5"
                        style={{ background: 'var(--color-glass)', border: '1px solid var(--color-glass-border)' }}>
                        <div className="absolute top-0 left-0 right-0 h-[2px] opacity-60 transition-opacity duration-300 group-hover/card:opacity-100" 
                            style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)` }} />
                        
                        <div className="px-3.5 sm:px-5 pt-3.5 sm:pt-5 pb-2 sm:pb-3 flex items-center justify-between border-b" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                            <div className="flex items-center gap-2 sm:gap-3">
                                <div className="p-1.5 sm:p-2 rounded-lg sm:rounded-xl transition-transform duration-300 group-hover/card:scale-110 group-hover/card:shadow-lg" 
                                    style={{ background: glow, border: `1px solid ${border}`, boxShadow: `0 0 10px ${glow}` }}>
                                    <Icon className="w-3 h-3 sm:w-4 sm:h-4 drop-shadow-md" style={{ color }} />
                                </div>
                                <span className="text-[11px] sm:text-sm font-black text-white tracking-wide uppercase">{title}</span>
                             </div>
                        </div>
                        <div className="p-3 space-y-1 relative z-10">
                            {top.length > 0 ? top.map((s, i) => {
                                const pred = (predictions || []).find(p => 
                                    (p.stocks?.symbol?.toUpperCase() === s.symbol.toUpperCase()) || 
                                    (p.symbol?.toUpperCase() === s.symbol.toUpperCase())
                                );
                                return (
                                    <LiveMoverRow 
                                        key={s.symbol} 
                                        stock={s} 
                                        isGainer={isGainer} 
                                        rank={i + 1} 
                                        maxPct={maxVal} 
                                        mode={mode} 
                                        onClick={onSelect}
                                        prediction={pred}
                                    />
                                );
                            }) : (
                                <div className="py-8 flex flex-col items-center justify-center text-center opacity-50">
                                    <Activity className="w-6 h-6 mb-2 text-slate-500" />
                                    <span className="text-xs font-bold text-slate-400">No data available</span>
                                </div>
                            )}
                        </div>
                        <div className="absolute inset-0 pointer-events-none opacity-0 group-hover/card:opacity-100 transition-opacity duration-500"
                            style={{ background: `radial-gradient(circle at 50% 100%, ${glow}, transparent 60%)` }} />
                    </div>
                );
            })}
        </div>
    );
}
