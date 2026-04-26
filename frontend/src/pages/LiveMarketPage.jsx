import React from 'react';
import LiveMarket from '../components/live';

export default function LiveMarketPage({ symbol }) {
    return <LiveMarket initialSymbol={symbol} />;
}
