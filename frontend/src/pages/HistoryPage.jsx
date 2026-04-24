import React, { useState, useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import HistoryTable from '../components/history';
import PredictionResult from '../components/prediction';
import TradingChart from '../components/chart';
import BacktestResults from '../components/backtest';

function buildResult(record) {
    const ai = record.ai_analysis || {};
    return {
        symbol:            record.stocks?.symbol || record.symbol || 'UNKNOWN',
        prediction:        record.prediction,
        confidence:        record.confidence_score ?? record.confidence,
        explanation:       record.explanation,
        target_price:      record.target_price      ?? null,
        stop_loss:         record.stop_loss          ?? null,
        estimated_days:    record.estimated_days     ?? null,
        target_pct:        record.target_pct         ?? null,
        stop_loss_pct:     record.stop_loss_pct      ?? null,
        risk_reward:       record.risk_reward         ?? null,
        all_proba:         record.all_proba           ?? null,
        indicators:        record.indicators          ?? null,
        model_metrics:     record.model_metrics       ?? null,
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
        chart_data:        record.chart_data       || [],
        signal_history:    record.signal_history   || [],
        backtest:          record.backtest_stats    || null,
    };
}

export default function HistoryPage() {
    const [selected, setSelected] = useState(null);

    // Read symbol from URL on mount
    useEffect(() => {
        const match = window.location.pathname.match(/^\/history\/(.+)$/);
        if (!match) setSelected(null);
        // If URL has a symbol but we have no record yet, HistoryTable will handle it
    }, []);

    // Handle browser back
    useEffect(() => {
        const onPop = () => {
            const match = window.location.pathname.match(/^\/history\/(.+)$/);
            if (!match) setSelected(null);
        };
        window.addEventListener('popstate', onPop);
        return () => window.removeEventListener('popstate', onPop);
    }, []);

    const handleSelect = (record) => {
        const result = buildResult(record);
        setSelected(result);
        const sym = record.stocks?.symbol || record.symbol || 'UNKNOWN';
        window.history.pushState({ sym }, '', `/history/${sym}`);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleBack = () => {
        setSelected(null);
        window.history.pushState({}, '', '/history');
    };

    if (selected) {
        return (
            <main className="max-w-7xl mx-auto space-y-4 md:space-y-6">
                {/* Back button */}
                <button onClick={handleBack}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#94a3b8' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}>
                    <ArrowLeft className="w-4 h-4" />
                    Back to History
                </button>

                {/* Backtest */}
                {selected.backtest && <BacktestResults stats={selected.backtest} />}

                {/* Prediction result */}
                <PredictionResult result={selected} />

                {/* Chart */}
                <div className="rounded-2xl shadow-xl relative overflow-hidden h-[580px] sm:h-[720px] md:h-[860px]"
                    style={{ background: '#080f1a', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <TradingChart
                        data={selected.chart_data}
                        prediction={selected.prediction}
                        explanation={selected.explanation}
                        signalHistory={selected.signal_history}
                        targetPrice={selected.target_price}
                        stopLoss={selected.stop_loss}
                        estimatedDays={selected.estimated_days}
                        targetPct={selected.target_pct}
                        stopLossPct={selected.stop_loss_pct}
                        riskReward={selected.risk_reward}
                        idealEntry={selected.ideal_entry}
                        entryZoneLow={selected.entry_zone_low}
                        entryZoneHigh={selected.entry_zone_high}
                        target2={selected.target2}
                        target2Pct={selected.target2_pct}
                        trailingStop={selected.trailing_stop}
                    />
                </div>
            </main>
        );
    }

    return (
        <main className="max-w-7xl mx-auto">
            <HistoryTable refreshTrigger={0} onHistoryClick={handleSelect} />
        </main>
    );
}
