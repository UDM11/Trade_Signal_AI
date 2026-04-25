import { useState, useEffect, useCallback, useMemo } from 'react';
import { api } from '../../api';
import { useMarketSocket } from '../../hooks/useMarketSocket.jsx';

export function useMarketData() {
    const { marketData, connected } = useMarketSocket();
    const stocks = marketData?.stocks || [];
    const summary = marketData?.summary || {};
    const lastUpdated = marketData?.last_updated || 'Just now';
    const nepseChart = useMemo(() => {
        const raw = marketData?.nepse_chart || [];
        return raw.map(d => {
            const ts = parseInt(d[0]);
            // If it's a timestamp in seconds (NEPSE often uses seconds), format it
            // NEPSE Index Graph usually returns Unix timestamps
            const date = new Date(ts * 1000);
            return {
                time: date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }),
                fullTime: date.toLocaleString(),
                value: parseFloat(d[1])
            };
        }).filter(d => !isNaN(d.value));
    }, [marketData?.nepse_chart]);

    const [search, setSearch] = useState('');
    const [sort, setSort] = useState({ key: 'turnover', dir: -1 });
    const [refreshing, setRefreshing] = useState(false);

    const refresh = useCallback(async () => {
        setRefreshing(true);
        try {
            await api.getMarketSummary(); // Trigger manual poll if socket is slow
        } finally {
            setTimeout(() => setRefreshing(false), 800);
        }
    }, []);

    const filteredStocks = useMemo(() => {
        const q = search.trim().toUpperCase();
        let list = q
            ? stocks.filter(s => s.symbol.includes(q) || (s.name || '').toUpperCase().includes(q))
            : stocks;

        return [...list].sort((a, b) => {
            const av = a[sort.key] ?? 0;
            const bv = b[sort.key] ?? 0;
            if (typeof av === 'string') return sort.dir * av.localeCompare(bv);
            return sort.dir * (av - bv);
        });
    }, [stocks, search, sort]);

    const movers = useMemo(() => {
        // Create copies to avoid mutating
        const sorted = [...stocks].filter(s => s.ltp > 0);
        return {
            gainers:   [...sorted].sort((a, b) => (b.change_pct ?? 0) - (a.change_pct ?? 0)),
            losers:    [...sorted].sort((a, b) => (a.change_pct ?? 0) - (b.change_pct ?? 0)),
            turnovers: [...sorted].sort((a, b) => (b.turnover ?? 0)   - (a.turnover ?? 0)),
            volumes:   [...sorted].sort((a, b) => (b.volume ?? 0)     - (a.volume ?? 0))
        };
    }, [stocks]);

    return {
        stocks,
        summary,
        index: marketData?.index,
        connected,
        lastUpdated,
        nepseChart,
        search,
        setSearch,
        sort,
        setSort,
        refreshing,
        refresh,
        filteredStocks,
        movers
    };
}
