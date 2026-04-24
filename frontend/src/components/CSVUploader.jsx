import React, { useCallback, useState, useRef } from 'react';
import {
    UploadCloud, FileSpreadsheet, CheckCircle2, AlertCircle, X,
    Cpu, Database, BrainCircuit, ChevronRight, FileText,
    TrendingUp, BarChart2, Zap, Shield,
} from 'lucide-react';

const REQUIRED_COLS = ['Date', 'Open', 'High', 'Low', 'Close', 'Volume'];

const STEPS = [
    { icon: Database,     label: 'Uploading & Parsing File',  desc: 'Reading OHLCV data'                   },
    { icon: Cpu,          label: 'Training ML Model',          desc: 'XGBoost + LightGBM + Random Forest'   },
    { icon: BrainCircuit, label: 'Generating AI Signal',       desc: 'GPT-4o market analysis'               },
];

const TIPS = [
    { icon: TrendingUp, text: 'More rows = higher accuracy. Aim for 200+ trading days.' },
    { icon: BarChart2,  text: 'Supports CSV, Excel (.xlsx / .xls), and PDF table exports.' },
    { icon: Shield,     text: 'Volume column improves signal quality significantly.' },
    { icon: Zap,        text: 'NEPSE daily data works best — Meroshare or broker exports.' },
];

const ACCEPTED_EXTS = ['.csv', '.xlsx', '.xls', '.pdf'];
const ACCEPTED_MIME = '.csv,.xlsx,.xls,.pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,application/pdf';

