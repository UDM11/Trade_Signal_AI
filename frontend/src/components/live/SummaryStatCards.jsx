import React from 'react';
import { DollarSign, BarChart2, Zap } from 'lucide-react';
import { fmtVol } from '../../utils/formatters';

export default function SummaryStatCards({ summary }) {
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
        <>
            {cards.map(({ label, value, sub, Icon, color, glow, border }) => (
                <div key={label}
                    className="relative rounded-xl overflow-hidden transition-all hover:-translate-y-0.5"
                    style={{ background: 'var(--color-glass)', border: '1px solid var(--color-glass-border)', boxShadow: '0 4px 20px rgba(0,0,0,0.15)' }}>
                    <div className="absolute top-0 left-0 right-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${color}60, transparent)` }} />
                    <div className="p-2.5 sm:p-4">
                        <div className="flex items-center justify-between mb-1.5 sm:mb-3">
                            <span className="text-[8px] sm:text-[10px] font-bold uppercase tracking-[0.1em] text-text-muted">{label}</span>
                            <div className="p-1 sm:p-1.5 rounded-lg" style={{ background: glow, border: `1px solid ${border}` }}>
                                <Icon className="w-2.5 h-2.5 sm:w-3 sm:h-3" style={{ color }} />
                            </div>
                        </div>
                        <p className="text-base sm:text-xl font-black text-white tabular-nums leading-none mb-1">{value}</p>
                        <p className="text-[8px] sm:text-[10px] font-medium text-text-muted/60">{sub}</p>
                        <div className="mt-2 sm:mt-3 h-0.5 rounded-full overflow-hidden bg-white/5">
                            <div className="h-full rounded-full" style={{ width: '100%', background: `linear-gradient(90deg, ${color}80, ${color}20)` }} />
                        </div>
                    </div>
                </div>
            ))}
        </>
    );
}
