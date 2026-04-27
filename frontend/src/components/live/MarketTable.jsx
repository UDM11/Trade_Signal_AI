import React, { useState, useEffect, useRef } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { fmt, fmtVol, chgColor } from '../../utils/formatters';

const COLS = [
    { key: 'symbol',     label: 'Symbol',  numeric: false },
    { key: 'ltp',        label: 'LTP',     numeric: true  },
    { key: 'change',     label: 'Chg',     numeric: true  },
    { key: 'change_pct', label: '%',        numeric: true  },
    { key: 'open',       label: 'Open',    numeric: true  },
    { key: 'high',       label: 'High',    numeric: true  },
    { key: 'low',        label: 'Low',     numeric: true  },
    { key: 'volume',     label: 'Volume',  numeric: true  },
];

function SortIcon({ col, sort }) {
    if (sort.key !== col) return <ChevronUp className="w-3 h-3 opacity-20" />;
    return sort.dir === 1
        ? <ChevronUp className="w-3 h-3 text-blue-400" />
        : <ChevronDown className="w-3 h-3 text-blue-400" />;
}

function StockRow({ stock, onSelect, prediction }) {
    const cc = chgColor(stock.change);
    const prevLtpRef = useRef(stock.ltp);
    const [flashClass, setFlashClass] = useState('');

    useEffect(() => {
        if (stock.ltp !== prevLtpRef.current && stock.ltp > 0) {
            setFlashClass(stock.ltp > prevLtpRef.current ? 'flash-up' : 'flash-down');
            const t = setTimeout(() => setFlashClass(''), 1000);
            prevLtpRef.current = stock.ltp;
            return () => clearTimeout(t);
        }
    }, [stock.ltp]);

    const pctAbs = Math.abs(stock.change_pct ?? 0);
    const barColor = stock.change > 0 ? 'rgba(34,197,94,0.18)' : stock.change < 0 ? 'rgba(239,68,68,0.15)' : 'rgba(100,116,139,0.12)';

    return (
        <tr onClick={() => onSelect(stock)}
            className={`cursor-pointer border-t group transition-colors hover:bg-white/5 ${flashClass}`}
            style={{ borderColor: 'var(--color-glass-border)' }}>
            <td className="px-1.5 sm:px-4 py-1.5 sm:py-3 sticky left-0 bg-[#0f172a] sm:bg-transparent z-10">
                <div className="flex items-center gap-1.5 sm:gap-2">
                    <span className="font-black text-white text-[11px] sm:text-sm">{stock.symbol}</span>
                </div>
                {stock.name && <p className="text-[7px] sm:text-xs text-text-muted truncate max-w-[60px] sm:max-w-35 mt-0.5">{stock.name}</p>}
            </td>
            <td className="px-1.5 sm:px-4 py-1.5 sm:py-3 font-bold tabular-nums text-[10px] sm:text-sm text-right" style={{ color: cc }}>{fmt(stock.ltp)}</td>
            <td className="px-1.5 sm:px-4 py-1.5 sm:py-3 font-semibold tabular-nums text-[10px] sm:text-sm text-right hidden sm:table-cell" style={{ color: cc }}>
                {stock.change >= 0 ? '+' : ''}{fmt(stock.change)}
            </td>
            <td className="px-1.5 sm:px-4 py-1.5 sm:py-3 text-right">
                <div className="flex items-center justify-end gap-1.5 sm:gap-2">
                    <span className="font-bold px-1.5 py-0.5 rounded text-[8px] sm:text-xs tabular-nums"
                        style={{ color: cc, background: `${cc}10`, border: `1px solid ${cc}25` }}>
                        {stock.change_pct >= 0 ? '+' : ''}{fmt(stock.change_pct)}%
                    </span>
                </div>
            </td>
            <td className="px-4 py-3 tabular-nums text-sm text-right text-text-muted/60 hidden lg:table-cell">{fmt(stock.open)}</td>
            <td className="px-4 py-3 tabular-nums text-sm text-right text-bullish hidden lg:table-cell">{fmt(stock.high)}</td>
            <td className="px-4 py-3 tabular-nums text-sm text-right text-bearish hidden lg:table-cell">{fmt(stock.low)}</td>
            <td className="px-4 py-3 tabular-nums text-sm text-right text-text-muted hidden lg:table-cell">{fmtVol(stock.volume)}</td>
            <td className="px-4 py-3 text-right">
                <button
                    className="px-1.5 sm:px-3 py-0.5 sm:py-1 rounded-lg text-[9px] sm:text-xs font-bold transition-all"
                    style={{ background: 'rgba(59,130,246,0.08)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.18)' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(59,130,246,0.18)'; e.currentTarget.style.borderColor = 'rgba(59,130,246,0.4)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(59,130,246,0.08)'; e.currentTarget.style.borderColor = 'rgba(59,130,246,0.18)'; }}
                    onClick={e => { e.stopPropagation(); onSelect(stock); }}
                >
                    View
                </button>
            </td>
        </tr>
    );
}

export default function MarketTable({ stocks, sort, setSort, onSelect, predictions }) {
    const toggleSort = (key) => {
        setSort(prev => prev.key === key ? { key, dir: -prev.dir } : { key, dir: -1 });
    };

    return (
        <div className="rounded-2xl overflow-hidden transition-shadow duration-300 hover:shadow-[0_8px_30px_rgba(0,0,0,0.3)]" style={{ background: 'var(--color-glass)', border: '1px solid var(--color-glass-border)' }}>
            <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-left border-collapse">
                    <thead className="border-b border-white/5" style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.01) 100%)' }}>
                        <tr>
                            {COLS.map(c => (
                                <th key={c.key} onClick={() => toggleSort(c.key)}
                                    className={`px-2 sm:px-4 py-2 sm:py-3 text-[8px] sm:text-xs font-black uppercase tracking-widest cursor-pointer select-none text-text-muted hover:text-white transition-colors 
                                    ${c.numeric ? 'text-right' : ''} 
                                    ${['open', 'high', 'low', 'volume'].includes(c.key) ? 'hidden lg:table-cell' : ''}
                                    ${c.key === 'change' ? 'hidden sm:table-cell' : ''}`}>
                                    <div className={`flex items-center gap-1.5 ${c.numeric ? 'justify-end' : ''}`}>
                                        {c.label} <SortIcon col={c.key} sort={sort} />
                                    </div>
                                </th>
                            ))}
                            <th className="px-2 sm:px-4 py-2 sm:py-3 text-[8px] sm:text-xs font-black uppercase tracking-widest text-text-muted text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {stocks.map(s => {
                            const pred = (predictions || []).find(p =>
                                (p.stocks?.symbol?.toUpperCase() === s.symbol.toUpperCase()) ||
                                (p.symbol?.toUpperCase() === s.symbol.toUpperCase())
                            );
                            return <StockRow key={s.symbol} stock={s} onSelect={onSelect} prediction={pred} />;
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
