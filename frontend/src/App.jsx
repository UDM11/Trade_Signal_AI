import React, { useState, useEffect } from 'react';
import Navbar from './components/ui/Navbar';
import HomePage from './pages/HomePage';
import SignalPage from './pages/SignalPage';
import LiveMarketPage from './pages/LiveMarketPage';
import HistoryPage from './pages/HistoryPage';
import ScreenerPage from './pages/ScreenerPage';
import Toast from './components/ui/Toast';
import { ToastProvider } from './contexts/ToastContext';
import { MarketProvider } from './hooks/useMarketSocket.jsx';
import { api } from './api';

function getPageInfoFromUrl() {
    const path = window.location.pathname;
    const parts = path.split('/').filter(Boolean);
    
    let page = 'home';
    let symbol = null;

    if (parts[0] === 'live') {
        page = 'live';
        symbol = parts[1] || null;
    } else if (parts[0] === 'signal') {
        page = 'dashboard';
    } else if (parts[0] === 'history') {
        page = 'history';
        symbol = parts[1] || null;
    } else if (parts[0] === 'screener') {
        page = 'screener';
    }

    return { page, symbol };
}

export default function App() {
    const [{ page, symbol }, setUrlInfo] = useState(getPageInfoFromUrl());

    const navigate = (key, sub = null) => {
        const paths = { home: '/', live: '/live', dashboard: '/signal', history: '/history', screener: '/screener' };
        let fullPath = paths[key] ?? '/';
        if (sub) fullPath += `/${sub}`;
        
        window.history.pushState({ page: key, symbol: sub }, '', fullPath);
        setUrlInfo({ page: key, symbol: sub });
    };

    useEffect(() => {
        const onPop = () => setUrlInfo(getPageInfoFromUrl());
        window.addEventListener('popstate', onPop);
        return () => window.removeEventListener('popstate', onPop);
    }, []);

    useEffect(() => {
        // Trigger EOD Sync when app opens after market close
        api.syncEOD().catch(err => console.error("Auto-sync check failed:", err));
    }, []);


    return (
        <ToastProvider>
            <MarketProvider>
                <div className="min-h-screen bg-background text-text font-sans selection:bg-primary/30 overflow-x-hidden">
                    <Navbar page={page} setPage={navigate} />
                    <main className="mx-auto w-full">
                        {/* Pages stay mounted — CSS hide/show preserves state & avoids remount delays */}
                        <div className={page === 'home'      ? '' : 'hidden'}><HomePage setPage={navigate} /></div>
                        <div className={page === 'dashboard' ? '' : 'hidden'}><SignalPage /></div>
                        <div className={page === 'live'      ? '' : 'hidden'}><LiveMarketPage symbol={symbol} /></div>
                        <div className={page === 'history'   ? '' : 'hidden'}><HistoryPage symbol={symbol} /></div>
                        <div className={page === 'screener'  ? '' : 'hidden'}><ScreenerPage /></div>
                    </main>
                </div>
            </MarketProvider>
        </ToastProvider>
    );
}
