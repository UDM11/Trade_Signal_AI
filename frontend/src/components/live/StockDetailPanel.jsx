import React from 'react';
import { X, TrendingUp, TrendingDown, Clock, Search, Brain, Target, Shield, Info, Loader2, Activity, Layers } from 'lucide-react';
import TradingChart from '../../pages/stock-details/TradingChart';
import PredictionResult from '../../pages/stock-details/PredictionResult';
import BacktestResults from '../../pages/stock-details/BacktestResults';
import { fmt, fmtVol, chgColor, getSignalColors } from '../../utils/formatters';
import { useToast } from '../../contexts/ToastContext';
import { invalidate } from '../../cache/predictionsCache';

export default function StockDetailPanel({ stock, chartData: initialChartData, chartLoading, prediction: initialPrediction, onSwitch, onClose }) {
    const { addToast } = useToast();
    const [analyzing, setAnalyzing]   = React.useState(false);
    const [prediction, setPrediction] = React.useState(initialPrediction);
    const [chartData, setChartData]   = React.useState(initialChartData);

    // Sync with props if they change externally
    React.useEffect(() => { 
        setPrediction(initialPrediction); 
        
        // AUTO-SYNC: If we open the panel, fetch the LATEST full record from DB 
        // so we don't lose Deep Analysis data on reopen.
        const syncDetails = async () => {
            try {
                const { api } = await import('../../api');
                const res = await api.getHistory(); // This gets all saved predictions
                const saved = res.data.data?.find(p => (p.stocks?.symbol || p.symbol) === stock.symbol);
                if (saved) {
                    const ai = saved.ai_analysis || {};
                    const mapped = {
                        ...saved,
                        prediction:     saved.prediction,
                        confidence:     saved.confidence_score ?? saved.confidence,
                        explanation:    saved.explanation,
                        target_price:   saved.target_price,
                        target_pct:     saved.target_pct,
                        target2:        ai.target2 || saved.target2,
                        target2_pct:    ai.target2_pct || saved.target2_pct,
                        stop_loss:      saved.stop_loss,
                        stop_loss_pct:  saved.stop_loss_pct,
                        trailing_stop:  ai.trailing_stop || saved.trailing_stop,
                        trailing_stop_pct: ai.trailing_stop_pct || saved.trailing_stop_pct,
                        risk_reward:    saved.risk_reward,
                        estimated_days: saved.estimated_days,
                        entry_condition:ai.entry_condition || saved.entry_condition,
                        exit_condition: ai.exit_condition || saved.exit_condition,
                        risk_note:      ai.risk_note || saved.risk_note,
                        market_structure:ai.market_structure || saved.market_structure,
                        indicators:     saved.indicators,
                        backtest:       ai.backtest || saved.backtest_stats || saved.backtest || saved.backtest,
                        ai_analysis:    ai
                    };
                    setPrediction(mapped);
                }
            } catch (err) {
                console.error("Auto-sync details failed", err);
            }
        };
        syncDetails();
    }, [initialPrediction, stock.symbol]);
    
    React.useEffect(() => { setChartData(initialChartData); }, [initialChartData]);

    const reportRef = React.useRef(null);

    const handleDeepAnalysis = async () => {
        if (analyzing) return;
        setAnalyzing(true);
        addToast({ 
            title: 'AI Analysis', 
            message: `Initiating deep scan for ${stock.symbol}...`, 
            type: 'info', 
            duration: 3000 
        });

        try {
            const { api } = await import('../../api');
            const res = await api.analyzeStockDeep(stock.symbol);
            const data = res.data;
            
            const newPred = {
                ...data,
                prediction:     data.prediction,
                confidence:     data.confidence_score,
                explanation:    data.explanation,
                target_price:   data.target_price,
                target_pct:     data.target_pct,
                target2:        data.ai_analysis?.target2 || data.target2 || data.target2_price,
                target2_pct:    data.target2_pct,
                stop_loss:      data.stop_loss,
                stop_loss_pct:  data.stop_loss_pct,
                trailing_stop:  data.ai_analysis?.trailing_stop || data.trailing_stop,
                trailing_stop_pct: data.ai_analysis?.trailing_stop_pct || data.trailing_stop_pct,
                risk_reward:    data.risk_reward,
                estimated_days: data.estimated_days,
                entry_condition:data.ai_analysis?.entry_condition || data.entry_condition,
                exit_condition: data.ai_analysis?.exit_condition || data.exit_condition,
                risk_note:      data.ai_analysis?.risk_note || data.risk_note,
                market_structure:data.ai_analysis?.market_structure || data.market_structure,
                indicators:     data.indicators,
                backtest:       data.ai_analysis?.backtest || data.backtest_stats || data.backtest,
                target2_pct:    data.ai_analysis?.target2_pct || data.target2_pct,
            };
            
            setPrediction(newPred);
            invalidate(); // Force history refresh
            
            if (data.chart_data?.length > 0) {
                setChartData(data.chart_data);
            }

            addToast({ 
                title: 'Analysis Complete', 
                message: `Market report for ${stock.symbol} is ready.`, 
                type: 'success' 
            });

            // Smooth scroll to report
            setTimeout(() => {
                reportRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 100);

        } catch (e) {
            console.error('Deep analysis failed', e);
            addToast({ 
                title: 'Analysis Failed', 
                message: 'AI engine is currently busy. Please try again.', 
                type: 'error' 
            });
        } finally {
            setAnalyzing(false);
        }
    };

    const cc = chgColor(stock.change);
    const sig = prediction?.prediction || 'HOLD';
    const sigColors = getSignalColors(sig);
    
    return (
        <div className="max-w-[1600px] mx-auto space-y-4 sm:space-y-6 animate-in fade-in slide-in-from-right-4 duration-300 px-0 sm:px-0">
            {/* Header bar with detailed stats */}
            <div className="relative p-3 sm:p-5 rounded-xl sm:rounded-2xl overflow-hidden shadow-2xl space-y-3 sm:space-y-4" style={{ background: 'var(--color-glass)', border: '1px solid var(--color-glass-border)' }}>
                <div className="absolute top-0 left-0 right-0 h-[2px] opacity-60" style={{ background: `linear-gradient(90deg, transparent, ${cc}, transparent)` }} />
                
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-start sm:items-center gap-3 sm:gap-4 min-w-0">
                        <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/5 transition-colors group shrink-0">
                            <X className="w-4 h-4 sm:w-5 sm:h-5 text-text-muted group-hover:text-white transition-colors" />
                        </button>
                        <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                                <h2 className="text-xl sm:text-2xl font-black text-white truncate">{stock.symbol}</h2>
                                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg border text-[8px] sm:text-[10px] font-black tracking-widest uppercase shrink-0"
                                     style={{ background: sigColors.bg, color: sigColors.text, borderColor: sigColors.border }}>
                                    <Brain className="w-2.5 h-2.5" />
                                    {sig}
                                </div>
                            </div>
                            <p className="text-[10px] sm:text-sm text-text-muted mt-0.5 font-medium truncate">{stock.name}</p>
                        </div>
                    </div>
                    
                    <div className="flex items-center sm:items-end justify-between sm:justify-center sm:flex-col gap-1 shrink-0 bg-white/[0.02] sm:bg-transparent p-2 sm:p-0 rounded-xl border border-white/5 sm:border-0">
                        <div className="flex flex-col items-start sm:items-end">
                            <p className="text-xl sm:text-2xl font-black text-white tabular-nums">Rs.{fmt(stock.ltp)}</p>
                            <span className="text-[10px] sm:text-sm font-bold tabular-nums" style={{ color: cc }}>
                                {stock.change >= 0 ? '+' : ''}{fmt(stock.change_pct)}%
                            </span>
                        </div>

                        <button 
                            onClick={handleDeepAnalysis}
                            disabled={analyzing}
                            className={`group relative flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg sm:rounded-xl text-[9px] sm:text-[10px] font-black uppercase tracking-widest transition-all overflow-hidden ${
                                analyzing 
                                ? 'bg-white/5 text-slate-500 cursor-not-allowed' 
                                : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-xl shadow-blue-600/20 active:scale-95'
                            }`}
                        >
                            {/* AI Glow Effect */}
                            {!analyzing && <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:animate-shimmer" />}
                            
                            {analyzing ? (
                                <>
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                    Analyzing...
                                </>
                            ) : (
                                <>
                                    <Brain className="w-3 h-3 text-blue-200" />
                                    Generate Deep AI Report
                                </>
                            )}
                        </button>
                    </div>
                </div>

                {/* Key Stats Strip (New) */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 p-2 sm:p-3 rounded-lg sm:rounded-xl bg-white/[0.03] border border-white/5 shadow-inner">
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

            {/* Dual Analysis Grid (AI on Left, Backtest on Right) */}
            {prediction && (
                <div ref={reportRef} className="grid grid-cols-1 lg:grid-cols-2 gap-6 scroll-mt-4 items-stretch">
                    {/* Left: AI Report */}
                    <div className="flex flex-col space-y-4 h-full">
                        <div className="flex items-center gap-2 px-1">
                            <Brain className="w-4 h-4 text-blue-400" />
                            <h3 className="text-xs font-black text-white uppercase tracking-widest">AI Intelligence Report</h3>
                        </div>
                        <div className="flex-1 flex flex-col h-full">
                            <PredictionResult result={prediction} isSidebar={true} />
                        </div>
                    </div>

                    {/* Right: Backtest Results */}
                    <div className="flex flex-col space-y-4 h-full">
                        <div className="flex items-center justify-between px-1">
                            <div className="flex items-center gap-2">
                                <Activity className="w-4 h-4 text-green-400" />
                                <h3 className="text-xs font-black text-white uppercase tracking-widest">Historical Performance</h3>
                            </div>
                            {chartData?.length > 0 && (
                                <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/5 border border-white/10">
                                    <Layers className="w-2.5 h-2.5 text-slate-500" />
                                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">
                                        {chartData.length} Records Analyzed
                                    </span>
                                </div>
                            )}
                        </div>
                        <div className="flex-1 rounded-2xl border border-white/6 overflow-hidden bg-black/20 flex flex-col h-full" 
                            style={{ background: 'var(--color-glass)' }}>
                            <BacktestResults stats={prediction.backtest || prediction.backtest_stats} isSidebar={true} />
                        </div>
                    </div>
                </div>
            )}

            {/* Chart Section */}
            <div className="rounded-2xl overflow-hidden relative shadow-xl h-[400px] sm:h-[450px] lg:h-[650px] border border-white/5" 
                style={{ background: 'rgba(5,13,26,0.5)' }}>
                {chartLoading && (
                    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/40 backdrop-blur-md transition-all duration-500">
                        <div className="relative">
                            <div className="w-12 h-12 rounded-full border-2 border-blue-500/20 border-t-blue-500 animate-spin" />
                            <div className="absolute inset-0 rounded-full border-2 border-white/5 animate-pulse" />
                        </div>
                        <p className="mt-4 text-[10px] font-black text-blue-400 uppercase tracking-[0.3em] animate-pulse">
                            Synchronizing Market Data
                        </p>
                    </div>
                )}
                <TradingChart 
                    data={chartData} 
                    symbol={stock.symbol} 
                    stockLtp={stock.ltp}
                    prediction={sig}
                    targetPrice={prediction?.target_price}
                    target2={prediction?.target2}
                    stopLoss={prediction?.stop_loss}
                    trailingStop={prediction?.trailing_stop}
                    targetPct={prediction?.target_pct}
                    target2Pct={prediction?.target2_pct}
                    stopLossPct={prediction?.stop_loss_pct}
                    trailingStopPct={prediction?.trailing_stop_pct}
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
