import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { api } from '../api';

const MarketContext = createContext({ marketData: null, connected: false });

export function MarketProvider({ children }) {
    const [marketData, setMarketData] = useState(null);
    const [connected, setConnected] = useState(false);
    const socketRef = useRef(null);
    const seededRef = useRef(false);

    useEffect(() => {
        // HTTP pre-seed: get market data immediately so pages render without waiting for socket
        api.getNepseLive()
            .then(res => {
                if (res.data && !seededRef.current) {
                    seededRef.current = true;
                    setMarketData(res.data);
                }
            })
            .catch(() => {});

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        const host = isLocal ? '127.0.0.1:8000' : window.location.host;
        const wsUrl = `${protocol}//${host}/ws/market`;

        function connect() {
            const ws = new WebSocket(wsUrl);
            socketRef.current = ws;

            ws.onopen = () => {
                setConnected(true);
            };

            ws.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data);
                    if (message.type === 'MARKET_UPDATE') {
                        seededRef.current = true;
                        setMarketData(message.data);
                    }
                } catch (e) {
                    console.error('Error parsing WebSocket message:', e);
                }
            };

            ws.onclose = () => {
                setConnected(false);
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
