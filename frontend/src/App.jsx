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

function getPageFromUrl() {
    const path = window.location.pathname;
    if (path === '/live'    || path.startsWith('/live/'))    return 'live';
    if (path === '/signal')                                  return 'dashboard';
    if (path === '/history' || path.startsWith('/history/')) return 'history';
    if (path === '/screener')                                return 'screener';
    return 'home';
}

export default function App() {
    const [page, setPage] = useState(getPageFromUrl);
    const [screenerRecord, setScreenerRecord] = useState(null);

    const navigate = (key) => {
        setPage(key);
        const paths = { live: '/live', dashboard: '/signal', history: '/history', screener: '/screener' };
        window.history.pushState({ page: key }, '', paths[key] ?? '/');
    };

    useEffect(() => {
        const onPop = () => setPage(getPageFromUrl());
        window.addEventListener('popstate', onPop);
        return () => window.removeEventListener('popstate', onPop);
    }, []);

    const handleScreenerSelect = (record) => {
        setScreenerRecord(record);
        navigate('dashboard');
    };

    return (
        <ToastProvider>
            <MarketProvider>
                <div className="min-h-screen bg-background text-text font-sans selection:bg-primary/30">
                    <Navbar page={page} setPage={navigate} />
                    <div className="p-4 sm:p-6 md:p-8">
                        {page === 'home'      && <HomePage setPage={navigate} />}
                        {page === 'dashboard' && <SignalPage initialRecord={screenerRecord} />}
                        {page === 'live'      && <LiveMarketPage />}
                        {page === 'history'   && <HistoryPage />}
                        {page === 'screener'  && <ScreenerPage onSelectStock={handleScreenerSelect} />}
                    </div>
                </div>
            </MarketProvider>
        </ToastProvider>
    );
}
