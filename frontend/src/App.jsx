import React, { useState, useEffect } from 'react';
import Navbar from './components/ui/Navbar';
import HomePage from './pages/HomePage';
import DashboardPage from './pages/DashboardPage';
import LiveMarketPage from './pages/LiveMarketPage';
import HistoryPage from './pages/HistoryPage';
import Toast from './components/ui/Toast';
import { useToast } from './hooks/useToast';

function getPageFromUrl() {
    const path = window.location.pathname;
    if (path === '/live' || path.startsWith('/live/')) return 'live';
    if (path === '/signal') return 'dashboard';
    if (path === '/history' || path.startsWith('/history/')) return 'history';
    return 'home';
}

export default function App() {
    const [page, setPage] = useState(getPageFromUrl);
    const { toasts, add: addToast, remove: removeToast } = useToast();

    const navigate = (key) => {
        setPage(key);
        const path = key === 'live' ? '/live' : key === 'dashboard' ? '/signal' : key === 'history' ? '/history' : '/';
        window.history.pushState({ page: key }, '', path);
    };

    useEffect(() => {
        const onPop = () => setPage(getPageFromUrl());
        window.addEventListener('popstate', onPop);
        return () => window.removeEventListener('popstate', onPop);
    }, []);

    return (
        <div className="min-h-screen bg-background text-text font-sans selection:bg-primary/30">
            <Navbar page={page} setPage={navigate} />
            <div className="p-4 sm:p-6 md:p-8">
                {page === 'home'      && <HomePage setPage={navigate} />}
                {page === 'dashboard' && <DashboardPage addToast={addToast} />}
                {page === 'live'      && <LiveMarketPage />}
                {page === 'history'   && <HistoryPage />}
            </div>
            <Toast toasts={toasts} remove={removeToast} />
        </div>
    );
}
