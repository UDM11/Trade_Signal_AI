import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../../api';
import './live.css';

// Hooks
import { useMarketData } from './useMarketData';

// Sub-components
import CountdownRing from './CountdownRing';
import MarketStatsBar from './MarketStatsBar';
import MoversSection from './MoversSection';
import MarketTable from './MarketTable';
import StockDetailPanel from './StockDetailPanel';
import NepseChartSection from './NepseChartSection';

export default function LiveMarket() {
    const data = useMarketData();
    const [selectedSymbol, setSelectedSymbol] = useState(null);
    const [chartData, setChartData] = useState([]);
    const [chartLoading, setChartLoading] = useState(false);
    const [predictions, setPredictions] = useState([]);
    const [selectedPrediction, setSelectedPrediction] = useState(null);

    // Sync selected stock with live data
    const currentStock = useMemo(() => {
        if (!selectedSymbol) return null;
        return data.stocks.find(s => s.symbol === selectedSymbol);
    }, [selectedSymbol, data.stocks]);

    // Fetch predictions on mount
    useEffect(() => {
        const fetchPredictions = async () => {
            try {
                const res = await api.getHistory();
                setPredictions(res.data.data || []);
            } catch (e) {
                console.error("Failed to fetch predictions", e);
            }
        };
        fetchPredictions();
    }, []);

    // Handle stock selection
    const handleSelect = async (stock) => {
        setSelectedSymbol(stock.symbol);
        setChartLoading(true);
        
        // Find cached prediction for this symbol
        const pred = predictions.find(p => 
            (p.stocks?.symbol?.toUpperCase() === stock.symbol.toUpperCase()) || 
            (p.symbol?.toUpperCase() === stock.symbol.toUpperCase())
        );
        setSelectedPrediction(pred || null);

        try {
            const res = await api.getNepseChart(stock.symbol);
            setChartData(res.data.chart_data || []);
        } catch (e) {
            console.error("Failed to fetch chart", e);
        } finally {
            setChartLoading(false);
        }
    };

    if (!data.stocks.length && !data.connected) {
        return <LiveMarketSkeleton />;
    }

    return (
        <div className="max-w-7xl mx-auto space-y-6 pb-20">
            {currentStock ? (
                <StockDetailPanel 
                    stock={currentStock} 
                    chartData={chartData} 
                    chartLoading={chartLoading}
                    prediction={selectedPrediction}
                    onClose={() => setSelectedSymbol(null)}
                    onSwitch={handleSelect}
                />
            ) : (
                <>
                    {/* Top Stats Bar (Requested Premium Design) */}
                    <MarketStatsBar summary={data.summary} />

                    {/* Main Chart Section */}
                    <NepseChartSection data={data.nepseChart} index={data.index} onSelect={handleSelect} />

                    {/* Top Movers Grid */}
                    <MoversSection 
                        gainers={data.movers.gainers} 
                        losers={data.movers.losers} 
                        turnovers={data.movers.turnovers} 
                        volumes={data.movers.volumes} 
                        onSelect={handleSelect} 
                    />

                    {/* All Stocks Table */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h2 className="text-xl font-black text-white">Live Market</h2>
                            <div className="flex items-center gap-3">
                                <span className="text-[10px] font-bold text-text-muted uppercase tracking-widest">
                                    Last Updated: {data.lastUpdated}
                                </span>
                                <CountdownRing refreshing={data.refreshing} />
                            </div>
                        </div>
                        <MarketTable 
                            stocks={data.filteredStocks} 
                            sort={data.sort} 
                            setSort={data.setSort} 
                            onSelect={handleSelect} 
                        />
                    </div>
                </>
            )}
        </div>
    );
}

function LiveMarketSkeleton() {
    return (
        <div className="max-w-7xl mx-auto space-y-8 animate-pulse">
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
                {[...Array(4)].map((_, i) => <div key={i} className="h-32 rounded-2xl bg-white/5" />)}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
                {[...Array(4)].map((_, i) => <div key={i} className="h-64 rounded-2xl bg-white/5" />)}
            </div>
            <div className="h-96 rounded-2xl bg-white/5" />
        </div>
    );
}
