import React from 'react';
import { TrendingUp, TrendingDown, Activity } from 'lucide-react';

export default function MarketBreadth({ summary }) {
    const adv   = summary?.advancing ?? 0;
    const dec   = summary?.declining ?? 0;
    const unc   = summary?.unchanged ?? 0;
    const total = adv + dec + unc || 1;

    const advPct = Math.round((adv / total) * 100);
    const decPct = Math.round((dec / total) * 100);
    const uncPct = 100 - advPct - decPct;

    const R = 28, C = 2 * Math.PI * R;
    const advArc = (adv / total) * C;
    const uncArc = (unc / total) * C;
    const decArc = (dec / total) * C;

    return (
        <div className="relative rounded-xl overflow-hidden transition-all hover:-translate-y-0.5"
            style={{ background: 'var(--color-glass)', border: '1px solid var(--color-glass-border)', boxShadow: '0 4px 20px rgba(0,0,0,0.15)' }}>
            <div className="absolute top-0 left-0 right-0 h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(100,116,139,0.4), transparent)' }} />

            <div className="p-4">
                <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-text-muted">Market Breadth</span>
                    <span className="text-[10px] font-bold tabular-nums text-text-muted">{total} stocks</span>
                </div>

                <div className="flex items-center gap-3">
                    <div className="shrink-0 relative" style={{ width: 64, height: 64 }}>
                        <svg width="64" height="64" style={{ transform: 'rotate(-90deg)' }}>
                            <circle cx="32" cy="32" r={R} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="6" />
                            <circle cx="32" cy="32" r={R} fill="none" stroke="var(--color-bullish)" strokeWidth="6"
                                strokeDasharray={`${advArc} ${C}`} strokeDashoffset="0" strokeLinecap="butt" />
                            <circle cx="32" cy="32" r={R} fill="none" stroke="var(--color-text-muted)" strokeWidth="6"
                                strokeDasharray={`${uncArc} ${C}`} strokeDashoffset={-advArc} strokeLinecap="butt" />
                            <circle cx="32" cy="32" r={R} fill="none" stroke="var(--color-bearish)" strokeWidth="6"
                                strokeDasharray={`${decArc} ${C}`} strokeDashoffset={-(advArc + uncArc)} strokeLinecap="butt" />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <span className="text-[10px] font-black" style={{ color: adv >= dec ? 'var(--color-bullish)' : 'var(--color-bearish)' }}>
                                {adv >= dec ? advPct : decPct}%
                            </span>
                        </div>
                    </div>

                    <div className="flex flex-col gap-1.5 flex-1">
                        <div className="flex items-center justify-between px-2 py-1 rounded-lg bg-bullish/10 border border-bullish/20">
                            <span className="flex items-center gap-1 text-[10px] font-bold text-bullish"><TrendingUp className="w-3 h-3" /> Up</span>
                            <span className="text-[11px] font-black text-bullish tabular-nums">{adv} <span className="font-medium opacity-70">{advPct}%</span></span>
                        </div>
                        <div className="flex items-center justify-between px-2 py-1 rounded-lg bg-slate-500/10 border border-slate-500/20">
                            <span className="flex items-center gap-1 text-[10px] font-bold text-text-muted"><Activity className="w-3 h-3" /> Flat</span>
                            <span className="text-[11px] font-black text-text-muted tabular-nums">{unc} <span className="font-medium opacity-70">{uncPct}%</span></span>
                        </div>
                        <div className="flex items-center justify-between px-2 py-1 rounded-lg bg-bearish/10 border border-bearish/20">
                            <span className="flex items-center gap-1 text-[10px] font-bold text-bearish"><TrendingDown className="w-3 h-3" /> Down</span>
                            <span className="text-[11px] font-black text-bearish tabular-nums">{dec} <span className="font-medium opacity-70">{decPct}%</span></span>
                        </div>
                    </div>
                </div>

                <div className="mt-3 h-1 rounded-full overflow-hidden flex gap-px">
                    <div style={{ width: `${advPct}%`, background: 'var(--color-bullish)', borderRadius: '4px 0 0 4px' }} />
                    <div style={{ width: `${uncPct}%`, background: 'var(--color-text-muted)' }} />
                    <div style={{ width: `${decPct}%`, background: 'var(--color-bearish)', borderRadius: '0 4px 4px 0' }} />
                </div>
            </div>
        </div>
    );
}
