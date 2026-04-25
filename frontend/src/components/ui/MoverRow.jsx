import React from 'react';
import { fmt, fmtVol, chgColor } from '../../utils/formatters';

export default function MoverRow({ stock, isGainer, rank, mode, onNavigate }) {
    const isVolume   = mode === 'volume';
    const isTurnover = mode === 'turnover';
    const cc = isVolume ? '#8b5cf6' : isTurnover ? '#f59e0b' : chgColor(stock.change_pct);
    
    return (
        <button onClick={() => onNavigate('live', stock.symbol)}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 text-left group hover:-translate-y-[1px]"
            style={{ 
                background: 'rgba(255,255,255,0.02)', 
                border: '1px solid rgba(255,255,255,0.04)' 
            }}
            onMouseEnter={(e) => {
                e.currentTarget.style.background = `${cc}12`;
                e.currentTarget.style.borderColor = `${cc}30`;
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.02)';
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.04)';
            }}
        >
            <span className="w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-black shrink-0 bg-white/5 text-text-muted transition-colors group-hover:bg-white/10 group-hover:text-white">
                {rank}
            </span>
            <div className="flex-1 min-w-0">
                <p className="text-xs font-black text-white truncate transition-colors" style={{ '--tw-group-hover-color': cc, color: 'inherit' }}>
                    <span className="group-hover:!text-[var(--tw-group-hover-color)]">{stock.symbol}</span>
                </p>
                <p className="text-[10px] tabular-nums text-text-muted">Rs. {fmt(stock.ltp)}</p>
            </div>
            <span className="text-sm font-black tabular-nums shrink-0 drop-shadow-sm transition-transform group-hover:scale-105" style={{ color: cc }}>
                {isVolume   ? fmtVol(stock.volume)
                : isTurnover ? `Rs.${fmtVol(stock.turnover)}`
                : `${isGainer ? '+' : ''}${fmt(stock.change_pct)}%`}
            </span>
        </button>
    );
}
