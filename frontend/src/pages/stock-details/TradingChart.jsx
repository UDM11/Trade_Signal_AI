import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
    createChart, ColorType,
    CandlestickSeries, LineSeries, HistogramSeries, AreaSeries, BaselineSeries,
    createSeriesMarkers,
} from "lightweight-charts";
import { 
    Maximize2, Minimize2, TrendingUp, TrendingDown, Minus, RotateCcw, 
    Loader2, ChevronDown, Clock, BrainCircuit, Cpu, Crosshair, Target, Shield, X, Zap
} from "lucide-react";

// ─── Indicator math ────────────────────────────────────────────────────────────

function calcHeikinAshi(data) {
    const out = [];
    for (let i = 0; i < data.length; i++) {
        const d = data[i];
        const po = i === 0 ? d.open  : out[i - 1].open;
        const pc = i === 0 ? d.close : out[i - 1].close;
        const haC = (d.open + d.high + d.low + d.close) / 4;
        const haO = (po + pc) / 2;
        out.push({ time: d.time, open: haO, high: Math.max(d.high, haO, haC), low: Math.min(d.low, haO, haC), close: haC });
    }
    return out;
}

function calcSMA(data, period) {
    const out = [];
    for (let i = period - 1; i < data.length; i++) {
        const avg = data.slice(i - period + 1, i + 1).reduce((s, d) => s + d.close, 0) / period;
        out.push({ time: data[i].time, value: avg });
    }
    return out;
}

function calcEMA(data, period) {
    if (data.length < period) return [];
    const k = 2 / (period + 1);
    let prev = data.slice(0, period).reduce((s, d) => s + d.close, 0) / period;
    const out = [{ time: data[period - 1].time, value: prev }];
    for (let i = period; i < data.length; i++) {
        prev = data[i].close * k + prev * (1 - k);
        out.push({ time: data[i].time, value: prev });
    }
    return out;
}

function calcBB(data, period = 20, mult = 2) {
    const out = [];
    for (let i = period - 1; i < data.length; i++) {
        const sl  = data.slice(i - period + 1, i + 1);
        const avg = sl.reduce((s, d) => s + d.close, 0) / period;
        const std = Math.sqrt(sl.reduce((s, d) => s + (d.close - avg) ** 2, 0) / period);
        out.push({ time: data[i].time, upper: avg + mult * std, middle: avg, lower: avg - mult * std });
    }
    return out;
}

function calcRSI(data, period = 14) {
    const out = [];
    for (let i = period; i < data.length; i++) {
        let g = 0, l = 0;
        for (let j = i - period + 1; j <= i; j++) {
            const d = data[j].close - data[j - 1].close;
            if (d > 0) g += d; else l -= d;
        }
        out.push({ time: data[i].time, value: l === 0 ? 100 : 100 - 100 / (1 + g / l) });
    }
    return out;
}

function calcMACD(data, fast = 12, slow = 26, sig = 9) {
    const ef = calcEMA(data, fast), es = calcEMA(data, slow);
    const macd = es.map(s => { const f = ef.find(x => x.time === s.time); return f ? { time: s.time, value: f.value - s.value } : null; }).filter(Boolean);
    const signal = calcEMA(macd.map(m => ({ ...m, close: m.value })), sig);
    return {
        macd, signal,
        hist: signal.map(s => { const m = macd.find(x => x.time === s.time); return m ? { time: s.time, value: m.value - s.value, color: m.value - s.value >= 0 ? "rgba(34,197,94,0.65)" : "rgba(239,68,68,0.65)" } : null; }).filter(Boolean),
    };
}

function calcStoch(data, kp = 14, dp = 3) {
    const kArr = [];
    for (let i = kp - 1; i < data.length; i++) {
        const sl = data.slice(i - kp + 1, i + 1);
        const hi = Math.max(...sl.map(d => d.high || d.close));
        const lo = Math.min(...sl.map(d => d.low  || d.close));
        kArr.push({ time: data[i].time, k: hi === lo ? 50 : ((data[i].close - lo) / (hi - lo)) * 100 });
    }
    return kArr.slice(dp - 1).map((_, i) => {
        const slice = kArr.slice(i, i + dp);
        return { time: slice[dp - 1].time, k: slice[dp - 1].k, d: slice.reduce((s, v) => s + v.k, 0) / dp };
    });
}

function calcVWAP(data) {
    let pv = 0, cv = 0;
    return data.map(d => {
        const vol = d.value ?? d.volume ?? 1;
        pv += ((d.high + d.low + d.close) / 3) * vol;
        cv += vol;
        return { time: d.time, value: cv === 0 ? d.close : pv / cv };
    });
}

function calcATRval(data, period = 14) {
    if (data.length < period + 1) return null;
    let s = 0;
    for (let i = data.length - period; i < data.length; i++) {
        s += Math.max(data[i].high - data[i].low, Math.abs(data[i].high - data[i - 1].close), Math.abs(data[i].low - data[i - 1].close));
    }
    return s / period;
}

function calcADX(data, period = 14) {
    if (data.length < period * 2 + 2) return { adx: [], diPlus: [], diMinus: [] };
    const trs = [], dmp = [], dmm = [];
    for (let i = 1; i < data.length; i++) {
        const h = data[i].high || data[i].close, l = data[i].low || data[i].close, pc = data[i - 1].close;
        const ph = data[i - 1].high || pc, pl = data[i - 1].low || pc;
        trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
        const up = h - ph, dn = pl - l;
        dmp.push(up > dn && up > 0 ? up : 0);
        dmm.push(dn > up && dn > 0 ? dn : 0);
    }
    const adxOut = [], dpOut = [], dmOut = [];
    for (let i = period - 1; i < trs.length; i++) {
        const atr = trs.slice(i - period + 1, i + 1).reduce((s, v) => s + v, 0);
        const dp  = atr === 0 ? 0 : 100 * dmp.slice(i - period + 1, i + 1).reduce((s, v) => s + v, 0) / atr;
        const dm  = atr === 0 ? 0 : 100 * dmm.slice(i - period + 1, i + 1).reduce((s, v) => s + v, 0) / atr;
        const dx  = (dp + dm) === 0 ? 0 : 100 * Math.abs(dp - dm) / (dp + dm);
        const t   = data[i + 1].time;
        dpOut.push({ time: t, value: dp });
        dmOut.push({ time: t, value: dm });
        if (i >= period * 2 - 2) {
            const adxv = adxOut.length === 0
                ? dpOut.slice(-period).map((_, j) => { const a = trs.slice(j, j + period).reduce((s,v)=>s+v,0); const dp2 = 100*dmp.slice(j,j+period).reduce((s,v)=>s+v,0)/a; const dm2 = 100*dmm.slice(j,j+period).reduce((s,v)=>s+v,0)/a; return (dp2+dm2)===0?0:100*Math.abs(dp2-dm2)/(dp2+dm2); }).reduce((s,v)=>s+v,0)/period
                : adxOut[adxOut.length - 1].value * (period - 1) / period + dx / period;
            adxOut.push({ time: t, value: adxv });
        }
    }
    return { adx: adxOut, diPlus: dpOut, diMinus: dmOut };
}

function calcOBV(data) {
    let obv = 0;
    return data.map((d, i) => {
        if (i > 0) obv += d.close > data[i - 1].close ? (d.value ?? 0) : d.close < data[i - 1].close ? -(d.value ?? 0) : 0;
        return { time: d.time, value: obv };
    });
}

function calcCCI(data, period = 20) {
    const out = [];
    for (let i = period - 1; i < data.length; i++) {
        const sl  = data.slice(i - period + 1, i + 1);
        const tps = sl.map(d => ((d.high || d.close) + (d.low || d.close) + d.close) / 3);
        const mean = tps.reduce((s, v) => s + v, 0) / period;
        const md   = tps.reduce((s, v) => s + Math.abs(v - mean), 0) / period;
        out.push({ time: data[i].time, value: md === 0 ? 0 : (tps[period - 1] - mean) / (0.015 * md) });
    }
    return out;
}