function formatSize(bytes) {
    if (bytes < 1024)        return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function estimateRows(file) {
    return Math.round(file.size / 60);
}

export default function CSVUploader({ onUploadComplete }) {
    const [dragging,  setDragging]  = useState(false);
    const [file,      setFile]      = useState(null);
    const [loading,   setLoading]   = useState(false);
    const [step,      setStep]      = useState(0);
    const [done,      setDone]      = useState(false);
    const [error,     setError]     = useState(null);
    const [progress,  setProgress]  = useState(0);
    const [tipIdx,    setTipIdx]    = useState(0);
    const inputRef = useRef();

    const processFile = (f) => {
        const ext = '.' + f.name.split('.').pop().toLowerCase();
        if (!ACCEPTED_EXTS.includes(ext)) {
            setError(`Unsupported file type "${ext}". Accepted: CSV, Excel (.xlsx/.xls), PDF.`);
            return;
        }
        setFile(f);
        setError(null);
        setDone(false);
        setStep(0);
        setProgress(0);
        setTipIdx(Math.floor(Math.random() * TIPS.length));
    };

    const handleDrag  = (e) => { e.preventDefault(); e.stopPropagation(); };
    const handleDrop  = useCallback((e) => {
        e.preventDefault(); e.stopPropagation();
        setDragging(false);
        const f = e.dataTransfer.files?.[0];
        if (f) processFile(f);
    }, []);

    const handleUpload = async () => {
        if (!file) return;
        setLoading(true);
        setError(null);
        setDone(false);
        setProgress(0);

        // Animate steps + progress
        const timers = [];
        timers.push(setTimeout(() => { setStep(1); setProgress(10); }, 0));
        timers.push(setTimeout(() => setProgress(30), 600));
        timers.push(setTimeout(() => { setStep(2); setProgress(55); }, 1600));
        timers.push(setTimeout(() => setProgress(75), 2400));
        timers.push(setTimeout(() => { setStep(3); setProgress(88); }, 3200));

        try {
            await onUploadComplete(file);
            setProgress(100);
            setDone(true);
        } catch (err) {
            setError(err.response?.data?.detail || 'Upload failed. Please try again.');
        } finally {
            timers.forEach(clearTimeout);
            setLoading(false);
            setStep(0);
        }
    };

    const reset = () => { setFile(null); setError(null); setDone(false); setStep(0); setProgress(0); };

    const estRows = file ? estimateRows(file) : 0;

    return (
        <div className="rounded-2xl overflow-hidden border border-white/5 shadow-2xl flex flex-col"
            style={{ background: '#080f1a' }}>

            {/* ── Header ──────────────────────────────────────────────────── */}
            <div className="px-5 sm:px-6 pt-5 pb-4 border-b border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl" style={{ background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.2)' }}>
                        <UploadCloud className="text-blue-400 w-4 h-4" />
                    </div>
                    <div>
                        <h2 className="text-sm font-bold text-white leading-tight">Upload Stock Data</h2>
                        <p className="text-[11px] text-slate-500">CSV · Excel · PDF · OHLCV format required</p>
                    </div>
                </div>
                {file && !loading && (
                    <button onClick={reset} className="text-slate-600 hover:text-slate-300 transition-colors p-1 rounded-lg hover:bg-white/5">
                        <X className="w-4 h-4" />
                    </button>
                )}
            </div>

            <div className="p-5 sm:p-6 space-y-4">

                {/* ── Drop Zone ─────────────────────────────────────────────── */}
                {!file && (
                    <label
                        htmlFor="file-upload"
                        onDragEnter={(e) => { handleDrag(e); setDragging(true); }}
                        onDragLeave={(e) => { handleDrag(e); setDragging(false); }}
                        onDragOver={handleDrag}
                        onDrop={handleDrop}
                        className="relative flex flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed p-8 sm:p-10 cursor-pointer transition-all duration-200 group select-none"
                        style={{
                            borderColor:  dragging ? 'rgba(59,130,246,0.6)' : 'rgba(255,255,255,0.08)',
                            background:   dragging ? 'rgba(59,130,246,0.06)' : 'rgba(255,255,255,0.01)',
                            transform:    dragging ? 'scale(1.01)' : 'scale(1)',
                        }}
                    >
                        {/* Animated upload icon */}
                        <div className="relative">
                            <div className="p-5 rounded-2xl transition-all duration-200"
                                style={{
                                    background:   dragging ? 'rgba(59,130,246,0.15)' : 'rgba(255,255,255,0.04)',
                                    border:       `1px solid ${dragging ? 'rgba(59,130,246,0.4)' : 'rgba(255,255,255,0.07)'}`,
                                }}>
                                <UploadCloud className="w-9 h-9 transition-colors duration-200"
                                    style={{ color: dragging ? '#60a5fa' : '#475569' }} />
                            </div>
                            {/* Pulse ring on drag */}
                            {dragging && (
                                <div className="absolute inset-0 rounded-2xl animate-ping"
                                    style={{ border: '1px solid rgba(59,130,246,0.3)' }} />
                            )}
                        </div>

                        <div className="text-center space-y-1">
                            <p className="text-sm font-bold text-white">
                                {dragging ? 'Release to upload' : 'Drag & drop your file'}
                            </p>
                            <p className="text-xs text-slate-500">
                                or <span className="text-blue-400 font-semibold hover:text-blue-300 transition-colors">browse files</span>
                            </p>
                            <p className="text-[11px] text-slate-600 mt-2">CSV · Excel (.xlsx / .xls) · PDF · NEPSE Meroshare / Broker exports</p>
                        </div>

                        {/* Tips row */}
                        <div className="flex items-center gap-2 px-3 py-2 rounded-xl w-full max-w-xs"
                            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                            {React.createElement(TIPS[tipIdx].icon, { className: 'w-3.5 h-3.5 text-blue-400 shrink-0' })}
                            <p className="text-[11px] text-slate-500 leading-snug">{TIPS[tipIdx].text}</p>
                        </div>

                        <input
                            ref={inputRef}
                            type="file"
                            accept={ACCEPTED_MIME}
                            className="hidden"
                            id="file-upload"
                            onChange={e => e.target.files?.[0] && processFile(e.target.files[0])}
                        />
                    </label>
                )}

                {/* ── File Preview ───────────────────────────────────────────── */}
                {file && !loading && (
                    <div className="rounded-xl border border-white/8 overflow-hidden" style={{ background: 'rgba(255,255,255,0.02)' }}>
                        <div className="flex items-center gap-3 p-4">
                            <div className="p-2.5 rounded-xl shrink-0" style={{ background: done ? 'rgba(16,185,129,0.12)' : 'rgba(59,130,246,0.12)', border: `1px solid ${done ? 'rgba(16,185,129,0.25)' : 'rgba(59,130,246,0.2)'}` }}>
                                <FileSpreadsheet className="w-5 h-5" style={{ color: done ? '#10b981' : '#60a5fa' }} />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-white truncate">{file.name}</p>
                                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                    <span className="text-[11px] text-slate-500">{formatSize(file.size)}</span>
                                    <span className="text-slate-700">·</span>
                                    <span className="text-[11px] text-slate-500">~{estRows.toLocaleString()} rows est.</span>
                                    <span className="text-slate-700">·</span>
                                    <span className="text-[11px]" style={{ color: estRows >= 100 ? '#10b981' : estRows >= 30 ? '#eab308' : '#ef4444' }}>
                                        {estRows >= 100 ? '✓ Good dataset' : estRows >= 30 ? '⚠ Minimal' : '✗ Too small'}
                                    </span>
                                </div>
                            </div>
                            {done
                                ? <CheckCircle2 className="w-5 h-5 shrink-0" style={{ color: '#10b981' }} />
                                : <FileText className="w-4 h-4 text-slate-600 shrink-0" />
                            }
                        </div>

                        {/* Done state success bar */}
                        {done && (
                            <div className="px-4 pb-3">
                                <div className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.15)' }}>
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                    <span className="text-xs text-emerald-400 font-semibold">Model trained · Signal generated · Data saved</span>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* ── Loading State ──────────────────────────────────────────── */}
                {loading && (
                    <div className="rounded-xl border border-white/8 p-4 space-y-4" style={{ background: 'rgba(255,255,255,0.02)' }}>

                        {/* Progress bar */}
                        <div>
                            <div className="flex justify-between items-center mb-1.5">
                                <span className="text-[11px] text-slate-500 font-semibold">Processing…</span>
                                <span className="text-[11px] font-black tabular-nums text-blue-400">{progress}%</span>
                            </div>
                            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                                <div
                                    className="h-full rounded-full transition-all duration-500 ease-out"
                                    style={{
                                        width: `${progress}%`,
                                        background: 'linear-gradient(90deg, #3b82f6, #06b6d4)',
                                        boxShadow: '0 0 8px rgba(59,130,246,0.5)',
                                    }}
                                />
                            </div>
                        </div>

                        {/* Steps */}
                        <div className="space-y-2.5">
                            {STEPS.map((s, i) => {
                                const idx        = i + 1;
                                const isActive   = step === idx;
                                const isComplete = step > idx;
                                const isPending  = step < idx;
                                return (
                                    <div key={i} className="flex items-center gap-3 transition-all duration-300"
                                        style={{ opacity: isPending ? 0.25 : 1 }}>
                                        {/* Step indicator */}
                                        <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-all duration-300"
                                            style={{
                                                background: isComplete ? 'rgba(16,185,129,0.15)' : isActive ? 'rgba(59,130,246,0.15)' : 'rgba(255,255,255,0.04)',
                                                border:     `1px solid ${isComplete ? 'rgba(16,185,129,0.4)' : isActive ? 'rgba(59,130,246,0.4)' : 'rgba(255,255,255,0.08)'}`,
                                            }}>
                                            {isComplete
                                                ? <CheckCircle2 className="w-4 h-4" style={{ color: '#10b981' }} />
                                                : isActive
                                                    ? <s.icon className="w-3.5 h-3.5 text-blue-400 animate-pulse" />
                                                    : <s.icon className="w-3.5 h-3.5 text-slate-600" />
                                            }
                                        </div>

                                        {/* Label + desc */}
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs font-bold" style={{ color: isComplete ? '#10b981' : isActive ? '#fff' : '#475569' }}>
                                                {s.label}
                                            </p>
                                            <p className="text-[10px] text-slate-600">{s.desc}</p>
                                        </div>

                                        {/* Right side */}
                                        {isActive && (
                                            <div className="flex gap-1 shrink-0">
                                                {[0, 1, 2].map(d => (
                                                    <span key={d} className="w-1 h-1 rounded-full bg-blue-400 animate-bounce"
                                                        style={{ animationDelay: `${d * 130}ms` }} />
                                                ))}
                                            </div>
                                        )}
                                        {isComplete && (
                                            <ChevronRight className="w-3.5 h-3.5 shrink-0" style={{ color: '#10b981' }} />
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* ── Error ─────────────────────────────────────────────────── */}
                {error && (
                    <div className="rounded-xl p-4 border space-y-2" style={{ background: 'rgba(239,68,68,0.06)', borderColor: 'rgba(239,68,68,0.2)' }}>
                        <div className="flex items-start gap-2.5">
                            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                            <p className="text-sm text-red-400 leading-snug">{error}</p>
                        </div>
                        <button
                            onClick={() => setError(null)}
                            className="text-[11px] text-slate-500 hover:text-slate-300 transition-colors underline underline-offset-2"
                        >
                            Dismiss
                        </button>
                    </div>
                )}

                {/* ── Required Columns ──────────────────────────────────────── */}
                {!loading && (
                    <div className="space-y-2">
                        <p className="text-[10px] text-slate-600 uppercase tracking-widest font-semibold">Required Columns</p>
                        <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                            {REQUIRED_COLS.map(col => (
                                <div key={col} className="flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 border border-white/5"
                                    style={{ background: 'rgba(255,255,255,0.02)' }}>
                                    <CheckCircle2 className="w-2.5 h-2.5 shrink-0" style={{ color: 'rgba(16,185,129,0.5)' }} />
                                    <span className="text-[11px] text-slate-400 font-mono font-semibold">{col}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* ── Upload Button ──────────────────────────────────────────── */}
                {file && !done && (
                    <button
                        onClick={handleUpload}
                        disabled={loading}
                        className="w-full flex items-center justify-center gap-2.5 py-3 px-6 rounded-xl font-bold text-sm text-white transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                        style={{
                            background: loading
                                ? 'rgba(59,130,246,0.4)'
                                : 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                            boxShadow: loading ? 'none' : '0 0 24px rgba(59,130,246,0.3), inset 0 1px 0 rgba(255,255,255,0.1)',
                        }}
                    >
                        {loading ? (
                            <>
                                <span className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                                Analyzing…
                            </>
                        ) : (
                            <>
                                <Zap className="w-4 h-4" />
                                Run Analysis
                            </>
                        )}
                    </button>
                )}

                {/* ── Re-upload ─────────────────────────────────────────────── */}
                {done && (
                    <button
                        onClick={reset}
                        className="w-full flex items-center justify-center gap-2 py-2.5 px-6 rounded-xl font-semibold text-sm text-slate-400 hover:text-white transition-all border border-white/8 hover:border-white/15 hover:bg-white/5"
                    >
                        <UploadCloud className="w-4 h-4" />
                        Upload Another Stock
                    </button>
                )}
            </div>
        </div>
    );
}
