import React from 'react';
import { Activity } from 'lucide-react';

export default function NewsInput({ value, onChange }) {
    return (
        <div className="rounded-2xl border border-white/5 overflow-hidden" style={{ background: '#080f1a' }}>
            <div className="px-5 pt-4 pb-3 border-b border-white/5 flex items-center gap-3">
                <div className="p-1.5 rounded-lg" style={{ background: 'rgba(168,85,247,0.12)', border: '1px solid rgba(168,85,247,0.2)' }}>
                    <Activity className="w-3.5 h-3.5" style={{ color: '#a855f7' }} />
                </div>
                <div>
                    <p className="text-xs font-bold text-white leading-tight">News &amp; Sentiment Context</p>
                    <p className="text-[10px]" style={{ color: '#475569' }}>Optional — AI will factor this into the analysis</p>
                </div>
            </div>
            <div className="p-4">
                <textarea
                    rows={3}
                    value={value}
                    onChange={e => onChange(e.target.value)}
                    placeholder="e.g. Company reported 30% profit growth in Q3. SEBON approved new FPO issue. Promoter stake increased by 5%..."
                    className="w-full resize-none rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-purple-500/40 transition-all"
                    style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', lineHeight: 1.6 }}
                />
                {value && (
                    <button
                        onClick={() => onChange('')}
                        className="mt-1.5 text-[10px] text-slate-600 hover:text-slate-400 transition-colors"
                    >
                        Clear
                    </button>
                )}
            </div>
        </div>
    );
}
