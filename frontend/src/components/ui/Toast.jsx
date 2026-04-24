import React from 'react';
import { CheckCircle2, AlertCircle, X } from 'lucide-react';

export default function Toast({ toasts, remove }) {
    return (
        <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 pointer-events-none">
            {toasts.map(t => (
                <div
                    key={t.id}
                    className={`flex items-start gap-3 px-4 py-3 rounded-xl border shadow-2xl pointer-events-auto
                        backdrop-blur-sm min-w-[260px] max-w-[360px] animate-in slide-in-from-bottom-2 fade-in duration-300
                        ${t.type === 'success' ? 'bg-surface border-buy/30' :
                          t.type === 'error'   ? 'bg-surface border-sell/30' :
                                                 'bg-surface border-white/10'}`}
                >
                    {t.type === 'success' && <CheckCircle2 className="w-4 h-4 text-buy shrink-0 mt-0.5" />}
                    {t.type === 'error'   && <AlertCircle  className="w-4 h-4 text-sell shrink-0 mt-0.5" />}
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white leading-snug">{t.title}</p>
                        {t.message && <p className="text-[11px] text-text-muted mt-0.5">{t.message}</p>}
                    </div>
                    <button onClick={() => remove(t.id)} className="text-text-muted hover:text-white transition-colors shrink-0">
                        <X className="w-3.5 h-3.5" />
                    </button>
                </div>
            ))}
        </div>
    );
}