function calcWR(data, period = 14) {
    const out = [];
    for (let i = period - 1; i < data.length; i++) {
        const sl = data.slice(i - period + 1, i + 1);
        const hh = Math.max(...sl.map(d => d.high || d.close));
        const ll = Math.min(...sl.map(d => d.low  || d.close));
        out.push({ time: data[i].time, value: hh === ll ? -50 : ((hh - data[i].close) / (hh - ll)) * -100 });
    }
    return out;
}

function calcIchimoku(data) {
    function midHL(arr) {
        return (Math.max(...arr.map(d => d.high || d.close)) + Math.min(...arr.map(d => d.low || d.close))) / 2;
    }
    const tenkan = [], kijun = [];
    for (let i = 8; i < data.length; i++)  tenkan.push({ time: data[i].time, value: midHL(data.slice(i - 8, i + 1), 9) });
    for (let i = 25; i < data.length; i++) kijun.push({  time: data[i].time, value: midHL(data.slice(i - 25, i + 1), 26) });
    return { tenkan, kijun };
}

// ─── Timeframe filter ──────────────────────────────────────────────────────────
function filterByDays(data, days) {
    if (!days || !data?.length) return data ?? [];
    const sorted = [...data].sort((a, b) => (a.time > b.time ? 1 : -1));
    const isSeconds = typeof sorted[0].time === "number";
    const lastTime = isSeconds ? sorted[sorted.length - 1].time * 1000 : sorted[sorted.length - 1].time;
    const cutoff = new Date(lastTime);
    cutoff.setDate(cutoff.getDate() - days);
    
    if (isSeconds) {
        const cs = Math.floor(cutoff.getTime() / 1000);
        return sorted.filter(d => d.time >= cs);
    } else {
        const cs = cutoff.toISOString().slice(0, 10);
        return sorted.filter(d => d.time >= cs);
    }
}

