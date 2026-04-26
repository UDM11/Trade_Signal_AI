import React, { useState, useEffect, useRef } from 'react';
import { fmt, fmtVol, chgColor } from '../../utils/formatters';

export default function LiveMoverRow({ stock, isGainer, rank, maxPct, mode, onClick, prediction }) {
    const isTurnover = mode === 'turnover';
    const isVolume   = mode === 'volume';
    const cc = isVolume ? '#8b5cf6' : isTurnover ? '#f59e0b' : chgColor(stock.change_pct);

    const prevLtpRef = useRef(stock.ltp);
    const [flashClass, setFlashClass] = useState('');

    useEffect(() => {
        if (stock.ltp !== prevLtpRef.current && stock.ltp > 0) {
            const isUp = stock.ltp > prevLtpRef.current;
            setFlashClass(isUp ? 'flash-up' : 'flash-down');
            const t = setTimeout(() => setFlashClass(''), 1000);
            prevLtpRef.current = stock.ltp;
            return () => clearTimeout(t);
        }
    }, [stock.ltp]);

    return (
        <button
            onClick={() => onClick(stock)}
            className={`group w-full flex items-center gap-2 sm:gap-3 px-2 sm:px-3 py-1.5 sm:py-2.5 rounded-lg sm:rounded-xl transition-all duration-200 text-left hover:-translate-y-[1px] ${flashClass}`}
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
            <span className="w-4 h-4 sm:w-5 sm:h-5 rounded-md flex items-center justify-center text-[8px] sm:text-[10px] font-black shrink-0 bg-white/5 text-text-muted transition-colors group-hover:bg-white/10 group-hover:text-white uppercase">
                {rank}
            </span>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 sm:gap-2">
                    <p className="text-[10px] sm:text-xs font-black text-white truncate transition-colors uppercase" style={{ '--tw-group-hover-color': cc, color: 'inherit' }}>
                        <span className="group-hover:!text-[var(--tw-group-hover-color)]">{stock.symbol}</span>
                    </p>
                </div>
                <p className="text-[9px] sm:text-xs tabular-nums text-text-muted/80">Rs.{fmt(stock.ltp)}</p>
            </div>
            <span className="text-xs sm:text-sm font-black tabular-nums shrink-0 drop-shadow-sm transition-transform group-hover:scale-105" style={{ color: cc }}>
                {isVolume   ? fmtVol(stock.volume)
                : isTurnover ? `Rs.${fmtVol(stock.turnover)}`
                : `${isGainer ? '+' : ''}${fmt(stock.change_pct)}%`}
            </span>
        </button>
    );
}
