import React from 'react';
import { ArrowLeft } from 'lucide-react';
import BacktestResults from './BacktestResults';
import PredictionResult from './PredictionResult';
import TradingChart from './TradingChart';

/**
 * StockDetailsPage
 * 
 * A reusable view for displaying full stock analysis including:
 * - Backtest Results
 * - AI Prediction Details
 * - Interactive Trading Chart
 */
export default function StockDetailsPage({ selected, onBack }) {
    if (!selected) return null;

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header / Nav */}
            <div className="flex items-center justify-between gap-4 p-4 rounded-2xl bg-[#050d1a] border border-white/5 shadow-xl">
                <button 
                    onClick={onBack}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition-all hover:bg-white/5 text-slate-400 hover:text-white border border-white/5"
                >
                    <ArrowLeft className="w-4 h-4" />
                    BACK TO LIST
                </button>
                
                <div className="flex items-center gap-3 pr-2">
                    <div className="text-right hidden sm:block">
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Analysis For</p>
                        <p className="text-sm font-black text-white">{selected.symbol}</p>
                    </div>
                    <div className="h-8 w-px bg-white/5 hidden sm:block" />
                    <div className={`px-4 py-1.5 rounded-xl text-[11px] font-black tracking-widest border shadow-lg ${
                        selected.prediction === 'BUY' ? 'bg-buy/20 text-buy border-buy/30 shadow-buy/10' : 
                        selected.prediction === 'SELL' ? 'bg-sell/20 text-sell border-sell/30 shadow-sell/10' : 
                        'bg-hold/20 text-hold border-hold/30 shadow-hold/10'
                    }`}>
                        {selected.prediction}
                    </div>
                </div>
            </div>

            {/* Layout Grid */}
            <div className="grid grid-cols-1 gap-6">
                {/* 1. Backtest Results — shown only when data is available */}
                {(selected.backtest || selected.backtest_stats) ? (
                    <div className="animate-in fade-in slide-in-from-top duration-500 delay-100">
                        <BacktestResults stats={selected.backtest || selected.backtest_stats} />
                    </div>
                ) : (
                    <div className="flex items-center gap-3 px-5 py-4 rounded-2xl bg-[#080f1a] border border-white/5 text-slate-600">
                        <span className="text-lg">📊</span>
                        <p className="text-xs font-bold">
                            Backtest data not available for this record. Re-run the scan on the Dashboard to generate updated results.
                        </p>
                    </div>
                )}

                {/* 2. Prediction Result Detail */}
                <div className="animate-in fade-in slide-in-from-top duration-500 delay-200">
                    <PredictionResult result={selected} />
                </div>

                {/* 3. Trading Chart */}
                <div className="animate-in fade-in slide-in-from-top duration-500 delay-300">
                    <TradingChart 
                        data={selected.chartData || []} 
                        prediction={selected.prediction}
                        symbol={selected.symbol}
                    />
                </div>
            </div>
        </div>
    );
}
