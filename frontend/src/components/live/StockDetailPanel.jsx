import React from 'react';
import { X, TrendingUp, TrendingDown, Clock, Search, Brain, Target, Shield, Info, Loader2 } from 'lucide-react';
import TradingChart from '../../pages/stock-details/TradingChart';
import { fmt, fmtVol, chgColor, getSignalColors } from '../../utils/formatters';

export default function StockDetailPanel({ stock, chartData: initialChartData, chartLoading, prediction: initialPrediction, onSwitch, onClose }) {
    const [analyzing, setAnalyzing]   = React.useState(false);
    const [prediction, setPrediction] = React.useState(initialPrediction);
    const [chartData, setChartData]   = React.useState(initialChartData);

    // Sync with props if they change externally
    React.useEffect(() => { setPrediction(initialPrediction); }, [initialPrediction]);
    React.useEffect(() => { setChartData(initialChartData); }, [initialChartData]);

    const handleDeepAnalysis = async () => {
        if (analyzing) return;
        setAnalyzing(true);
        try {
            const { api } = await import('../../api');
            const res = await api.analyzeStockDeep(stock.symbol);
            const data = res.data;
            
            setPrediction({
                ...data,
                prediction:     data.prediction,
                confidence:     data.confidence_score,
                explanation:    data.explanation,
                target_price:   data.target_price,
                stop_loss:      data.stop_loss,
                risk_reward:    data.risk_reward,
                estimated_days: data.estimated_days,
            });
            
            if (data.chart_data?.length > 0) {
                setChartData(data.chart_data);
            }
        } catch (e) {
            console.error('Deep analysis failed', e);
            alert('AI Analysis failed. Please try again in a few moments.');
        } finally {
            setAnalyzing(false);
        }
    };

    const cc = chgColor(stock.change);
    const sig = prediction?.prediction || 'HOLD';
    const sigColors = getSignalColors(sig);
    
    return (
        <div className="space-y-3 sm:space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
            {/* Header bar with detailed stats */}
            <div className="relative p-3 sm:p-5 rounded-xl sm:rounded-2xl overflow-hidden shadow-2xl space-y-3 sm:space-y-4" style={{ background: 'var(--color-glass)', border: '1px solid var(--color-glass-border)' }}>
                <div className="absolute top-0 left-0 right-0 h-[2px] opacity-60" style={{ background: `linear-gradient(90deg, transparent, ${cc}, transparent)` }} />
                
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4">
                    <div className="flex items-center gap-2 sm:gap-4">
                        <button onClick={onClose} className="p-1.5 sm:p-2 rounded-lg sm:rounded-xl hover:bg-white/5 transition-colors group shrink-0">
                            <X className="w-4 h-4 sm:w-5 sm:h-5 text-text-muted group-hover:text-white transition-colors" />
                        </button>
                        <div>
                            <div className="flex items-center gap-1.5 sm:gap-2">
                                <h2 className="text-lg sm:text-2xl font-black text-white">{stock.symbol}</h2>
                                <div className="flex items-center gap-1 px-1.5 py-0.5 sm:px-2.5 sm:py-1 rounded-md sm:rounded-lg border text-[7px] sm:text-[10px] font-black tracking-widest uppercase"
                                     style={{ background: sigColors.bg, color: sigColors.text, borderColor: sigColors.border }}>
                                    <Brain className="w-2 w-2.5 sm:w-3 sm:h-3" />
                                    {sig}
                                </div>
                            </div>
                            <p className="text-[9px] sm:text-sm text-text-muted mt-0.5 font-medium line-clamp-1">{stock.name}</p>
                        </div>
                    </div>
                    
                    <div className="flex flex-row md:flex-col items-center md:items-end justify-between md:justify-center gap-4 sm:gap-1">
                        <div className="text-right">
                            <p className="text-lg sm:text-2xl font-black text-white tabular-nums">Rs.{fmt(stock.ltp)}</p>
                            <div className="flex items-center gap-1.5 sm:gap-2 justify-end">
                                <span className="text-[10px] sm:text-sm font-bold tabular-nums" style={{ color: cc }}>
                                    {stock.change >= 0 ? '+' : ''}{fmt(stock.change_pct)}%
                                </span>
                            </div>
                        </div>

                        <button 
                            onClick={handleDeepAnalysis}
                            disabled={analyzing}
                            className={`group relative flex items-center gap-2 px-4 sm:px-6 py-2 sm:py-2.5 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-widest transition-all overflow-hidden ${
                                analyzing 
                                ? 'bg-white/5 text-slate-500 cursor-not-allowed' 
                                : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-xl shadow-blue-600/20 active:scale-95'
                            }`}
                        >
                            {/* AI Glow Effect */}
                            {!analyzing && <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:animate-shimmer" />}
                            
                            {analyzing ? (
                                <>
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    Analyzing Market...
                                </>
                            ) : (
                                <>
                                    <Brain className="w-3.5 h-3.5 text-blue-200" />
                                    Generate Deep AI Report
                                </>
                            )}
                        </button>
                    </div>
                </div>

                {/* Key Stats Strip (New) */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4 p-2 sm:p-4 rounded-lg sm:rounded-xl bg-white/[0.03] border border-white/5 shadow-inner">
                    {[
                        { label: 'Open',   value: `Rs.${fmt(stock.open)}`,    color: 'text-white' },
                        { label: 'High',   value: `Rs.${fmt(stock.high)}`,    color: 'text-bullish' },
                        { label: 'Low',    value: `Rs.${fmt(stock.low)}`,     color: 'text-bearish' },
                        { label: 'Volume', value: fmtVol(stock.volume),      color: 'text-blue-400' },
                    ].map((s) => (
                        <div key={s.label} className="space-y-0.5 sm:space-y-1 transition-all hover:translate-x-1">
                            <p className="text-[8px] sm:text-[10px] font-black text-text-muted uppercase tracking-[0.1em] sm:tracking-[0.2em]">{s.label}</p>
                            <p className={`text-[11px] sm:text-base font-black tabular-nums ${s.color}`}>{s.value || '—'}</p>
                        </div>
                    ))}
                </div>
            </div>

            {/* AI Analysis Card (The "Details") */}
            {prediction && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 sm:gap-3">
                    <div className="col-span-1 p-3 sm:p-4 rounded-xl sm:rounded-2xl space-y-2 sm:space-y-3 transition-shadow duration-300 hover:shadow-xl" style={{ background: 'var(--color-glass)', border: '1px solid var(--color-glass-border)' }}>
                        <div className="flex items-center gap-1.5 sm:gap-2 text-[9px] sm:text-sm font-bold text-text-muted uppercase tracking-wider">
                            <Target className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-bullish" />
                            Targets & Risk
                        </div>
                        <div className="space-y-2">
                            <div className="flex justify-between items-end">
                                <span className="text-[9px] sm:text-[11px] font-bold text-text-muted uppercase">Target 1</span>
                                <span className="text-xs sm:text-base font-black text-bullish">Rs.{fmt(prediction.target_price)}</span>
                            </div>
                            <div className="flex justify-between items-end">
                                <span className="text-[9px] sm:text-[11px] font-bold text-text-muted uppercase">Stop Loss</span>
                                <span className="text-xs sm:text-base font-black text-bearish">Rs.{fmt(prediction.stop_loss)}</span>
                            </div>
                            <div className="pt-1.5 sm:pt-2 border-t border-white/5 flex justify-between items-end">
                                <span className="text-[9px] sm:text-[11px] font-bold text-text-muted uppercase">Risk/Reward</span>
                                <span className="text-[10px] sm:text-sm font-black text-white">1 : {fmt(prediction.risk_reward)}</span>
                            </div>
                        </div>
                    </div>
                    
                    <div className="col-span-1 md:col-span-2 p-3 sm:p-4 rounded-xl sm:rounded-2xl space-y-1.5 sm:space-y-2 transition-shadow duration-300 hover:shadow-xl" style={{ background: 'var(--color-glass)', border: '1px solid var(--color-glass-border)' }}>
                        <div className="flex items-center gap-1.5 sm:gap-2 text-[9px] sm:text-sm font-bold text-text-muted uppercase tracking-wider">
                            <Brain className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-blue-400" />
                            AI Explanation
                        </div>
                        <p className="text-[11px] sm:text-sm text-text-muted leading-relaxed sm:line-clamp-4">
                            {prediction.explanation || prediction.ai_analysis || "No detailed analysis available for this stock."}
                        </p>
                    </div>
                </div>
            )}

            {/* Chart Section */}
            <div className="rounded-2xl overflow-hidden relative shadow-xl h-[450px] sm:h-[500px] lg:h-[700px]" style={{ background: 'var(--color-glass)', border: '1px solid var(--color-glass-border)' }}>
                {chartLoading && (
                    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[#050d1a]/80 backdrop-blur-sm">
                        <Loader2 className="w-8 h-8 text-blue-500 animate-spin mb-2" />
                        <span className="text-sm font-bold text-text-muted animate-pulse">Loading Chart Data...</span>
                    </div>
                )}
                <TradingChart 
                    data={chartData} 
                    symbol={stock.symbol} 
                    stockLtp={stock.ltp}
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
            <div className="rounded-xl sm:rounded-2xl overflow-hidden shadow-xl" style={{ background: 'var(--color-glass)', border: '1px solid var(--color-glass-border)' }}>
                <div className="px-3 sm:px-4 py-2 sm:py-3 border-b border-white/5 flex items-center justify-between">
                    <div className="flex items-center gap-1.5 sm:gap-2">
                        <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-text-muted" />
                        <span className="text-[11px] sm:text-sm font-bold text-white uppercase tracking-wider">Price History</span>
                    </div>
                    <span className="text-[9px] sm:text-xs font-bold text-text-muted">
                        {chartData.length} days
                    </span>
                </div>
                <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full text-[10px] sm:text-xs">
                        <thead>
                            <tr className="border-b border-white/5 text-text-muted uppercase font-black" style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.01) 100%)' }}>
                                <td className="px-3 sm:px-4 py-2 sm:py-3">Date</td>
                                <td className="px-3 sm:px-4 py-2 sm:py-3 text-right hidden sm:table-cell">Open</td>
                                <td className="px-3 sm:px-4 py-2 sm:py-3 text-right hidden lg:table-cell">High</td>
                                <td className="px-3 sm:px-4 py-2 sm:py-3 text-right hidden lg:table-cell">Low</td>
                                <td className="px-3 sm:px-4 py-2 sm:py-3 text-right font-bold text-white">Close</td>
                                <td className="px-3 sm:px-4 py-2 sm:py-3 text-right hidden md:table-cell">Vol</td>
                                <td className="px-3 sm:px-4 py-2 sm:py-3 text-right hidden sm:table-cell">Chg</td>
                                <td className="px-3 sm:px-4 py-2 sm:py-3 text-right">%</td>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {[...chartData].reverse().map((d, i, arr) => {
                                const prev = arr[i+1];
                                const chg = prev ? d.close - prev.close : 0;
                                const chgPct = prev && prev.close !== 0 ? (chg / prev.close) * 100 : 0;
                                const color = chg > 0 ? 'text-bullish' : chg < 0 ? 'text-bearish' : 'text-text-muted';
                                return (
                                    <tr key={d.time} className="hover:bg-white/5 transition-colors">
                                        <td className="px-3 sm:px-4 py-2 sm:py-3 font-bold text-white whitespace-nowrap">{d.time}</td>
                                        <td className="px-3 sm:px-4 py-2 sm:py-3 text-right tabular-nums text-text-muted hidden sm:table-cell">{fmt(d.open)}</td>
                                        <td className="px-3 sm:px-4 py-2 sm:py-3 text-right tabular-nums text-bullish hidden lg:table-cell">{fmt(d.high)}</td>
                                        <td className="px-3 sm:px-4 py-2 sm:py-3 text-right tabular-nums text-bearish hidden lg:table-cell">{fmt(d.low)}</td>
                                        <td className="px-3 sm:px-4 py-2 sm:py-3 text-right tabular-nums font-bold text-white">{fmt(d.close)}</td>
                                        <td className="px-3 sm:px-4 py-2 sm:py-3 text-right tabular-nums text-text-muted opacity-80 hidden md:table-cell">{fmtVol(d.value)}</td>
                                        <td className={`px-3 sm:px-4 py-2 sm:py-3 text-right tabular-nums font-bold ${color} hidden sm:table-cell`}>
                                            {chg >= 0 ? '+' : ''}{fmt(chg)}
                                        </td>
                                        <td className={`px-3 sm:px-4 py-2 sm:py-3 text-right tabular-nums font-bold ${color}`}>
                                            {chgPct >= 0 ? '+' : ''}{fmt(chgPct)}%
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
