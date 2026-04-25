import React from 'react';
import { X, TrendingUp, TrendingDown, Clock, Search, Brain, Target, Shield, Info, Loader2 } from 'lucide-react';
import TradingChart from '../../pages/stock-details/TradingChart';
import { fmt, fmtVol, chgColor, getSignalColors } from '../../utils/formatters';

export default function StockDetailPanel({ stock, chartData, chartLoading, prediction, onSwitch, onClose }) {
    const cc = chgColor(stock.change);
    const sig = prediction?.prediction || 'HOLD';
    const sigColors = getSignalColors(sig);
    
    return (
        <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
            {/* Header bar with detailed stats */}
            <div className="relative p-5 rounded-2xl overflow-hidden shadow-2xl space-y-4" style={{ background: 'var(--color-glass)', border: '1px solid var(--color-glass-border)' }}>
                <div className="absolute top-0 left-0 right-0 h-[2px] opacity-60" style={{ background: `linear-gradient(90deg, transparent, ${cc}, transparent)` }} />
                
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/5 transition-colors group shrink-0">
                            <X className="w-5 h-5 text-text-muted group-hover:text-white transition-colors" />
                        </button>
                        <div>
                            <div className="flex items-center gap-2">
                                <h2 className="text-2xl font-black text-white">{stock.symbol}</h2>
                                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-black tracking-widest uppercase"
                                     style={{ background: sigColors.bg, color: sigColors.text, borderColor: sigColors.border }}>
                                    <Brain className="w-3 h-3" />
                                    AI {sig}
                                </div>
                            </div>
                            <p className="text-sm text-text-muted mt-0.5 font-medium">{stock.name}</p>
                        </div>
                    </div>
                    <div className="flex items-center justify-between md:justify-end gap-6 border-t md:border-t-0 border-white/5 pt-3 md:pt-0">
                        <div className="text-right">
                            <p className="text-2xl font-black text-white tabular-nums">Rs.{fmt(stock.ltp)}</p>
                            <div className="flex items-center gap-2 justify-end">
                                <span className="text-sm font-bold tabular-nums" style={{ color: cc }}>
                                    {stock.change >= 0 ? '+' : ''}{fmt(stock.change_pct)}%
                                </span>
                                <span className="text-[10px] font-medium tabular-nums opacity-60" style={{ color: cc }}>
                                    Rs.{fmt(stock.change)}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Key Stats Strip (New) */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 rounded-xl bg-white/[0.03] border border-white/5 shadow-inner">
                    {[
                        { label: 'Open',   value: `Rs.${fmt(stock.open)}`,    color: 'text-white' },
                        { label: 'High',   value: `Rs.${fmt(stock.high)}`,    color: 'text-bullish' },
                        { label: 'Low',    value: `Rs.${fmt(stock.low)}`,     color: 'text-bearish' },
                        { label: 'Volume', value: fmtVol(stock.volume),      color: 'text-blue-400' },
                    ].map((s) => (
                        <div key={s.label} className="space-y-1 transition-all hover:translate-x-1">
                            <p className="text-[9px] font-black text-text-muted uppercase tracking-[0.2em]">{s.label}</p>
                            <p className={`text-sm font-black tabular-nums ${s.color}`}>{s.value || '—'}</p>
                        </div>
                    ))}
                </div>
            </div>

            {/* AI Analysis Card (The "Details") */}
            {prediction && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="col-span-1 p-4 rounded-2xl space-y-3 transition-shadow duration-300 hover:shadow-xl" style={{ background: 'var(--color-glass)', border: '1px solid var(--color-glass-border)' }}>
                        <div className="flex items-center gap-2 text-xs font-bold text-text-muted uppercase tracking-wider">
                            <Target className="w-3.5 h-3.5 text-bullish" />
                            Targets & Risk
                        </div>
                        <div className="space-y-2.5">
                            <div className="flex justify-between items-end">
                                <span className="text-[10px] font-bold text-text-muted uppercase">Target 1</span>
                                <span className="text-sm font-black text-bullish">Rs.{fmt(prediction.target_price)}</span>
                            </div>
                            <div className="flex justify-between items-end">
                                <span className="text-[10px] font-bold text-text-muted uppercase">Stop Loss</span>
                                <span className="text-sm font-black text-bearish">Rs.{fmt(prediction.stop_loss)}</span>
                            </div>
                            <div className="pt-2 border-t border-white/5 flex justify-between items-end">
                                <span className="text-[10px] font-bold text-text-muted uppercase">Risk/Reward</span>
                                <span className="text-xs font-black text-white">1 : {fmt(prediction.risk_reward)}</span>
                            </div>
                        </div>
                    </div>
                    
                    <div className="col-span-2 p-4 rounded-2xl space-y-2 transition-shadow duration-300 hover:shadow-xl" style={{ background: 'var(--color-glass)', border: '1px solid var(--color-glass-border)' }}>
                        <div className="flex items-center gap-2 text-xs font-bold text-text-muted uppercase tracking-wider">
                            <Brain className="w-3.5 h-3.5 text-blue-400" />
                            AI Explanation
                        </div>
                        <p className="text-xs text-text-muted leading-relaxed line-clamp-4">
                            {prediction.explanation || prediction.ai_analysis || "No detailed analysis available for this stock."}
                        </p>
                    </div>
                </div>
            )}

            {/* Chart Section */}
            <div className="rounded-2xl overflow-hidden relative shadow-xl" style={{ height: 700, background: 'var(--color-glass)', border: '1px solid var(--color-glass-border)' }}>
                {chartLoading && (
                    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#050d1a]/80 backdrop-blur-sm">
                        <Loader2 className="w-8 h-8 text-blue-500 animate-spin mb-2" />
                        <span className="text-xs font-bold text-text-muted animate-pulse">Loading Chart Data...</span>
                    </div>
                )}
                <TradingChart 
                    data={chartData} 
                    symbol={stock.symbol} 
                    prediction={sig}
                    targetPrice={prediction?.target_price}
                    stopLoss={prediction?.stop_loss}
                    targetPct={prediction?.target_pct}
                    stopLossPct={prediction?.stop_loss_pct}
                    riskReward={prediction?.risk_reward}
                    estimatedDays={prediction?.estimated_days}
                />
            </div>

            {/* History Table (Requested "Details") */}
            <div className="rounded-2xl overflow-hidden shadow-xl" style={{ background: 'var(--color-glass)', border: '1px solid var(--color-glass-border)' }}>
                <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-text-muted" />
                        <span className="text-xs font-bold text-white uppercase tracking-wider">Full Price History</span>
                    </div>
                    <span className="text-[10px] font-bold text-text-muted">
                        Showing {chartData.length} records
                    </span>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-[10px]">
                        <thead>
                            <tr className="border-b border-white/5 text-text-muted uppercase font-black" style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.01) 100%)' }}>
                                <td className="px-4 py-2">Date</td>
                                <td className="px-4 py-2 text-right">Open</td>
                                <td className="px-4 py-2 text-right">High</td>
                                <td className="px-4 py-2 text-right">Low</td>
                                <td className="px-4 py-2 text-right">Close</td>
                                <td className="px-4 py-2 text-right">Volume</td>
                                <td className="px-4 py-2 text-right">Change</td>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {[...chartData].reverse().map((d, i, arr) => {
                                const prev = arr[i+1];
                                const chg = prev ? d.close - prev.close : 0;
                                const color = chg > 0 ? 'text-bullish' : chg < 0 ? 'text-bearish' : 'text-text-muted';
                                return (
                                    <tr key={d.time} className="hover:bg-white/5 transition-colors">
                                        <td className="px-4 py-2 font-bold text-white">{d.time}</td>
                                        <td className="px-4 py-2 text-right tabular-nums text-text-muted">{fmt(d.open)}</td>
                                        <td className="px-4 py-2 text-right tabular-nums text-bullish">{fmt(d.high)}</td>
                                        <td className="px-4 py-2 text-right tabular-nums text-bearish">{fmt(d.low)}</td>
                                        <td className="px-4 py-2 text-right tabular-nums font-bold text-white">{fmt(d.close)}</td>
                                        <td className="px-4 py-2 text-right tabular-nums text-text-muted opacity-80">{fmtVol(d.value)}</td>
                                        <td className={`px-4 py-2 text-right tabular-nums font-bold ${color}`}>
                                            {chg >= 0 ? '+' : ''}{fmt(chg)}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
