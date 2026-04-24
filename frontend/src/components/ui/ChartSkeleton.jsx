import React from 'react';

export default function ChartSkeleton() {
    return (
        <div className="w-full h-full flex flex-col bg-surface rounded-xl overflow-hidden animate-pulse">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-white/5 shrink-0">
                <div className="h-5 w-24 bg-white/10 rounded" />
                <div className="h-4 w-16 bg-white/5 rounded" />
                <div className="ml-auto h-5 w-12 bg-white/10 rounded-full" />
            </div>
            <div className="flex items-center gap-2 px-4 py-2 border-b border-white/5 shrink-0">
                {[...Array(6)].map((_, i) => <div key={i} className="h-6 w-10 bg-white/5 rounded-md" />)}
                <div className="w-px h-4 bg-white/10 mx-1" />
                {[...Array(4)].map((_, i) => <div key={i} className="h-6 w-12 bg-white/5 rounded-lg" />)}
            </div>
            <div className="flex-1 flex items-end gap-1 px-6 pb-8 pt-4">
                {[...Array(40)].map((_, i) => {
                    const h = 20 + Math.sin(i * 0.7) * 15 + Math.sin(i * 0.3) * 10;
                    return (
                        <div key={i} className="flex-1 flex flex-col items-center justify-end gap-0.5">
                            <div className="w-px bg-white/10" style={{ height: `${h + 10}%` }} />
                            <div className={`w-full rounded-sm ${i % 3 === 0 ? 'bg-sell/30' : 'bg-buy/20'}`} style={{ height: `${h}%` }} />
                        </div>
                    );
                })}
            </div>
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 pointer-events-none">
                <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                <p className="text-xs text-text-muted font-medium">Generating chart...</p>
            </div>
        </div>
    );
}
