import React from 'react';
import { DollarSign, BarChart2, Zap, ArrowUp, ArrowDown, Minus } from 'lucide-react';
import { fmtVol, fmt } from '../../utils/formatters';

export default function MarketStatsBar({ summary }) {
    if (!summary) return null;

    const total = (summary.advancing || 0) + (summary.declining || 0) + (summary.unchanged || 0);
    const upPct = total ? Math.round((summary.advancing / total) * 100) : 0;
    const downPct = total ? Math.round((summary.declining / total) * 100) : 0;
    const flatPct = total ? Math.round((summary.unchanged / total) * 100) : 0;

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Turnover */}
            <StatCard 
                title="Total Turnover" 
                value={`Rs. ${fmtVol(summary.total_turnover)}`}
                subtitle="Daily traded value"
                icon={<DollarSign className="w-4 h-4 text-blue-400" />}
                color="blue"
            />

            {/* Volume */}
            <StatCard 
                title="Total Volume" 
                value={fmtVol(summary.total_volume)}
                subtitle="Shares traded"
                icon={<BarChart2 className="w-4 h-4 text-purple-400" />}
                color="purple"
            />

            {/* Trades */}
            <StatCard 
                title="Total Trades" 
                value={fmtVol(summary.total_trades)}
                subtitle="Transactions executed"
                icon={<Zap className="w-4 h-4 text-amber-400" />}
                color="amber"
            />

            {/* Market Breadth */}
            <div className="rounded-2xl p-5 flex flex-col justify-between transition-all duration-300 hover:shadow-2xl hover:-translate-y-0.5"
                 style={{ background: 'var(--color-glass)', border: '1px solid var(--color-glass-border)' }}>
                <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-black text-text-muted uppercase tracking-widest">Market Breadth</span>
                    <span className="text-[10px] font-bold text-text-muted">{total} stocks</span>
                </div>
                
                <div className="flex items-center gap-4">
                    {/* Donut Chart (Simplified SVG) */}
                    <div className="relative w-16 h-16 shrink-0">
                        <svg className="w-full h-full transform -rotate-90">
                            <circle
                                cx="32" cy="32" r="28"
                                stroke="currentColor"
                                strokeWidth="6"
                                fill="transparent"
                                className="text-white/5"
                            />
                            <circle
                                cx="32" cy="32" r="28"
                                stroke="currentColor"
                                strokeWidth="6"
                                fill="transparent"
                                strokeDasharray={176}
                                strokeDashoffset={176 - (176 * downPct) / 100}
                                className="text-bearish"
                            />
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-xs font-black text-white">{downPct}%</span>
                        </div>
                    </div>

                    {/* Stats List */}
                    <div className="flex-1 space-y-1.5">
                        <BreadthItem 
                            label="Up" 
                            count={summary.advancing} 
                            pct={upPct} 
                            color="text-bullish" 
                            bg="bg-bullish/10"
                            icon={<ArrowUp className="w-2.5 h-2.5" />}
                        />
                        <BreadthItem 
                            label="Flat" 
                            count={summary.unchanged} 
                            pct={flatPct} 
                            color="text-text-muted" 
                            bg="bg-white/5"
                            icon={<Minus className="w-2.5 h-2.5" />}
                        />
                        <BreadthItem 
                            label="Down" 
                            count={summary.declining} 
                            pct={downPct} 
                            color="text-bearish" 
                            bg="bg-bearish/10"
                            icon={<ArrowDown className="w-2.5 h-2.5" />}
                        />
                    </div>
                </div>

                {/* Progress Bar */}
                <div className="mt-4 flex h-1.5 w-full rounded-full overflow-hidden bg-white/5">
                    <div style={{ width: `${upPct}%` }} className="bg-bullish shadow-[0_0_10px_rgba(34,197,94,0.4)]" />
                    <div style={{ width: `${flatPct}%` }} className="bg-text-muted" />
                    <div style={{ width: `${downPct}%` }} className="bg-bearish shadow-[0_0_10px_rgba(239,68,68,0.4)]" />
                </div>
            </div>
        </div>
    );
}

function StatCard({ title, value, subtitle, icon, color }) {
    const glowColor = color === 'blue' ? 'rgba(59, 130, 246, 0.1)' : 
                      color === 'purple' ? 'rgba(168, 85, 247, 0.1)' : 
                      'rgba(245, 158, 11, 0.1)';
    const borderColor = color === 'blue' ? 'rgba(59, 130, 246, 0.2)' : 
                        color === 'purple' ? 'rgba(168, 85, 247, 0.2)' : 
                        'rgba(245, 158, 11, 0.2)';
    const accentLineColor = color === 'blue' ? '#3b82f6' : color === 'purple' ? '#8b5cf6' : '#f59e0b';

    return (
        <div className="group relative rounded-2xl p-5 overflow-hidden transition-all duration-300 hover:shadow-[0_8px_30px_rgba(0,0,0,0.3)] hover:-translate-y-0.5"
             style={{ background: 'var(--color-glass)', border: '1px solid var(--color-glass-border)' }}>
            
            {/* Top gradient accent line */}
            <div className="absolute top-0 left-0 right-0 h-[2px] opacity-60 transition-opacity duration-300 group-hover:opacity-100" 
                 style={{ background: `linear-gradient(90deg, transparent, ${accentLineColor}, transparent)` }} />

            <div className="flex justify-between items-start mb-4 relative z-10">
                <span className="text-[10px] font-black text-text-muted uppercase tracking-widest">{title}</span>
                <div className="p-2 rounded-xl transition-transform duration-300 group-hover:scale-110 group-hover:shadow-lg"
                     style={{ background: glowColor, border: `1px solid ${borderColor}`, boxShadow: `0 0 10px ${glowColor}` }}>
                    {icon}
                </div>
            </div>
            
            <div className="space-y-1 relative z-10">
                <div className="text-2xl font-black text-white tracking-tight">{value}</div>
                <div className="text-[10px] font-bold text-text-muted uppercase tracking-wider">{subtitle}</div>
            </div>

            {/* Radial background glow on hover */}
            <div className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                 style={{ background: `radial-gradient(circle at 50% 100%, ${glowColor}, transparent 60%)` }} />
        </div>
    );
}

function BreadthItem({ label, count, pct, color, bg, icon }) {
    return (
        <div className={`flex items-center justify-between px-3 py-1.5 rounded-lg ${bg} border border-white/5`}>
            <div className="flex items-center gap-2">
                <span className={color}>{icon}</span>
                <span className="text-[10px] font-bold text-white uppercase">{label}</span>
            </div>
            <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-black text-white">{count}</span>
                <span className={`text-[9px] font-bold ${color}`}>{pct}%</span>
            </div>
        </div>
    );
}
