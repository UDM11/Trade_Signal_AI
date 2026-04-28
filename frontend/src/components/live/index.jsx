import React, { useState, useEffect, useMemo, useCallback } from 'react';
import './live.css';
import { api } from '../../api';
import { getCached, fetchPredictions, isStale } from '../../cache/predictionsCache';

// Hooks
import { useMarketData } from './useMarketData';

// Sub-components
import CountdownRing from './CountdownRing';
import MarketStatsBar from './MarketStatsBar';
import MoversSection from './MoversSection';
import MarketTable from './MarketTable';
import StockDetailPanel from './StockDetailPanel';
import NepseChartSection from './NepseChartSection';

export default function LiveMarket({ initialSymbol }) {
    const data = useMarketData();
    const [selectedSymbol, setSelectedSymbol] = useState(null);
    const [chartData, setChartData] = useState([]);
    const [chartLoading, setChartLoading] = useState(false);
    const [predictions, setPredictions] = useState(() => getCached() || []);

    // Sync selected stock with live data
    const currentStock = useMemo(() => {
        if (!selectedSymbol) return null;
        if (selectedSymbol === 'NEPSE') {
            return {
                symbol: 'NEPSE',
                name: 'NEPSE Index',
                ltp: data.index?.value || 0,
                change: data.index?.change || 0,
                change_pct: data.index?.change_pct || 0,
                open: data.index?.open || data.index?.value || 0,
                high: data.index?.high || data.index?.value || 0,
                low: data.index?.low || data.index?.value || 0,
                volume: data.summary?.total_volume || 0,
            };
        }
        return data.stocks.find(s => s.symbol.toUpperCase() === selectedSymbol.toUpperCase());
    }, [selectedSymbol, data.stocks, data.index]);

    // Find cached prediction for the selected symbol
    const selectedPrediction = useMemo(() => {
        if (!selectedSymbol) return null;
        return predictions.find(p => 
            (p.stocks?.symbol?.toUpperCase() === selectedSymbol.toUpperCase()) || 
            (p.symbol?.toUpperCase() === selectedSymbol.toUpperCase())
        );
    }, [selectedSymbol, predictions]);
 
    // Handle stock selection
    const handleSelect = useCallback(async (stock) => {
        if (!stock?.symbol) return;
        setSelectedSymbol(stock.symbol);
        setChartLoading(true);

        try {
            const res = await api.getNepseChart(stock.symbol);
            setChartData(res.data.chart_data || []);
        } catch (e) {
            console.error("Failed to fetch chart", e);
        } finally {
            setChartLoading(false);
        }
    }, [predictions]);

    // Sync predictions from shared cache — instant if already loaded by another page
    useEffect(() => {
        if (isStale()) {
            fetchPredictions().then(data => setPredictions(data)).catch(() => {});
        }
    }, []);

    // Sync initialSymbol from prop — but only when it actually changes from outside
    const lastInitialSymbol = React.useRef(initialSymbol);
    useEffect(() => {
        if (!data.stocks.length) return;
        
        // Only trigger if initialSymbol prop changed from what we last saw
        if (initialSymbol !== lastInitialSymbol.current) {
            lastInitialSymbol.current = initialSymbol;
            
            if (!initialSymbol) {
                setSelectedSymbol(null);
                return;
            }

            // Special case for NEPSE index
            if (initialSymbol === 'NEPSE') {
                handleSelect({ symbol: 'NEPSE' });
                return;
            }

            const stock = data.stocks.find(s => s.symbol.toUpperCase() === initialSymbol.toUpperCase());
            if (stock) {
                handleSelect(stock);
            }
        }
    }, [initialSymbol, data.stocks.length, handleSelect]);

    if (!data.stocks.length && !data.connected) {
        return <LiveMarketSkeleton />;
    }

    return (
        <div className="max-w-[1600px] mx-auto space-y-4 sm:space-y-6 pb-20 px-0 sm:px-8">
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
                <div className="px-4 sm:px-0 space-y-4 sm:space-y-6">
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
                        predictions={predictions}
                    />

                    {/* All Stocks Table with Search */}
                    <div className="space-y-3 sm:space-y-4 pt-2 sm:pt-4">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4">
                            <h2 className="text-[11px] sm:text-xl font-black text-white flex items-center gap-1.5 sm:gap-2 uppercase tracking-tight">
                                <span className="w-1 h-4 sm:w-2 sm:h-6 bg-blue-500 rounded-full"></span>
                                Live Market Terminal
                            </h2>
                            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
                                <div className="relative group flex-1 sm:w-64">
                                    <div className="absolute inset-y-0 left-2.5 flex items-center pointer-events-none text-text-muted group-focus-within:text-blue-400 transition-colors">
                                        <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                                    </div>
                                    <input 
                                        type="text"
                                        placeholder="SEARCH STOCK (E.G. NICA, AHPC...)"
                                        value={data.search}
                                        onChange={(e) => data.setSearch(e.target.value)}
                                        className="w-full bg-white/5 border border-white/10 rounded-lg sm:rounded-xl py-2 sm:py-2 pl-8 sm:pl-10 pr-4 text-[10px] sm:text-xs font-bold text-white focus:outline-none focus:border-blue-500/50 focus:bg-white/10 transition-all placeholder:text-text-muted/50"
                                    />
                                </div>
                                <div className="flex items-center justify-between sm:justify-start gap-2 bg-white/5 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg sm:rounded-xl border border-white/10">
                                    <div className="flex flex-col items-end">
                                        <div className="flex items-center gap-1.5">
                                            <span className="relative flex h-1.5 w-1.5">
                                                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${data.connected ? 'bg-green-400' : 'bg-red-400'} opacity-75`}></span>
                                                <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${data.connected ? 'bg-green-500' : 'bg-red-500'}`}></span>
                                            </span>
                                            <span className="text-[7px] sm:text-[9px] font-black text-white uppercase tracking-tighter">
                                                {data.connected ? 'System Live' : 'Reconnecting'}
                                            </span>
                                        </div>
                                        <span className="text-[8px] sm:text-[10px] font-bold text-text-muted uppercase tracking-widest leading-none mt-0.5">
                                            Last Sync: {data.lastUpdated}
                                        </span>
                                    </div>
                                    <CountdownRing refreshing={data.refreshing} />
                                </div>
                            </div>
                        </div>
                        <MarketTable 
                            stocks={data.filteredStocks} 
                            sort={data.sort} 
                            setSort={data.setSort} 
                            onSelect={handleSelect} 
                            predictions={predictions}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}

function LiveMarketSkeleton() {
    return (
        <div className="max-w-[1600px] mx-auto space-y-8 animate-pulse">
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