function resampleData(data, minutes) {
    if (!data?.length || minutes <= 1) return data;
    const resampled = [];
    let currentCandle = null;
    
    data.forEach((d) => {
        // Convert time to numeric timestamp if it's a string
        const timestamp = typeof d.time === 'string' ? Math.floor(new Date(d.time).getTime() / 1000) : d.time;
        const groupSeconds = minutes * 60;
        const groupTime = Math.floor(timestamp / groupSeconds) * groupSeconds;

        if (!currentCandle || currentCandle.time !== groupTime) {
            if (currentCandle) resampled.push(currentCandle);
            currentCandle = {
                time: groupTime,
                open: d.open,
                high: d.high,
                low: d.low,
                close: d.close,
                value: d.value || 0
            };
        } else {
            currentCandle.high = Math.max(currentCandle.high, d.high);
            currentCandle.low = Math.min(currentCandle.low, d.low);
            currentCandle.close = d.close;
            currentCandle.value += (d.value || 0);
        }
    });
    if (currentCandle) resampled.push(currentCandle);
    return resampled;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const TFS = [
    { label: "1m",  days: 1, type: "intraday", resample: 1 },
    { label: "5m",  days: 1, type: "intraday", resample: 5 },
    { label: "15m", days: 1, type: "intraday", resample: 15 },
    { label: "1h",  days: 1, type: "intraday", resample: 60 },
    { label: "1W",  days: 7 }, 
    { label: "1M",  days: 30 }, 
    { label: "3M",  days: 90 },
    { label: "6M",  days: 180 }, 
    { label: "1Y",  days: 365 }, 
    { label: "ALL", days: null },
];
const CHART_TYPES = [
    { key: "candle", label: "C",  title: "Candlestick"  },
    { key: "ha",     label: "HA", title: "Heikin-Ashi"  },
    { key: "line",   label: "L",  title: "Line"         },
];
const OVERLAYS = [
    { key: "sma20",  label: "MA20",   color: "#3b82f6" },
    { key: "sma50",  label: "MA50",   color: "#f59e0b" },
    { key: "ema200", label: "EMA200", color: "#e879f9" },
    { key: "ema9",   label: "EMA9",   color: "#a78bfa" },
    { key: "ema21",  label: "EMA21",  color: "#ec4899" },
    { key: "bb",     label: "BB",     color: "#6366f1" },
    { key: "vwap",   label: "VWAP",   color: "#14b8a6" },
    { key: "ich",    label: "ICH",    color: "#22c55e" },
    { key: "vp",     label: "VOL PROFILE", color: "#6366f1" },
    { key: "fib",    label: "FIBONACCI", color: "#f59e0b" },
];
const SUB_PANELS = [
    { key: "rsi",   label: "RSI",   color: "#22d3ee" },
    { key: "macd",  label: "MACD",  color: "#f472b6" },
    { key: "stoch", label: "STOCH", color: "#fb7185" },
    { key: "adx",   label: "ADX",   color: "#f97316" },
    { key: "obv",   label: "OBV",   color: "#10b981" },
    { key: "cci",   label: "CCI",   color: "#a78bfa" },
    { key: "wr",    label: "%R",    color: "#fb923c" },
];

const BG     = "#050d1a";
const GRID   = "#0d1b2a";
const BORDER = "#162333";

const lineOpt = (color, w = 1.5, style = 0) => ({
    color, lineWidth: w, lineStyle: style,
    priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
});

// ─── Component ────────────────────────────────────────────────────────────────
export default function TradingChart({
    symbol, data, liveCandle, stockLtp, prediction, signalHistory, explanation, defaultChartType = "candle",
    targetPrice, stopLoss, estimatedDays, targetPct, stopLossPct, riskReward,
    idealEntry, entryZoneLow, entryZoneHigh, target2, target2Pct, trailingStop,
    volumeProfile, fibonacci,
}) {
    const containerRef = useRef();
    const mainRef   = useRef();
    const subRef    = useRef();
    const syncing   = useRef(false);
    const inited    = useRef(false);
    const mainChart = useRef();
    const subChart  = useRef();
    const S         = useRef({});
    const markersP  = useRef();
    const priceLines = useRef([]);
    const roRef     = useRef(null);
    const prevTf    = useRef(null);
    const hasFitContent = useRef(false);

    const [tf,          setTf]          = useState("ALL");
    const [chartType,   setChartType]   = useState(defaultChartType);
    const [overlay,     setOverlay]     = useState({ sma20: true, sma50: true, ema200: false, ema9: false, ema21: false, bb: false, vwap: false, ich: false, vp: false, fib: false });
    const [subInd,      setSubInd]      = useState("rsi");
    const [ohlcv,       setOhlcv]       = useState(null);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [intradayData, setIntradayData] = useState([]);
    const [loadingIntraday, setLoadingIntraday] = useState(false);
    const [hoveredInds, setHoveredInds] = useState(null);

    const tfObj = useMemo(() => TFS.find(t => t.label === tf), [tf]);

    // Fetch 1m data when any intraday timeframe is selected
    useEffect(() => {
        const isIntraday = tfObj?.type === "intraday";
        if (isIntraday && symbol && !intradayData.length) {
            const fetch1m = async () => {
                setLoadingIntraday(true);
                try {
                    const { api } = await import("../../api");
                    const res = await api.getNepseIntraday(symbol);
                    const raw = res.data.chart_data || [];
                    
                    // Robust date parsing (handles space or T separators)
                    const normalized = raw.map(d => {
                        let t = d.time;
                        if (typeof t === 'string') {
                            // Replace space with T for standard ISO format if needed
                            const isoStr = t.includes(' ') ? t.replace(' ', 'T') : t;
                            t = Math.floor(new Date(isoStr).getTime() / 1000);
                        }
                        return { ...d, time: t };
                    }).filter(d => !isNaN(d.time)); // Remove any invalid dates
                    
                    setIntradayData(normalized);
                } catch (e) {
                    console.error("Failed to fetch 1m data", e);
                } finally {
                    setLoadingIntraday(false);
                }
            };
            fetch1m();
        }
    }, [tf, symbol, intradayData.length]);

    const cleanData = useMemo(() => {
        return (data ?? []).filter(d => d && d.time !== undefined && d.time !== null);
    }, [data]);

    const filteredData = useMemo(() => {
        if (tfObj?.type === "intraday") {
            // Only return intraday if we actually have data
            return intradayData.length > 0 ? resampleData(intradayData, tfObj.resample) : [];
        }
        return filterByDays(cleanData, tfObj?.days);
    }, [cleanData, tf, intradayData, tfObj]);

    const last = data?.[data.length - 1];
    const prev = data?.[data.length - 2] ?? last;
    const chg    = last && prev ? last.close - prev.close : 0;
    const chgPct = prev?.close ? ((chg / prev.close) * 100).toFixed(2) : "0.00";
    const isUp   = chg >= 0;

    const stats52w = useMemo(() => {
        if (!data?.length) return null;
        const highs = data.map(d => d.high || d.close);
        const lows  = data.map(d => d.low  || d.close);
        return { high: Math.max(...highs), low: Math.min(...lows) };
    }, [data]);

    const atrVal = useMemo(() => filteredData?.length > 15 ? calcATRval(filteredData) : null, [filteredData]);

    const legendVals = useMemo(() => ({
        sma20:  overlay.sma20  ? calcSMA(filteredData, 20).at(-1)?.value  ?? null : null,
        sma50:  overlay.sma50  ? calcSMA(filteredData, 50).at(-1)?.value  ?? null : null,
        ema200: overlay.ema200 ? calcEMA(filteredData, 200).at(-1)?.value ?? null : null,
        ema9:   overlay.ema9   ? calcEMA(filteredData, 9).at(-1)?.value   ?? null : null,
        ema21:  overlay.ema21  ? calcEMA(filteredData, 21).at(-1)?.value  ?? null : null,
        vwap:   overlay.vwap   ? calcVWAP(filteredData).at(-1)?.value     ?? null : null,
        rsi:    calcRSI(filteredData).at(-1)?.value ?? null,
    }), [filteredData, overlay]);

    const toggleOverlay = key => setOverlay(prev => ({ ...prev, [key]: !prev[key] }));
    const toggleSub     = key => setSubInd(prev => prev === key ? null : key);

    const toggleFullscreen = useCallback(() => {
        if (!document.fullscreenElement) containerRef.current?.requestFullscreen?.();
        else document.exitFullscreen?.();
    }, []);

    useEffect(() => {
        const fn = () => setIsFullscreen(!!document.fullscreenElement);
        document.addEventListener("fullscreenchange", fn);
        return () => document.removeEventListener("fullscreenchange", fn);
    }, []);

    // Keyboard: F = fullscreen, R = reset zoom
    useEffect(() => {
        const fn = e => {
            if (e.key === "f" || e.key === "F") toggleFullscreen();
            if (e.key === "r" || e.key === "R") mainChart.current?.timeScale().fitContent();
        };
        window.addEventListener("keydown", fn);
        return () => window.removeEventListener("keydown", fn);
    }, [toggleFullscreen]);

    // ── Live LTP Sync (Keep chart in sync with header) ────────────────────────
    useEffect(() => {
        if (!S.current.candle || !filteredData || filteredData.length === 0 || !stockLtp) return;
        
        const lastCandle = filteredData[filteredData.length - 1];
        // Ensure we only update if it's the current session's bar (approximate check)
        // This makes the chart feel "Live"
        try {
            S.current.candle.update({
                ...lastCandle,
                close: stockLtp,
                high: Math.max(lastCandle.high, stockLtp),
                low: Math.min(lastCandle.low, stockLtp),
            });
        } catch (e) {
            console.warn("Live update failed", e);
        }
    }, [stockLtp, filteredData]);

    // ── Chart init (once per data load) ───────────────────────────────────────
    useEffect(() => {
        return () => {
            if (roRef.current) roRef.current.disconnect();
            if (mainChart.current) mainChart.current.remove();
            if (subChart.current) subChart.current.remove();
            mainChart.current = null; subChart.current = null; S.current = {};
            inited.current = false;
        };
    }, []);

    useEffect(() => {
        if (inited.current || !data?.length || !mainRef.current || !subRef.current) return;
        inited.current = true;

        const base = {
            layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: "#4a6080", fontSize: 11, fontFamily: "Inter,system-ui,sans-serif" },
            grid:   { vertLines: { color: GRID }, horzLines: { color: GRID } },
            crosshair: {
                mode: 1,
                vertLine: { color: "#2a4060", width: 1, style: 1, labelBackgroundColor: "#162333" },
                horzLine: { color: "#2a4060", width: 1, style: 1, labelBackgroundColor: "#162333" },
            },
            handleScroll: true, handleScale: true,
        };

        const mc = createChart(mainRef.current, {
            ...base,
            width:  mainRef.current.clientWidth,
            height: mainRef.current.clientHeight,
            rightPriceScale: { borderColor: BORDER, scaleMargins: { top: 0.06, bottom: 0.22 } },
            leftPriceScale:  { visible: false },
            timeScale: { borderColor: BORDER, rightOffset: 28, barSpacing: 10, timeVisible: false, fixLeftEdge: false },
        });
        mainChart.current = mc;

        const sc = createChart(subRef.current, {
            ...base,
            width:  subRef.current.clientWidth,
            height: subRef.current.clientHeight,
            rightPriceScale: { borderColor: BORDER, scaleMargins: { top: 0.1, bottom: 0.1 } },
            leftPriceScale:  { visible: false },
            timeScale: { visible: false, rightOffset: 28, barSpacing: 10 },
        });
        subChart.current = sc;

        // ── Main series ────────────────────────────────────────────────────────
        S.current.candle = mc.addSeries(CandlestickSeries, {
            upColor: "#26a69a", downColor: "#ef5350",
            borderUpColor: "#26a69a", borderDownColor: "#ef5350",
            wickUpColor: "#26a69a", wickDownColor: "#ef5350",
        });
        S.current.lineChart = mc.addSeries(LineSeries, { color: "#3b82f6", lineWidth: 2, priceLineVisible: false, lastValueVisible: true, crosshairMarkerVisible: true });
        S.current.vol = mc.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, priceScaleId: "vol" });
        mc.priceScale("vol").applyOptions({ scaleMargins: { top: 0.84, bottom: 0 } });

        // ── Overlay series ─────────────────────────────────────────────────────
        S.current.sma20  = mc.addSeries(LineSeries, lineOpt("#3b82f6", 1.5));
        S.current.sma50  = mc.addSeries(LineSeries, lineOpt("#f59e0b", 1.5));
        S.current.ema200 = mc.addSeries(LineSeries, lineOpt("#e879f9", 2));
        S.current.ema9   = mc.addSeries(LineSeries, lineOpt("#a78bfa", 1.5));
        S.current.ema21  = mc.addSeries(LineSeries, lineOpt("#ec4899", 1.5));
        S.current.vwap   = mc.addSeries(LineSeries, lineOpt("#14b8a6", 1.5));
        S.current.bbUp   = mc.addSeries(LineSeries, lineOpt("rgba(99,102,241,0.55)", 1, 2));
        S.current.bbMid  = mc.addSeries(LineSeries, lineOpt("rgba(99,102,241,0.30)", 1, 2));
        S.current.bbLo   = mc.addSeries(LineSeries, lineOpt("rgba(99,102,241,0.55)", 1, 2));
        S.current.ichT   = mc.addSeries(LineSeries, lineOpt("#0ea5e9", 1.5));
        S.current.ichK   = mc.addSeries(LineSeries, lineOpt("#f43f5e", 1.5));

        // ── Risk/Reward Zones — BaselineSeries (fills EXACTLY between two price levels) ──
        // profitZone: line at T2, baseline at entry  → GREEN fill between entry↔T2 only
        // lossZone:   line at SL, baseline at entry  → RED fill between SL↔entry only
        // baseline is dynamic — updated per stock via applyOptions() before each setData
        S.current.profitZone = mc.addSeries(BaselineSeries, {
            baseValue:        { type: 'price', price: 0 }, // placeholder; set per-stock
            topLineColor:     'rgba(34, 197, 94, 0.8)',
            topFillColor1:    'rgba(34, 197, 94, 0.20)',
            topFillColor2:    'rgba(34, 197, 94, 0.04)',
            bottomLineColor:  'transparent',
            bottomFillColor1: 'transparent',
            bottomFillColor2: 'transparent',
            lineWidth: 1,
            priceLineVisible: false,
            lastValueVisible: false,
            crosshairMarkerVisible: false,
        });
        S.current.lossZone = mc.addSeries(BaselineSeries, {
            baseValue:        { type: 'price', price: 0 }, // placeholder; set per-stock
            topLineColor:     'transparent',
            topFillColor1:    'transparent',
            topFillColor2:    'transparent',
            bottomLineColor:  'rgba(239, 68, 68, 0.8)',
            bottomFillColor1: 'rgba(239, 68, 68, 0.04)',
            bottomFillColor2: 'rgba(239, 68, 68, 0.20)',
            lineWidth: 1,
            priceLineVisible: false,
            lastValueVisible: false,
            crosshairMarkerVisible: false,
        });

        // ── RSI sub-panel ──────────────────────────────────────────────────────
        S.current.rsiLine = sc.addSeries(LineSeries, { color: "#22d3ee", lineWidth: 1.5, priceLineVisible: false, lastValueVisible: true });
        S.current.rsiOb   = sc.addSeries(LineSeries, lineOpt("rgba(239,68,68,0.35)", 1, 2));
        S.current.rsiOs   = sc.addSeries(LineSeries, lineOpt("rgba(34,197,94,0.35)", 1, 2));
        S.current.rsiMid  = sc.addSeries(LineSeries, lineOpt("rgba(100,116,139,0.25)", 1, 3));

        // ── MACD sub-panel ─────────────────────────────────────────────────────
        S.current.macdLine = sc.addSeries(LineSeries,      { color: "#f472b6", lineWidth: 1.5, priceLineVisible: false, lastValueVisible: false });
        S.current.macdSig  = sc.addSeries(LineSeries,      { color: "#fb923c", lineWidth: 1,   priceLineVisible: false, lastValueVisible: false });
        S.current.macdHist = sc.addSeries(HistogramSeries, { priceScaleId: "right", priceLineVisible: false, lastValueVisible: false });

        // ── Stoch sub-panel ────────────────────────────────────────────────────
        S.current.stochK  = sc.addSeries(LineSeries, { color: "#fb7185", lineWidth: 1.5, priceLineVisible: false, lastValueVisible: true });
        S.current.stochD  = sc.addSeries(LineSeries, { color: "#fbbf24", lineWidth: 1,   priceLineVisible: false, lastValueVisible: false });
        S.current.stochOb = sc.addSeries(LineSeries, lineOpt("rgba(239,68,68,0.35)", 1, 2));
        S.current.stochOs = sc.addSeries(LineSeries, lineOpt("rgba(34,197,94,0.35)",  1, 2));

        // ── ADX sub-panel ──────────────────────────────────────────────────────
        S.current.adxLine = sc.addSeries(LineSeries, { color: "#f97316", lineWidth: 2, priceLineVisible: false, lastValueVisible: true });
        S.current.adxPos  = sc.addSeries(LineSeries, { color: "#22c55e", lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
        S.current.adxNeg  = sc.addSeries(LineSeries, { color: "#ef4444", lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
        S.current.adx25   = sc.addSeries(LineSeries, lineOpt("rgba(255,255,255,0.18)", 1, 2));

        // ── OBV sub-panel ──────────────────────────────────────────────────────
        S.current.obvLine = sc.addSeries(LineSeries, { color: "#10b981", lineWidth: 1.5, priceLineVisible: false, lastValueVisible: true });

        // ── CCI sub-panel ──────────────────────────────────────────────────────
        S.current.cciLine = sc.addSeries(LineSeries, { color: "#a78bfa", lineWidth: 1.5, priceLineVisible: false, lastValueVisible: true });
        S.current.cciOb   = sc.addSeries(LineSeries, lineOpt("rgba(239,68,68,0.35)", 1, 2));
        S.current.cciOs   = sc.addSeries(LineSeries, lineOpt("rgba(34,197,94,0.35)",  1, 2));
        S.current.cciMid  = sc.addSeries(LineSeries, lineOpt("rgba(100,116,139,0.2)", 1, 3));

        // ── Williams %R sub-panel ──────────────────────────────────────────────
        S.current.wrLine  = sc.addSeries(LineSeries, { color: "#fb923c", lineWidth: 1.5, priceLineVisible: false, lastValueVisible: true });
        S.current.wrOb    = sc.addSeries(LineSeries, lineOpt("rgba(239,68,68,0.35)", 1, 2));
        S.current.wrOs    = sc.addSeries(LineSeries, lineOpt("rgba(34,197,94,0.35)",  1, 2));

        // ── Crosshair Hover Logic ─────────────────────────────────────────────
        mc.subscribeCrosshairMove(param => {
            if (!param.time || !param.seriesData) { 
                setHoveredInds(null);
                setOhlcv(null); 
                return; 
            }
            
            const c = param.seriesData.get(S.current.candle) || param.seriesData.get(S.current.lineChart);
            const v = param.seriesData.get(S.current.vol);
            
            if (c) {
                setOhlcv({ ...c, volume: v?.value ?? 0, up: c.close >= c.open });
                
                // Collect all active indicator values at this point
                const inds = {};
                Object.keys(S.current).forEach(key => {
                    const series = S.current[key];
                    const data = param.seriesData.get(series);
                    if (data && (data.value !== undefined || data.close !== undefined)) {
                        inds[key] = data.value ?? data.close ?? data.k ?? data.upper;
                    }
                });
                setHoveredInds(inds);
            }
        });

        // ── Sync timescales ────────────────────────────────────────────────────
        mc.timeScale().subscribeVisibleLogicalRangeChange(r => { if (syncing.current || !r) return; syncing.current = true; sc.timeScale().setVisibleLogicalRange(r); syncing.current = false; });
        sc.timeScale().subscribeVisibleLogicalRangeChange(r => { if (syncing.current || !r) return; syncing.current = true; mc.timeScale().setVisibleLogicalRange(r); syncing.current = false; });

        // ── Resize ─────────────────────────────────────────────────────────────
        const onResize = () => {
            if (mainRef.current) mc.applyOptions({ width: mainRef.current.clientWidth, height: mainRef.current.clientHeight });
            if (subRef.current)  sc.applyOptions({ width: subRef.current.clientWidth,  height: subRef.current.clientHeight });
        };
        const ro = new ResizeObserver(onResize);
        if (mainRef.current) ro.observe(mainRef.current);
        if (subRef.current)  ro.observe(subRef.current);
        roRef.current = ro;
    }, [data]);

    // ── Update all data / overlays / sub-panels ────────────────────────────────
    useEffect(() => {
        if (!S.current.candle || !data?.length) return;
        const filtered = filteredData;
        const hasBackendInd = filtered.length > 0 && filtered[0].ema9 !== undefined;

        // 1. Core Chart Data
        const candleData = chartType === "ha" ? calcHeikinAshi(filtered) : filtered.map(d => ({ time: d.time, open: d.open, high: d.high, low: d.low, close: d.close }));
        if (chartType === "line") {
            S.current.candle.setData([]);
            S.current.lineChart.setData(filtered.map(d => ({ time: d.time, value: d.close })));
        } else {
            S.current.candle.setData(candleData);
            S.current.lineChart.setData([]);
        }

        S.current.vol.setData(filtered.map(d => ({
            time: d.time, value: d.value ?? d.volume ?? 0,
            color: d.close >= d.open ? "rgba(38,166,154,0.35)" : "rgba(239,83,80,0.35)",
        })));

        // 2. Indicator Calculation Strategy
        const runWorkerCalc = () => {
            const worker = new Worker('/indicatorWorker.js');
            worker.onmessage = (e) => {
                const { task, result, status } = e.data;
                if (status === 'success' && task === 'CALC_ALL') {
                    // Guard: series may be gone if component re-mounted before worker responded
                    if (!S.current.sma20) { worker.terminate(); return; }
                    if (overlay.sma20) S.current.sma20.setData(result.sma20);
                    if (overlay.sma50) S.current.sma50.setData(result.sma50);
                    if (overlay.ema200) S.current.ema200.setData(result.ema200);
                    if (overlay.bb) {
                        S.current.bbUp.setData(result.bb.map(b => ({ time: b.time, value: b.upper })));
                        S.current.bbMid.setData(result.bb.map(b => ({ time: b.time, value: b.middle })));
                        S.current.bbLo.setData(result.bb.map(b => ({ time: b.time, value: b.lower })));
                    }
                    if (subInd === "rsi") {
                        S.current.rsiLine.setData(result.rsi);
                        S.current.rsiOb.setData(result.rsi.map(v => ({ time: v.time, value: 70 })));
                        S.current.rsiOs.setData(result.rsi.map(v => ({ time: v.time, value: 30 })));
                        S.current.rsiMid.setData(result.rsi.map(v => ({ time: v.time, value: 50 })));
                    } else if (subInd === "macd") {
                        S.current.macdLine.setData(result.macd.macd);
                        S.current.macdSig.setData(result.macd.signal);
                        S.current.macdHist.setData(result.macd.hist);
                    }
                }
                worker.terminate();
            };
            worker.postMessage({ task: 'CALC_ALL', data: filtered, params: {} });
        };

        if (filtered.length > 0) {
            if (hasBackendInd) {
                // Priority 1: Use Backend Pre-Calculated Data (Fastest)
                if (overlay.sma20)  S.current.sma20.setData(filtered.map(d => ({ time: d.time, value: d.ma20 ?? d.sma20 })));
                if (overlay.sma50)  S.current.sma50.setData(filtered.map(d => ({ time: d.time, value: d.ma50 })));
                if (overlay.ema200) S.current.ema200.setData(filtered.map(d => ({ time: d.time, value: d.ma200 })));
                if (overlay.ema9)   S.current.ema9.setData(filtered.map(d => ({ time: d.time, value: d.ema9 })));
                if (overlay.ema21)  S.current.ema21.setData(filtered.map(d => ({ time: d.time, value: d.ema21 })));
                if (overlay.vwap)   S.current.vwap.setData(calcVWAP(filtered));
                
                if (overlay.bb) {
                    S.current.bbUp.setData(filtered.map(d => ({ time: d.time, value: d.bb_upper })));
                    S.current.bbMid.setData(filtered.map(d => ({ time: d.time, value: d.ma20 || d.sma20 })));
                    S.current.bbLo.setData(filtered.map(d => ({ time: d.time, value: d.bb_lower })));
                } else { [S.current.bbUp, S.current.bbMid, S.current.bbLo].forEach(s => s.setData([])); }

                if (subInd === "rsi") {
                    const d = filtered.map(v => ({ time: v.time, value: v.rsi }));
                    S.current.rsiLine.setData(d);
                    S.current.rsiOb.setData(d.map(v => ({ time: v.time, value: 70 })));
                    S.current.rsiOs.setData(d.map(v => ({ time: v.time, value: 30 })));
                    S.current.rsiMid.setData(d.map(v => ({ time: v.time, value: 50 })));
                } else if (subInd === "macd") {
                    S.current.macdLine.setData(filtered.map(v => ({ time: v.time, value: v.macd })));
                    S.current.macdSig.setData(filtered.map(v => ({ time: v.time, value: v.macd_signal })));
                    S.current.macdHist.setData(filtered.map(v => ({ time: v.time, value: v.macd_hist, color: v.macd_hist >= 0 ? "rgba(34,197,94,0.65)" : "rgba(239,68,68,0.65)" })));
                }
            } else {
                // Priority 2: Use Web Worker for Heavy Calculation (Performance)
                runWorkerCalc();
            }
        } else {
            // Clear all indicators to prevent old/unrelated details from displaying
            const keysToClear = [
                "sma20", "sma50", "ema200", "ema9", "ema21", "vwap", 
                "bbUp", "bbMid", "bbLo", "ichT", "ichK",
                "rsiLine", "rsiOb", "rsiOs", "rsiMid",
                "macdLine", "macdSig", "macdHist",
                "stochK", "stochD", "stochOb", "stochOs",
                "adxLine", "adxPos", "adxNeg", "adx25",
                "obvLine", "cciLine", "cciOb", "cciOs", "cciMid",
                "wrLine", "wrOb", "wrOs"
            ];
            keysToClear.forEach(k => S.current[k]?.setData([]));
        }

        // Clear unused indicators
        const clr = keys => keys.forEach(k => S.current[k]?.setData([]));
        if (subInd !== "rsi") clr(["rsiLine","rsiOb","rsiOs","rsiMid"]);
        if (subInd !== "macd") clr(["macdLine","macdSig","macdHist"]);
        if (!overlay.ich) clr(["ichT","ichK"]);
        
        // ── Technical fallbacks for specialized indicators (Phase 4) ──────────
        if (subInd === "stoch") {
            const d = calcStoch(filtered);
            S.current.stochK.setData(d.map(v => ({ time: v.time, value: v.k })));
            S.current.stochD.setData(d.map(v => ({ time: v.time, value: v.d })));
            S.current.stochOb.setData(d.map(v => ({ time: v.time, value: 80 })));
            S.current.stochOs.setData(d.map(v => ({ time: v.time, value: 20 })));
        } else if (subInd === "adx") {
            const { adx, diPlus, diMinus } = calcADX(filtered);
            S.current.adxLine.setData(adx);
            S.current.adxPos.setData(diPlus);
            S.current.adxNeg.setData(diMinus);
            S.current.adx25.setData(adx.map(v => ({ time: v.time, value: 25 })));
        } else if (subInd === "cci") {
            const d = calcCCI(filtered);
            S.current.cciLine.setData(d);
            S.current.cciOb.setData( d.map(v => ({ time: v.time, value:  100 })));
            S.current.cciOs.setData( d.map(v => ({ time: v.time, value: -100 })));
            S.current.cciMid.setData(d.map(v => ({ time: v.time, value: 0   })));
        } else if (subInd === "wr") {
            const d = calcWR(filtered);
            S.current.wrLine.setData(d);
            S.current.wrOb.setData(d.map(v => ({ time: v.time, value: -20 })));
            S.current.wrOs.setData(d.map(v => ({ time: v.time, value: -80 })));
        }

        // ── AI Price lines ─────────────────────────────────────────────────────
        priceLines.current.forEach(pl => { try { S.current.candle.removePriceLine(pl); } catch (e) { void e; } });
        priceLines.current = [];

        const series  = chartType === "line" ? S.current.lineChart : S.current.candle;
        const entry   = idealEntry ?? filtered[filtered.length - 1]?.close;
        const isSell  = prediction === "SELL";
        const isHold  = prediction === "HOLD";
        const mkLine  = (price, color, w, style, label, axis = true) => {
            try { priceLines.current.push(series.createPriceLine({ price, color, lineWidth: w, lineStyle: style, axisLabelVisible: axis, title: label })); } catch (e) { void e; }
        };

        if (entry)              mkLine(entry,        "#94a3b8",                         1, 3, idealEntry ? `⟶ Entry  Rs.${entry.toFixed(2)}`      : `⟶ Close  Rs.${entry.toFixed(2)}`);
        if (entryZoneLow  && entryZoneLow  !== entry) mkLine(entryZoneLow,  "rgba(148,163,184,0.3)", 1, 2, "Zone Low",  false);
        if (entryZoneHigh && entryZoneHigh !== entry) mkLine(entryZoneHigh, "rgba(148,163,184,0.3)", 1, 2, "Zone High", false);
        if (targetPrice) {
            const t1Pct = targetPct ?? (entry ? ((targetPrice - entry) / entry * 100).toFixed(2) : 0);
            mkLine(targetPrice, isSell ? "#ef5350" : "#26a69a", 2, 0, `🎯 T1  Rs.${Number(targetPrice).toFixed(2)}  (${t1Pct >= 0 ? "+" : ""}${t1Pct}%)`);
        }
        if (target2) {
            const t2Pct = target2Pct ?? (entry ? ((target2 - entry) / entry * 100).toFixed(2) : 0);
            mkLine(target2, isSell ? "#f87171" : "#34d399", 1, 1, `🎯 T2  Rs.${Number(target2).toFixed(2)}  (${t2Pct >= 0 ? "+" : ""}${t2Pct}%)`);
        }
        if (stopLoss) {
            const slPct = stopLossPct ?? (entry ? ((stopLoss - entry) / entry * 100).toFixed(2) : 0);
            mkLine(stopLoss, isSell ? "#26a69a" : "#ef5350", 2, 0, `🛑 SL  Rs.${Number(stopLoss).toFixed(2)}  (${slPct}%)`);
        }
        if (trailingStop)       mkLine(trailingStop, "#f59e0b",                         1, 2, `~ Trail  Rs.${Number(trailingStop).toFixed(2)}`);

        // ── Risk/Reward Projection Zones (Future Only — Professional Style) ───
        // Zones project FORWARD from the last candle into future trading days.
        // ✅ Green zone: from entry UP to T2 (profit potential)
        // ✅ Red zone:   from stop loss UP to entry (risk zone)
        // Historical candles are NOT overlaid — zones are clean forward projection.
        if (entry && !isHold && filtered.length > 5) {
            const lastDate = filtered[filtered.length - 1].time;

            // Generate future business dates using UTC to avoid timezone shift bugs
            // (Nepal is UTC+5:45 — using local Date causes toISOString to return previous day)
            const futureDates = (() => {
                const dates = [];
                const [y, m, d] = lastDate.split('-').map(Number);
                const cur = new Date(Date.UTC(y, m - 1, d)); // start at lastDate in UTC
                while (dates.length < 25) {
                    cur.setUTCDate(cur.getUTCDate() + 1);
                    const day = cur.getUTCDay();
                    if (day !== 0 && day !== 6)  // skip Sat(6) and Sun(0)
                        dates.push(cur.toISOString().slice(0, 10));
                }
                return dates;
            })();

            // Anchor starts at last candle so there's no gap
            const zoneDates = [lastDate, ...futureDates];

            // ── Green zone: entry → T2 — BaselineSeries baseline set to entry ──────
            // The series draws a horizontal line at T2 and fills DOWN to the baseline (entry).
            const zoneTop = target2 || targetPrice;
            if (zoneTop && zoneTop > entry) {
                S.current.profitZone.applyOptions({
                    baseValue: { type: 'price', price: entry }, // fill stops exactly at entry
                });
                S.current.profitZone.setData(zoneDates.map(t => ({
                    time: t,
                    value: zoneTop, // horizontal line drawn at T2
                })));
            } else { S.current.profitZone.setData([]); }

            // ── Red zone: SL → entry — BaselineSeries baseline set to entry ───────
            // The series draws a horizontal line at SL and fills UP to the baseline (entry).
            // Red fills ONLY between SL and entry — nothing below SL, nothing above entry.
            if (stopLoss && stopLoss < entry) {
                S.current.lossZone.applyOptions({
                    baseValue: { type: 'price', price: entry }, // baseline at entry = top of red
                });
                S.current.lossZone.setData(zoneDates.map(t => ({
                    time: t,
                    value: stopLoss, // horizontal line drawn at SL (below baseline = red fill)
                })));
            } else { S.current.lossZone.setData([]); }

        } else {
            S.current.profitZone?.setData([]);
            S.current.lossZone?.setData([]);
        }
        
        // ── Fibonacci Levels ───────────────────────────────────────────────────
        if (overlay.fib && fibonacci?.levels) {
            Object.entries(fibonacci.levels).forEach(([level, price]) => {
                const color = level === "0.618" || level === "0.5" ? "#f59e0b" : "rgba(245,158,11,0.4)";
                const width = level === "0.618" || level === "0.5" ? 1.5 : 1;
                mkLine(price, color, width, 2, `Fib ${level}  Rs.${price.toFixed(2)}`, false);
            });
        }

        // ── Volume Profile (Visible on Left) ───────────────────────────────────
        if (overlay.vp && volumeProfile?.length) {
            // We use the histogram on a separate left scale for VP
            if (!S.current.vp) {
                S.current.vp = mc.addSeries(HistogramSeries, {
                    color: "rgba(99,102,241,0.25)",
                    priceScaleId: "left",
                });
                mc.priceScale("left").applyOptions({
                    visible: true,
                    scaleMargins: { top: 0.1, bottom: 0.1 },
                    borderColor: BORDER,
                });
            }
            
            // To show it horizontally, we'd need a custom plugin or mapping.
            // Simplified: we show it as a vertical histogram for now, or use markers.
            // Professional way: set it as a series of data points.
            const maxVol = Math.max(...volumeProfile.map(v => v.volume));
            S.current.vp.setData(volumeProfile.map((v, i) => ({
                time: filtered[filtered.length - 1 - i]?.time ?? filtered[0].time, // Just to map to valid times
                value: v.price,
                color: "rgba(99,102,241,0.4)"
            })));
        } else if (S.current.vp) {
            S.current.vp.setData([]);
        }

        // ── Signal markers (Professional V2) ──────────────────────────────────
        if (markersP.current) { try { markersP.current.setMarkers([]); } catch (e) { void e; } }
        const markers = [];

        if (signalHistory?.length) {
            let lastSignal = null;
            for (const s of signalHistory) {
                // Determine if this is a "Change" (Signal Reversal) or a "Continuance"
                const isChange = s.signal !== lastSignal;
                lastSignal = s.signal;

                if (s.signal === "BUY") {
                    markers.push({
                        time: s.time,
                        position: "belowBar",
                        color: "#10b981", // Emerald
                        shape: isChange ? "arrowUp" : "circle",
                        text: isChange ? "BUY" : "",
                        size: isChange ? 2 : 0.5,
                    });
                } else if (s.signal === "SELL") {
                    markers.push({
                        time: s.time,
                        position: "aboveBar",
                        color: "#f43f5e", // Rose
                        shape: isChange ? "arrowDown" : "circle",
                        text: isChange ? "SELL" : "",
                        size: isChange ? 2 : 0.5,
                    });
                } else if (s.signal === "HOLD") {
                    markers.push({
                        time: s.time,
                        position: "aboveBar",
                        color: "rgba(245,158,11,0.2)", // Subtle Amber
                        shape: "circle",
                        size: 0.2,
                    });
                }
            }
        }

        // Highlight the LATEST AI prediction with a special badge
        if (prediction && filtered.length) {
            const lastBar = filtered[filtered.length - 1];
            const ei = markers.findIndex(m => m.time === lastBar.time);
            
            const signalText = prediction === "BUY" ? "AI BUY" : prediction === "SELL" ? "AI SELL" : "HOLD";
            const lm = prediction === "BUY"  ? { time: lastBar.time, position: "belowBar", color: "#10b981", shape: "arrowUp",   text: signalText,  size: 2.5 }
                     : prediction === "SELL" ? { time: lastBar.time, position: "aboveBar", color: "#f43f5e", shape: "arrowDown", text: signalText, size: 2.5 }
                     :                         { time: lastBar.time, position: "aboveBar", color: "#f59e0b", shape: "circle",    text: "AI HOLD",    size: 1 };
            
            if (ei >= 0) markers[ei] = lm; else markers.push(lm);
        }

        if (markers.length) {
            const plugin = createSeriesMarkers(chartType === "line" ? S.current.lineChart : S.current.candle);
            // Sort by time to ensure lightweight-charts doesn't complain
            const sortedMarkers = markers.sort((a, b) => (a.time > b.time ? 1 : -1));
            plugin.setMarkers(sortedMarkers);
            markersP.current = plugin;
        }

        if (prevTf.current !== tf || !hasFitContent.current) {
            mainChart.current?.timeScale().fitContent();
            
            // Adjust time visibility for intraday
            const isIntraday = tfObj?.type === "intraday";
            mainChart.current?.applyOptions({
                timeScale: {
                    timeVisible: isIntraday,
                    secondsVisible: false,
                }
            });
            
            prevTf.current = tf;
            hasFitContent.current = true;
        }
    }, [data, tf, chartType, overlay, subInd, prediction, idealEntry, entryZoneLow, entryZoneHigh, targetPrice, target2, stopLoss, trailingStop, targetPct, target2Pct, stopLossPct, signalHistory, filteredData]);

    // ── Live candle — update rightmost bar in real-time without full redraw ──
    useEffect(() => {
        if (!liveCandle || !S.current.candle || !data?.length) return;
        try {
            if (chartType === "line") {
                S.current.lineChart.update({ time: liveCandle.time, value: liveCandle.close });
            } else {
                S.current.candle.update({
                    time:  liveCandle.time,
                    open:  liveCandle.open,
                    high:  liveCandle.high,
                    low:   liveCandle.low,
                    close: liveCandle.close,
                });
            }
            S.current.vol.update({
                time:  liveCandle.time,
                value: liveCandle.value ?? 0,
                color: liveCandle.close >= liveCandle.open
                    ? "rgba(38,166,154,0.35)"
                    : "rgba(239,83,80,0.35)",
            });
        } catch (e) { /* ignore time-ordering errors when chart resets */ }
    }, [liveCandle, chartType, data?.length]);

    if (!data?.length) return null;

    const isBuy  = prediction === "BUY";
    const isSell = prediction === "SELL";
    const sigColor = isBuy ? "#26a69a" : isSell ? "#ef5350" : "#eab308";
    const SigIcon  = isBuy ? TrendingUp : isSell ? TrendingDown : Minus;
    const showSub  = !!subInd;

    const fmt = (v, d = 2) => v?.toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d }) ?? "—";

    const rsiNow   = legendVals.rsi;
    const rsiColor = rsiNow > 70 ? "#ef4444" : rsiNow < 30 ? "#22c55e" : "#22d3ee";

    const Btn = ({ onClick, active, color, children, title, style = {} }) => (
        <button onClick={onClick} title={title}
            style={{
                padding: "3px 9px", borderRadius: 5, fontSize: 11, fontWeight: 700,
                border: `1px solid ${active ? `${color}55` : BORDER}`,
                background: active ? `${color}18` : "transparent",
                color: active ? color : "#475569",
                cursor: "pointer", transition: "all 0.15s",
                ...style,
            }}>
            {children}
        </button>
    );

    return (
        <div ref={containerRef} className="w-full h-full flex flex-col select-none"
            style={{ background: BG, fontFamily: "Inter,system-ui,sans-serif" }}>

            {/* ── Stats bar ──────────────────────────────────────────────────── */}
            <div className="flex items-center gap-2 sm:gap-4 px-3 sm:px-5 py-2 sm:py-3 border-b shrink-0 flex-wrap backdrop-blur-md bg-white/5" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                
                {/* Symbol + Sector */}
                <div className="flex items-center gap-2 sm:gap-3">
                    <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-md sm:rounded-lg bg-blue-600 flex items-center justify-center font-black text-white text-[9px] sm:text-xs shadow-lg shadow-blue-500/20">
                        {symbol?.substring(0,2)}
                    </div>
                    <div>
                        <h1 className="text-xs sm:text-sm font-black text-white tracking-tighter leading-none uppercase">{symbol}</h1>
                        <span className="text-[7px] sm:text-[9px] font-bold text-slate-500 uppercase tracking-widest block mt-0.5">Equity</span>
                    </div>
                </div>

                <div className="hidden xs:block h-5 sm:h-6 w-px bg-white/10" />

                {/* Price + change */}
                <div className="flex flex-col">
                    <div className="flex items-baseline gap-1.5 sm:gap-2">
                        <span className="text-sm sm:text-xl font-black tabular-nums leading-none" style={{ color: isUp ? "#10b981" : "#ef4444" }}>
                            {fmt(ohlcv?.close ?? last?.close)}
                        </span>
                        <span className={`text-[9px] sm:text-[11px] font-black ${isUp ? 'text-buy' : 'text-sell'}`}>
                            {isUp ? "▲" : "▼"} {isUp ? "+" : ""}{chgPct}%
                        </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                        <div className="flex items-center gap-1.5 text-[7px] sm:text-[9px] font-black uppercase tracking-wider text-slate-500">
                            <span>52W H <span className="text-buy">{fmt(stats52w?.high, 0)}</span></span>
                            <span>52W L <span className="text-sell">{fmt(stats52w?.low, 0)}</span></span>
                        </div>
                    </div>
                </div>

                <div className="hidden sm:block flex-1" />

                {/* AI Sentiment */}
                {prediction && (
                    <div className="flex items-center gap-1.5 sm:gap-3 px-2 sm:px-4 py-1 sm:py-1.5 rounded-lg sm:rounded-xl border font-black text-[8px] sm:text-xs tracking-widest shadow-xl"
                        style={{ background: `${sigColor}10`, borderColor: `${sigColor}40`, color: sigColor }}>
                        <BrainCircuit className="w-3 h-3 sm:w-4 sm:h-4" />
                        {prediction}
                    </div>
                )}

                {/* Fullscreen */}
                <button onClick={toggleFullscreen} className="p-1.5 sm:p-2 rounded-lg transition-all hover:bg-white/10 text-slate-400 hover:text-white">
                    {isFullscreen ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
                </button>
            </div>

            {/* ── Toolbar ────────────────────────────────────────────────────── */}
            <div className="flex items-center flex-wrap gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 border-b shrink-0 bg-[#080f1a]" style={{ borderColor: 'rgba(255,255,255,0.03)' }}>
                
                {/* Chart types */}
                <div className="flex bg-black/40 rounded-md sm:rounded-lg p-0.5 border border-white/5">
                    {CHART_TYPES.map((ct) => (
                        <button key={ct.key} onClick={() => setChartType(ct.key)}
                            className={`px-2 sm:px-3 py-0.5 sm:py-1 text-[8px] sm:text-[10px] font-black uppercase tracking-wider rounded transition-all ${chartType === ct.key ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>
                            {ct.label}
                        </button>
                    ))}
                </div>

                <div className="h-4 w-px bg-white/5 mx-0.5 sm:mx-1" />

                {/* Timeframes */}
                <div className="relative group">
                    <button className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1 sm:py-1.5 rounded-md sm:rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-all">
                        <Clock size={10} className="text-blue-400" />
                        <span className="text-[8px] sm:text-[10px] font-black text-white">{tf}</span>
                        <ChevronDown size={8} className="text-slate-500" />
                    </button>
                    <div className="absolute top-full left-0 mt-1 w-24 sm:w-32 bg-[#0d1526] border border-white/5 rounded-lg sm:rounded-xl shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 overflow-hidden py-1">
                        {TFS.map((t) => (
                            <button key={t.label} onClick={() => setTf(t.label)}
                                className={`w-full text-left px-3 sm:px-4 py-1.5 sm:py-2 text-[8px] sm:text-[10px] font-black uppercase tracking-widest ${tf === t.label ? 'text-blue-400 bg-blue-400/5' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
                                {t.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="h-4 w-px bg-white/5 mx-0.5 sm:mx-1" />

                {/* Overlays */}
                <div className="flex gap-1 sm:gap-1.5">
                    {OVERLAYS.slice(0, 4).map(({ key, label, color }) => (
                        <button key={key} onClick={() => toggleOverlay(key)}
                            className={`px-1.5 sm:px-2.5 py-0.5 sm:py-1 text-[7px] sm:text-[9px] font-black uppercase tracking-widest rounded border transition-all ${overlay[key] ? 'border-transparent text-white' : 'border-white/5 text-slate-500 hover:text-slate-300'}`}
                            style={{ background: overlay[key] ? color : 'transparent' }}>
                            {label}
                        </button>
                    ))}
                </div>

                <div className="flex-1" />

                <button onClick={() => mainChart.current?.timeScale().fitContent()} className="p-1 sm:p-2 rounded-lg text-slate-500 hover:text-white transition-colors">
                    <RotateCcw size={12} />
                </button>
            </div>

            {/* ── Main chart area ────────────────────────────────────────────── */}
            <div className="relative overflow-hidden flex-1" style={{ width: "100%", minHeight: "200px" }}>
                <div ref={mainRef} style={{ width: "100%", height: "100%" }} />
                
                {/* ── Dynamic Floating HUD ── */}
                <div className="absolute top-4 left-4 z-30 pointer-events-none flex flex-col gap-2">
                    {/* OHLCV Hover HUD */}
                    {ohlcv && (
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 rounded-xl bg-black/60 backdrop-blur-md border border-white/10 shadow-2xl">
                            <div className="flex items-center gap-2 pr-3 border-r border-white/10">
                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Market</span>
                                <span className="text-xs font-black tabular-nums" style={{ color: ohlcv.close >= ohlcv.open ? '#26a69a' : '#ef5350' }}>
                                    {ohlcv.close >= ohlcv.open ? '▲' : '▼'} {fmt(ohlcv.close)}
                                </span>
                            </div>
                            <div className="flex gap-4">
                                <div className="flex flex-col">
                                    <span className="text-[8px] font-black text-slate-500 uppercase">Open</span>
                                    <span className="text-xs font-bold text-slate-200">{fmt(ohlcv.open, 1)}</span>
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-[8px] font-black text-slate-500 uppercase">High</span>
                                    <span className="text-xs font-bold text-slate-200">{fmt(ohlcv.high, 1)}</span>
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-[8px] font-black text-slate-500 uppercase">Low</span>
                                    <span className="text-xs font-bold text-slate-200">{fmt(ohlcv.low, 1)}</span>
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-[8px] font-black text-slate-500 uppercase">Vol</span>
                                    <span className="text-xs font-bold text-blue-400">
                                        {ohlcv.volume >= 1000000 ? (ohlcv.volume / 1000000).toFixed(2) + 'M' : 
                                         ohlcv.volume >= 1000 ? (ohlcv.volume / 1000).toFixed(1) + 'K' : ohlcv.volume}
                                    </span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Indicator Values HUD */}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 rounded-xl bg-black/60 backdrop-blur-md border border-white/10 shadow-2xl">
                        {OVERLAYS.map(({ key, label, color }) => (
                            overlay[key] && (
                                <div key={key} className="flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full shadow-[0_0_8px_rgba(255,255,255,0.2)]" style={{ background: color }} />
                                    <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider">{label}</span>
                                    <span className="text-xs font-black text-white tabular-nums">
                                        {fmt(hoveredInds?.[key] ?? legendVals[key])}
                                    </span>
                                </div>
                            )
                        ))}
                        {subInd && (
                            <div className="flex items-center gap-2 border-l border-white/10 pl-4 ml-1">
                                <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider">{subInd}</span>
                                <span className="text-xs font-black text-blue-400 tabular-nums">
                                    {fmt(hoveredInds?.[`${subInd}Line`] ?? (subInd === 'rsi' ? legendVals.rsi : null))}
                                </span>
                            </div>
                        )}
                    </div>
                </div>

                {loadingIntraday && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-md z-20">
                        <div className="relative">
                            <div className="w-12 h-12 rounded-full border-2 border-blue-500/20 border-t-blue-500 animate-spin" />
                            <Cpu className="absolute inset-0 m-auto w-5 h-5 text-blue-500 animate-pulse" />
                        </div>
                        <span className="text-[10px] font-black text-blue-400 uppercase tracking-[0.3em] mt-4">Syncing Intraday</span>
                    </div>
                )}
            </div>

            {/* ── Sub-panel ──────────────────────────────────────────────────── */}
            <div style={{ height: showSub ? "22%" : "0", overflow: "hidden", borderTop: showSub ? `1px solid rgba(255,255,255,0.05)` : "none" }} className="shrink-0 bg-[#030812]">
                {showSub && (
                    <div className="flex items-center gap-2 sm:gap-4 px-3 sm:px-5 py-1.5 sm:py-2 border-b border-white/5">
                        <span className="text-[8px] sm:text-[10px] font-black uppercase tracking-widest text-slate-400">{subInd} Analysis</span>
                        <div className="h-3 w-px bg-white/10" />
                        <div className="flex gap-2 sm:gap-4">
                             {subInd === "rsi" && <IndicatorLegend label="Now" value={rsiNow?.toFixed(1)} color={rsiColor} />}
                        </div>
                        <div className="flex-1" />
                        <button onClick={() => setSubInd(null)} className="text-slate-500 hover:text-white"><X size={10} /></button>
                    </div>
                )}
                <div ref={subRef} style={{ width: "100%", height: "calc(100% - 24px)" }} />
            </div>

            {/* ── AI Levels bar — Hidden on mobile to save vertical space ──────────────── */}
            {(targetPrice || stopLoss) && (
                <div className="hidden sm:flex items-center justify-between px-6 py-4 shrink-0 bg-[#050d1a] border-t border-white/5">
                    <div className="flex items-center gap-8">
                        {idealEntry && <LevelItem label="Target Entry" value={fmt(idealEntry)} color="#94a3b8" icon={Crosshair} />}
                        {targetPrice && <LevelItem label="Base Target" value={fmt(targetPrice)} sub={targetPct ? `${targetPct}%` : null} color={isSell ? "#ef4444" : "#10b981"} icon={Target} />}
                        {target2 && <LevelItem label="Deep Target" value={fmt(target2)} sub={target2Pct ? `${target2Pct}%` : null} color={isSell ? "#f87171" : "#34d399"} icon={Zap} />}
                        {stopLoss && <LevelItem label="Risk Limit" value={fmt(stopLoss)} sub={stopLossPct ? `${stopLossPct}%` : null} color={isSell ? "#10b981" : "#ef4444"} icon={Shield} />}
                    </div>

                    <div className="flex items-center gap-8 border-l border-white/5 pl-8">
                        {riskReward != null && (
                            <div className="flex flex-col">
                                <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">R:R Ratio</span>
                                <span className="text-sm font-black" style={{ color: riskReward >= 2 ? "#10b981" : riskReward >= 1 ? "#eab308" : "#ef4444" }}>
                                    1 : {Number(riskReward).toFixed(2)}
                                </span>
                            </div>
                        )}
                        {estimatedDays && (
                            <div className="flex flex-col text-right">
                                <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Est. Wait</span>
                                <span className="text-sm font-black text-blue-400">{estimatedDays} Days</span>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

function IndicatorLegend({ label, value, color }) {
    return (
        <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ background: color }} />
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">{label}</span>
            <span className="text-[10px] font-black text-slate-200">{value}</span>
        </div>
    );
}

function LevelItem({ label, value, sub, color, icon: Icon }) {
    return (
        <div className="flex items-center gap-3">
            <div className="p-1.5 rounded-lg bg-white/5 border border-white/10">
                <Icon size={14} style={{ color }} />
            </div>
            <div className="flex flex-col">
                <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest leading-none mb-1">{label}</span>
                <div className="flex items-baseline gap-1.5">
                    <span className="text-sm font-black text-white leading-none">Rs.{value}</span>
                    {sub && <span className="text-[10px] font-bold" style={{ color }}>{sub}</span>}
                </div>
            </div>
        </div>
    );
}
