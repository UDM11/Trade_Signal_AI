import React, { createContext, useContext, useState, useEffect, useRef } from 'react';

const MarketContext = createContext({ marketData: null, connected: false });

export function MarketProvider({ children }) {
    const [marketData, setMarketData] = useState(null);
    const [connected, setConnected] = useState(false);
    const socketRef = useRef(null);

    useEffect(() => {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.hostname === 'localhost' ? 'localhost:8000' : window.location.host;
        const wsUrl = `${protocol}//${host}/ws/market`;

        function connect() {
            console.log('Connecting to Market WebSocket...');
            const ws = new WebSocket(wsUrl);
            socketRef.current = ws;

            ws.onopen = () => {
                console.log('Market WebSocket connected');
                setConnected(true);
            };

            ws.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data);
                    if (message.type === 'MARKET_UPDATE') {
                        setMarketData(message.data);
                    }
                } catch (e) {
                    console.error('Error parsing WebSocket message:', e);
                }
            };

            ws.onclose = () => {
                console.log('Market WebSocket disconnected');
                setConnected(false);
                // Simple reconnect logic after 3 seconds
                setTimeout(connect, 3000);
            };

            ws.onerror = (err) => {
                console.error('Market WebSocket error:', err);
                ws.close();
            };
        }

        connect();

        return () => {
            if (socketRef.current) {
                socketRef.current.close();
            }
        };
    }, []);

    return (
        <MarketContext.Provider value={{ marketData, connected }}>
            {children}
        </MarketContext.Provider>
    );
}

export function useMarketSocket() {
    return useContext(MarketContext);
}
