import React from 'react';
import { 
    Activity, TrendingUp, TrendingDown, Layers, 
    PieChart, BarChart3, Info, AlertTriangle, 
    Zap, Target, ArrowRight, Gauge
} from 'lucide-react';
import { useMarketSocket } from '../hooks/useMarketSocket.jsx';

const fmt = (n, d = 2) => 
    n != null ? Number(n).toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—';

function SentimentCard({ title, value, sub, icon: Icon, color, trend }) {
    return (
        <div className="rounded-3xl p-6 border border-white/6 bg-white/[0.02] backdrop-blur-xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-8 opacity-[0.03] group-hover:opacity-[0.06] transition-opacity">
                <Icon size={120} />
            </div>
            <div className="flex flex-col gap-4 relative z-10">
                <div className="flex items-center justify-between">
                    <div className="p-2.5 rounded-xl bg-white/5 border border-white/10">
                        <Icon size={18} className="text-slate-400" />
                    </div>
                    {trend && (
                        <div className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest ${trend >= 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                            {trend >= 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                            {Math.abs(trend).toFixed(2)}%
                        </div>
                    )}
                </div>
                <div>
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-1">{title}</p>
                    <h2 className="text-3xl font-black tracking-tighter text-white tabular-nums" style={{ color: color }}>{value}</h2>
                    {sub && <p className="text-[11px] font-bold text-slate-400 mt-1">{sub}</p>}
                </div>
            </div>
        </div>
    );
}

function SectorRow({ sector }) {
    const isUp = sector.change >= 0;
    const color = isUp ? '#10b981' : '#ef4444';
    const pct = sector.change_pct;

    return (
        <div className="flex items-center justify-between p-4 rounded-2xl border border-white/5 bg-white/[0.01] hover:bg-white/[0.03] transition-all">
            <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-xs border border-white/10"
                    style={{ background: isUp ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)', color }}>
                    {sector.name.slice(0, 2)}
                </div>
                <div>
                    <h3 className="text-xs font-black text-white tracking-tight uppercase">{sector.name}</h3>
                    <p className="text-[10px] font-bold text-slate-500 tabular-nums">Rs.{fmt(sector.value)}</p>
                </div>
            </div>
            
            <div className="flex items-center gap-6">
                <div className="hidden sm:block w-32 h-1.5 rounded-full bg-white/5 overflow-hidden">
                    <div className="h-full rounded-full" 
                        style={{ width: `${Math.min(Math.abs(pct) * 20, 100)}%`, background: color }} />
                </div>
                <div className="text-right min-w-[70px]">
                    <p className="text-xs font-black tabular-nums" style={{ color }}>
                        {isUp ? '+' : ''}{fmt(sector.change)}
                    </p>
                    <p className="text-[10px] font-bold tabular-nums" style={{ color }}>
                        {isUp ? '+' : ''}{fmt(pct)}%
                    </p>
                </div>
            </div>
        </div>
    );
}

export default function MarketSentimentPage() {
    const { marketData } = useMarketSocket();
    
    const index = marketData?.index;
    const sectorsRaw = marketData?.sectors;
    const sectors = Array.isArray(sectorsRaw) ? sectorsRaw : typeof sectorsRaw === 'object' ? Object.values(sectorsRaw) : [];
    const summary = marketData?.summary;
    
    const adRatio = summary?.advancers && summary?.decliners 
        ? (summary.advancers / (summary.decliners || 1)).toFixed(2)
        : '—';

    const sentimentScore = summary?.advancers && summary?.decliners
        ? (summary.advancers / (summary.advancers + summary.decliners + summary.unchanged)) * 100
        : 50;

    const sentimentLabel = sentimentScore > 65 ? 'Extremely Bullish' :
                          sentimentScore > 55 ? 'Bullish' :
                          sentimentScore > 45 ? 'Neutral' :
                          sentimentScore > 35 ? 'Bearish' : 'Extremely Bearish';

    const sentimentColor = sentimentScore > 55 ? '#10b981' : sentimentScore < 45 ? '#ef4444' : '#eab308';

    return (
        <div className="max-w-[1400px] mx-auto space-y-8 pb-12 animate-in fade-in duration-700">
            
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-white/5 pb-8">
                <div>
                    <div className="flex items-center gap-2 mb-2">
                        <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20">
                            <Gauge size={16} className="text-blue-400" />
                        </div>
                        <span className="text-[10px] font-black text-blue-400 uppercase tracking-[0.3em]">Institutional Dashboard</span>
                    </div>
                    <h1 className="text-4xl font-black text-white tracking-tighter">Market Sentiment</h1>
                    <p className="text-slate-500 font-medium mt-1">Real-time market breadth and sector accumulation analysis.</p>
                </div>

                <div className="flex items-center gap-3">
                    <div className="px-4 py-2 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl">
                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-0.5">NEPSE Vibe</span>
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: sentimentColor }} />
                            <span className="text-sm font-black text-white">{sentimentLabel}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Top Stats Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <SentimentCard 
                    title="Advance/Decline Ratio"
                    value={adRatio}
                    sub={`${summary?.advancers || 0} Adv · ${summary?.decliners || 0} Dec`}
                    icon={Activity}
                    color="#60a5fa"
                />
                <SentimentCard 
                    title="Market Breadth"
                    value={`${sentimentScore.toFixed(0)}%`}
                    sub="Bullish Participation"
                    icon={BarChart3}
                    color={sentimentColor}
                />
                <SentimentCard 
                    title="Total Volume"
                    value={summary?.total_volume ? (summary.total_volume / 1000000).toFixed(1) + 'M' : '—'}
                    sub="Shares Traded"
                    icon={Zap}
                    color="#f59e0b"
                />
                <SentimentCard 
                    title="NEPSE Index"
                    value={fmt(index?.value)}
                    trend={index?.change_pct}
                    icon={TrendingUp}
                    color="#fff"
                />
            </div>

            {/* Market Indices Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {(marketData?.market_indices || []).map(idx => (
                    <div key={idx.name} className="flex items-center justify-between p-4 rounded-2xl border border-white/5 bg-white/[0.02] backdrop-blur-md">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-[10px] font-black text-blue-400">
                                {idx.name.slice(0, 2)}
                            </div>
                            <div>
                                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{idx.name}</h3>
                                <p className="text-sm font-black text-white tabular-nums">{fmt(idx.value)}</p>
                            </div>
                        </div>
                        <div className="text-right">
                            <p className={`text-[11px] font-black tabular-nums ${idx.change >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {idx.change >= 0 ? '+' : ''}{fmt(idx.change)}
                            </p>
                            <p className={`text-[9px] font-bold tabular-nums ${idx.change >= 0 ? 'text-emerald-400/60' : 'text-rose-400/60'}`}>
                                {idx.change >= 0 ? '+' : ''}{fmt(idx.change_pct)}%
                            </p>
                        </div>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                
                {/* Sector Performance List */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
                                <Layers size={16} className="text-purple-400" />
                            </div>
                            <h2 className="text-xl font-black text-white tracking-tight">Sectoral Performance</h2>
                        </div>
                        <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-3 py-1 rounded-full border border-white/5 bg-white/5">
                            {sectors.filter(s => !['FLOAT', 'SENSITIVE', 'SENSITIVE FLOAT'].includes(s.name.toUpperCase())).length} Sectors
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3">
                        {sectors.length > 0 ? (
                            sectors
                                .filter(s => !['FLOAT', 'SENSITIVE', 'SENSITIVE FLOAT'].includes(s.name.toUpperCase()))
                                .sort((a, b) => b.change_pct - a.change_pct)
                                .map(s => (
                                <SectorRow key={s.name} sector={s} />
                            ))
                        ) : (
                            <div className="py-20 text-center border border-dashed border-white/10 rounded-3xl">
                                <p className="text-slate-500 font-bold uppercase tracking-widest text-[10px]">Awaiting Market Data...</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Sidebar: AI Summary & Participation */}
                <div className="space-y-6">
                    <div className="rounded-3xl p-8 border border-white/6 bg-gradient-to-br from-blue-600/10 to-purple-600/10 backdrop-blur-2xl">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center">
                                <PieChart size={20} className="text-white" />
                            </div>
                            <h2 className="text-xl font-black text-white tracking-tight">Participation</h2>
                        </div>

                        <div className="space-y-6">
                            <ParticipationItem label="Advancers" value={summary?.advancers || 0} total={summary?.total_stocks || 1} color="#10b981" />
                            <ParticipationItem label="Decliners" value={summary?.decliners || 0} total={summary?.total_stocks || 1} color="#ef4444" />
                            <ParticipationItem label="Unchanged" value={summary?.unchanged || 0} total={summary?.total_stocks || 1} color="#94a3b8" />
                        </div>

                        <div className="mt-8 pt-8 border-t border-white/10">
                            <div className="flex items-center gap-2 mb-4">
                                <Info size={14} className="text-blue-400" />
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Market Insight</span>
                            </div>
                            <p className="text-xs font-medium text-slate-400 leading-relaxed">
                                {sentimentScore > 50 
                                    ? "Market shows strong accumulation with more advancers than decliners. Look for breakout opportunities in leading sectors."
                                    : "Bearish pressure remains high. Institutional selling is evident in major sub-indices. Caution is advised for long positions."}
                            </p>
                        </div>
                    </div>

                    {/* Risk Advisory */}
                    <div className="rounded-3xl p-6 border border-rose-500/20 bg-rose-500/5">
                        <div className="flex gap-4">
                            <div className="shrink-0 p-2 rounded-xl bg-rose-500/10">
                                <AlertTriangle size={18} className="text-rose-500" />
                            </div>
                            <div>
                                <h4 className="text-xs font-black text-white uppercase tracking-tight mb-1">Volatilty Warning</h4>
                                <p className="text-[11px] font-medium text-rose-200/60 leading-relaxed">
                                    High sector rotation detected. Ensure you check individual stock liquidity before entering trades in low-volume sectors.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function ParticipationItem({ label, value, total, color }) {
    const pct = (value / total) * 100;
    return (
        <div className="space-y-2">
            <div className="flex justify-between items-end">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</span>
                <span className="text-xs font-black text-white tabular-nums">{value}</span>
            </div>
            <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                <div className="h-full rounded-full transition-all duration-1000" 
                    style={{ width: `${pct}%`, background: color }} />
            </div>
        </div>
    );
}
