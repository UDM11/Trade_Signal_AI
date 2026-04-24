import React, { useState, useEffect } from 'react';
import { BarChart3, Activity, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import CSVUploader from '../components/uploader';
import PredictionResult from '../components/prediction';
import TradingChart from '../components/chart';
import BacktestResults from '../components/backtest';
import DatasetStatsCard from '../components/dashboard/DatasetStatsCard';
import NewsInput from '../components/dashboard/NewsInput';
import ChartSkeleton from '../components/ui/ChartSkeleton';
import { api } from '../api';

export default function DashboardPage({ addToast, initialRecord }) {
    const [result,  setResult]  = useState(null);
    const [loading, setLoading] = useState(false);
    const [stats,   setStats]   = useState(null);
    const [newsText, setNewsText] = useState('');

    useEffect(() => {
        if (!initialRecord) return;
        const ai = initialRecord.ai_analysis || {};
        setResult({
            symbol:            initialRecord.stocks?.symbol || initialRecord.symbol || 'UNKNOWN',
            prediction:        initialRecord.prediction,
            confidence:        initialRecord.confidence_score ?? initialRecord.confidence,
            explanation:       initialRecord.explanation,
            target_price:      initialRecord.target_price      ?? null,
            stop_loss:         initialRecord.stop_loss          ?? null,
            estimated_days:    initialRecord.estimated_days     ?? null,
            target_pct:        initialRecord.target_pct         ?? null,
            stop_loss_pct:     initialRecord.stop_loss_pct      ?? null,
            risk_reward:       initialRecord.risk_reward         ?? null,
            all_proba:         initialRecord.all_proba           ?? null,
            indicators:        initialRecord.indicators          ?? null,
            model_metrics:     initialRecord.model_metrics       ?? null,
            ideal_entry:       ai.ideal_entry          ?? null,
            entry_zone_low:    ai.entry_zone_low       ?? null,
            entry_zone_high:   ai.entry_zone_high      ?? null,
            entry_condition:   ai.entry_condition      ?? null,
            target2:           ai.target2              ?? null,
            target2_pct:       ai.target2_pct          ?? null,
            trailing_stop:     ai.trailing_stop        ?? null,
            trailing_stop_pct: ai.trailing_stop_pct    ?? null,
            exit_condition:    ai.exit_condition       ?? null,
            risk_note:         ai.risk_note            ?? null,
            market_structure:  ai.market_structure     ?? null,
            chart_data:        initialRecord.chart_data       || [],
            signal_history:    initialRecord.signal_history   || [],
            backtest:          initialRecord.backtest_stats    || null,
        });
        if (initialRecord.chart_data?.length > 0) {
            setStats({
                SymbolInfo:     initialRecord.stocks?.symbol || 'UNKNOWN',
                RowsProcessed:  'From Database',
                LatestClose:    initialRecord.chart_data[initialRecord.chart_data.length - 1].close,
                IndicatorReady: 'Historical Record',
            });
        }
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }, [initialRecord]);

    const handleUploadComplete = async (file) => {
        setLoading(true);
        try {
            const uploadRes    = await api.uploadCSV(file);
            setStats(uploadRes.data.summary);
            const parsedSymbol = uploadRes.data.summary.SymbolInfo || file.name.replace(/\.[^.]+$/, '').toUpperCase();
            const predictRes   = await api.predict(parsedSymbol, newsText);
            setResult(predictRes.data);
            addToast({
                title:   `✓ Prediction generated for ${parsedSymbol}`,
                message: `Signal: ${predictRes.data.prediction} · Confidence: ${predictRes.data.confidence.toFixed(1)}%`,
                type:    'success',
            });
        } catch (err) {
            addToast({
                title:   'Prediction failed',
                message: err.response?.data?.detail || err.message || 'Please try again.',
                type:    'error',
                duration: 6000,
            });
            throw err;
        } finally {
            setLoading(false);
        }
    };

    return (
        <main className="max-w-7xl mx-auto space-y-4 md:space-y-6">

            {/* Row 1 — Upload + News | Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                <div className="flex flex-col gap-4">
                    <CSVUploader onUploadComplete={handleUploadComplete} />
                    <NewsInput value={newsText} onChange={setNewsText} />
                </div>
                <div className="flex flex-col">
                    {stats ? (
                        <DatasetStatsCard stats={stats} />
                    ) : (
                        <div className="flex-1 rounded-2xl flex flex-col items-center justify-center text-center p-8"
                            style={{ background: '#080f1a', border: '1px solid rgba(255,255,255,0.05)', minHeight: '100%' }}>
                            <div className="p-4 rounded-2xl mb-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.04)' }}>
                                <BarChart3 className="w-10 h-10" style={{ color: 'rgba(255,255,255,0.07)' }} />
                            </div>
                            <p className="text-sm font-semibold text-white">No Data Yet</p>
                            <p className="text-xs mt-1 text-white/70">Upload a file to see dataset stats.</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Row 1b — Backtest */}
            {result?.backtest && <BacktestResults stats={result.backtest} />}

            {/* Row 2 — Prediction Result */}
            {result ? (
                <PredictionResult result={result} />
            ) : (
                <div className="rounded-2xl p-8 flex flex-col items-center justify-center text-center min-h-40"
                    style={{ background: '#080f1a', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <div className="p-3 rounded-2xl mb-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.04)' }}>
                        <Activity className="w-10 h-10" style={{ color: 'rgba(255,255,255,0.07)' }} />
                    </div>
                    <p className="text-lg font-semibold text-white">Awaiting Prediction</p>
                    <p className="text-sm mt-1 text-white/70">Upload a stock CSV to get a BUY / SELL / HOLD signal.</p>
                </div>
            )}

            {/* Row 3 — Trading Chart */}
            <div className="rounded-2xl shadow-xl relative overflow-hidden h-[580px] sm:h-[720px] md:h-[860px]"
                style={{ background: '#080f1a', border: '1px solid rgba(255,255,255,0.05)' }}>
                {loading ? (
                    <ChartSkeleton />
                ) : result ? (
                    <TradingChart
                        data={result.chart_data}
                        prediction={result.prediction}
                        explanation={result.explanation}
                        signalHistory={result.signal_history}
                        targetPrice={result.target_price}
                        stopLoss={result.stop_loss}
                        estimatedDays={result.estimated_days}
                        targetPct={result.target_pct}
                        stopLossPct={result.stop_loss_pct}
                        riskReward={result.risk_reward}
                        idealEntry={result.ideal_entry}
                        entryZoneLow={result.entry_zone_low}
                        entryZoneHigh={result.entry_zone_high}
                        target2={result.target2}
                        target2Pct={result.target2_pct}
                        trailingStop={result.trailing_stop}
                    />
                ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-4 text-center px-6">
                        <div className="p-4 rounded-2xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.04)' }}>
                            <div className="flex gap-4">
                                <TrendingUp   className="w-7 h-7" style={{ color: 'rgba(16,185,129,0.2)' }} />
                                <TrendingDown className="w-7 h-7" style={{ color: 'rgba(239,68,68,0.2)' }} />
                                <Minus        className="w-7 h-7" style={{ color: 'rgba(234,179,8,0.2)' }} />
                            </div>
                        </div>
                        <p className="text-sm text-white/70">Chart will appear after prediction</p>
                    </div>
                )}
            </div>
        </main>
    );
}
