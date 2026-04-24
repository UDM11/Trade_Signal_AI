import React from 'react';
import { BarChart3, Hash, TrendingUp, Shield, Layers, Cpu } from 'lucide-react';

const INDICATOR_TAGS = ['RSI', 'MACD', 'MA50', 'MA200', 'BB', 'Support', 'Resistance', 'Volume', 'Candle', 'Volatility'];

export default function DatasetStatsCard({ stats }) {
    const isFromDB    = stats.RowsProcessed === 'From Database';
    const accColor    = stats.ModelAccuracy >= 60 ? '#10b981' : stats.ModelAccuracy >= 45 ? '#eab308' : '#ef4444';
    const accLabel    = stats.ModelAccuracy >= 60 ? 'High' : stats.ModelAccuracy >= 45 ? 'Medium' : 'Low';
    const rowsNum     = isFromDB ? null : Number(stats.RowsProcessed);
    const dataQuality = rowsNum == null ? null
        : rowsNum >= 200 ? { label: 'Excellent', color: '#10b981' }
        : rowsNum >= 100 ? { label: 'Good',      color: '#3b82f6' }
        : rowsNum >= 30  ? { label: 'Minimal',   color: '#eab308' }
        :                  { label: 'Poor',       color: '#ef4444' };

    return (
        <div className="rounded-2xl overflow-hidden border border-white/5 shadow-2xl flex flex-col h-full" style={{ background: '#080f1a' }}>
            {/* Header */}
            <div className="px-5 sm:px-6 pt-5 pb-4 border-b border-white/5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl" style={{ background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.2)' }}>
                        <BarChart3 className="w-4 h-4 text-blue-400" />
                    </div>
                    <div>
                        <h2 className="text-sm font-bold text-white leading-tight">Dataset Overview</h2>
                        <p className="text-[11px]" style={{ color: '#475569' }}>
                            {isFromDB ? 'Loaded from history' : 'Active analysis session'}
                        </p>
                    </div>
                </div>
                <div className="px-3 py-1.5 rounded-xl font-black text-sm tracking-widest"
                    style={{ background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)', color: '#60a5fa' }}>
                    {stats.SymbolInfo}
                </div>
            </div>

            <div className="p-5 sm:p-6 space-y-4 flex-1">
                <div className="grid grid-cols-2 gap-3">
                    {/* Rows */}
                    <div className="rounded-xl p-4 border border-white/5 relative overflow-hidden" style={{ background: 'rgba(255,255,255,0.02)' }}>
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: '#475569' }}>Data Rows</span>
                            <Hash className="w-3.5 h-3.5" style={{ color: '#334155' }} />
                        </div>
                        <p className="text-xl font-black text-white">{isFromDB ? '—' : rowsNum?.toLocaleString()}</p>
                        {dataQuality && <p className="text-[11px] font-bold mt-1" style={{ color: dataQuality.color }}>{dataQuality.label} dataset</p>}
                        {isFromDB && <p className="text-[11px] mt-1" style={{ color: '#475569' }}>From history</p>}
                    </div>

                    {/* Latest Close */}
                    <div className="rounded-xl p-4 border border-white/5 relative overflow-hidden" style={{ background: 'rgba(255,255,255,0.02)' }}>
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: '#475569' }}>Latest Close</span>
                            <TrendingUp className="w-3.5 h-3.5" style={{ color: '#334155' }} />
                        </div>
                        <p className="text-xl font-black text-white">
                            Rs.&nbsp;{Number(stats.LatestClose).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                        <p className="text-[11px] mt-1" style={{ color: '#475569' }}>NEPSE · NPR</p>
                    </div>

                    {/* Model Accuracy */}
                    {stats.ModelAccuracy != null && (
                        <div className="rounded-xl p-4 border relative overflow-hidden"
                            style={{ background: `${accColor}09`, borderColor: `${accColor}25` }}>
                            <div className="absolute top-0 left-0 right-0 h-px"
                                style={{ background: `linear-gradient(90deg,transparent,${accColor}50,transparent)` }} />
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: '#475569' }}>Model Accuracy</span>
                                <Shield className="w-3.5 h-3.5" style={{ color: accColor }} />
                            </div>
                            <p className="text-xl font-black" style={{ color: accColor }}>{stats.ModelAccuracy}%</p>
                            <p className="text-[11px] font-bold mt-1" style={{ color: accColor }}>{accLabel} reliability</p>
                        </div>
                    )}

                    {/* Threshold */}
                    {stats.ThresholdUsed != null && (
                        <div className="rounded-xl p-4 border border-white/5" style={{ background: 'rgba(255,255,255,0.02)' }}>
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: '#475569' }}>Signal Threshold</span>
                                <Layers className="w-3.5 h-3.5" style={{ color: '#334155' }} />
                            </div>
                            <p className="text-xl font-black text-white">±{stats.ThresholdUsed}%</p>
                            <p className="text-[11px] mt-1" style={{ color: '#475569' }}>Min move to trigger</p>
                        </div>
                    )}
                </div>

                {/* Model badge */}
                <div className="flex items-center gap-2.5 rounded-xl p-3 border border-white/5" style={{ background: 'rgba(255,255,255,0.02)' }}>
                    <div className="p-1.5 rounded-lg" style={{ background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.2)' }}>
                        <Cpu className="w-3.5 h-3.5 text-blue-400" />
                    </div>
                    <div>
                        <p className="text-[11px] font-bold text-white">XGBoost + LightGBM + RF Ensemble</p>
                        <p className="text-[10px]" style={{ color: '#475569' }}>3-model soft-voting · Probability-calibrated</p>
                    </div>
                    <div className="ml-auto flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        <span className="text-[10px] font-semibold" style={{ color: '#10b981' }}>Active</span>
                    </div>
                </div>

                {/* Indicator tags */}
                <div>
                    <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: '#334155' }}>Active Indicators</p>
                    <div className="flex flex-wrap gap-1.5">
                        {INDICATOR_TAGS.map(tag => (
                            <span key={tag} className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold border border-white/5"
                                style={{ background: 'rgba(255,255,255,0.03)', color: '#64748b' }}>
                                <span className="w-1 h-1 rounded-full bg-blue-500/60" />
                                {tag}
                            </span>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
