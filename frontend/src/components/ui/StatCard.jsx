import React from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';

export default function StatCard({ label, value, sub, Icon, color, glow, border, trend }) {
    return (
        <div className="group relative rounded-2xl overflow-hidden transition-all duration-300 hover:-translate-y-1"
            style={{ 
                background: 'var(--color-glass)', 
                border: `1px solid ${border || 'var(--color-glass-border)'}`, 
                boxShadow: `0 4px 16px rgba(0,0,0,0.2)`
            }}>
            {/* Top edge highlight */}
            <div className="absolute top-0 left-0 right-0 h-[2px] opacity-50 group-hover:opacity-100 transition-opacity duration-300"
                style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)` }} />

            {/* Subtle glow on hover */}
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                style={{ background: `radial-gradient(ellipse at center, ${glow || 'rgba(255,255,255,0.05)'} 0%, transparent 70%)` }} />
            
            <div className="relative p-5 z-10">
                <div className="flex items-start justify-between mb-4">
                    <div className="p-2.5 rounded-xl transition-transform duration-300 group-hover:scale-110" 
                        style={{ background: glow || 'rgba(255,255,255,0.03)', border: `1px solid ${border || 'rgba(255,255,255,0.05)'}` }}>
                        <Icon className="w-4 h-4 drop-shadow-md" style={{ color }} />
                    </div>
                    {trend != null && (
                        <span className="flex items-center gap-1 text-xs font-black px-2.5 py-1 rounded-lg tracking-wide shadow-sm"
                            style={{
                                color: trend >= 0 ? 'var(--color-bullish)' : 'var(--color-bearish)',
                                background: trend >= 0 ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                                border: `1px solid ${trend >= 0 ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)'}`,
                            }}>
                            {trend >= 0 ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                            {Math.abs(trend).toFixed(2)}%
                        </span>
                    )}
                </div>
                <p className="text-2xl font-black text-white tabular-nums leading-none mb-1 group-hover:scale-[1.02] origin-left transition-transform duration-300 drop-shadow-sm">{value}</p>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 group-hover:text-slate-300 transition-colors">{label}</p>
                {sub && <p className="text-[10px] mt-1 text-slate-500">{sub}</p>}
            </div>
        </div>
    );
}
