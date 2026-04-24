import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
    createChart, ColorType,
    CandlestickSeries, LineSeries, HistogramSeries,
    createSeriesMarkers,
} from "lightweight-charts";
import { Maximize2, Minimize2, TrendingUp, TrendingDown, Minus, RotateCcw } from "lucide-react";

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
    const cutoff = new Date(sorted[sorted.length - 1].time);
    cutoff.setDate(cutoff.getDate() - days);
    const cs = cutoff.toISOString().slice(0, 10);
    return sorted.filter(d => d.time >= cs);
}

// ─── Constants ────────────────────────────────────────────────────────────────
const TFS = [
    { label: "1W", days: 7 }, { label: "1M", days: 30 }, { label: "3M", days: 90 },
    { label: "6M", days: 180 }, { label: "1Y", days: 365 }, { label: "ALL", days: null },
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
    data, prediction, signalHistory,
    targetPrice, stopLoss, estimatedDays, targetPct, stopLossPct, riskReward,
    idealEntry, entryZoneLow, entryZoneHigh, target2, target2Pct, trailingStop,
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

    const [tf,          setTf]          = useState("ALL");
    const [chartType,   setChartType]   = useState("candle");
    const [overlay,     setOverlay]     = useState({ sma20: true, sma50: true, ema200: false, ema9: false, ema21: false, bb: false, vwap: false, ich: false });
    const [subInd,      setSubInd]      = useState("rsi");
    const [ohlcv,       setOhlcv]       = useState(null);
    const [isFullscreen, setIsFullscreen] = useState(false);

    const filteredData = useMemo(() => {
        const tfObj = TFS.find(t => t.label === tf);
        return filterByDays(data ?? [], tfObj?.days);
    }, [data, tf]);

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

    // ── Chart init (once per data load) ───────────────────────────────────────
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
            timeScale: { borderColor: BORDER, rightOffset: 12, barSpacing: 10, timeVisible: false, fixLeftEdge: false },
        });
        mainChart.current = mc;

        const sc = createChart(subRef.current, {
            ...base,
            width:  subRef.current.clientWidth,
            height: subRef.current.clientHeight,
            rightPriceScale: { borderColor: BORDER, scaleMargins: { top: 0.1, bottom: 0.1 } },
            leftPriceScale:  { visible: false },
            timeScale: { visible: false, rightOffset: 12, barSpacing: 10 },
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

        // ── Crosshair OHLCV ────────────────────────────────────────────────────
        mc.subscribeCrosshairMove(param => {
            if (!param.time || !param.seriesData) { setOhlcv(null); return; }
            const c = param.seriesData.get(S.current.candle);
            const v = param.seriesData.get(S.current.vol);
            if (c) setOhlcv({ ...c, volume: v?.value ?? 0, up: c.close >= c.open });
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

        return () => {
            inited.current = false;
            ro.disconnect();
            mc.remove(); sc.remove();
            mainChart.current = null; subChart.current = null; S.current = {};
        };
    }, [data]);

    // ── Update all data / overlays / sub-panels ────────────────────────────────
    useEffect(() => {
        if (!S.current.candle || !data?.length) return;
        const filtered = filteredData;
        if (!filtered.length) return;

        // Chart type
        const candleData = chartType === "ha" ? calcHeikinAshi(filtered) : filtered.map(d => ({ time: d.time, open: d.open, high: d.high, low: d.low, close: d.close }));
        if (chartType === "line") {
            S.current.candle.setData([]);
            S.current.lineChart.setData(filtered.map(d => ({ time: d.time, value: d.close })));
        } else {
            S.current.candle.setData(candleData);
            S.current.lineChart.setData([]);
        }

        // Volume
        S.current.vol.setData(filtered.map(d => ({
            time: d.time, value: d.value ?? d.volume ?? 0,
            color: d.close >= d.open ? "rgba(38,166,154,0.35)" : "rgba(239,83,80,0.35)",
        })));

        // ── Overlays ───────────────────────────────────────────────────────────
        S.current.sma20.setData( overlay.sma20  ? calcSMA(filtered, 20)  : []);
        S.current.sma50.setData( overlay.sma50  ? calcSMA(filtered, 50)  : []);
        S.current.ema200.setData(overlay.ema200 ? calcEMA(filtered, 200) : []);
        S.current.ema9.setData(  overlay.ema9   ? calcEMA(filtered, 9)   : []);
        S.current.ema21.setData( overlay.ema21  ? calcEMA(filtered, 21)  : []);
        S.current.vwap.setData(  overlay.vwap   ? calcVWAP(filtered)     : []);

        if (overlay.bb) {
            const bands = calcBB(filtered, 20);
            S.current.bbUp.setData( bands.map(b => ({ time: b.time, value: b.upper  })));
            S.current.bbMid.setData(bands.map(b => ({ time: b.time, value: b.middle })));
            S.current.bbLo.setData( bands.map(b => ({ time: b.time, value: b.lower  })));
        } else {
            [S.current.bbUp, S.current.bbMid, S.current.bbLo].forEach(s => s.setData([]));
        }

        if (overlay.ich) {
            const { tenkan, kijun } = calcIchimoku(filtered);
            S.current.ichT.setData(tenkan);
            S.current.ichK.setData(kijun);
        } else {
            S.current.ichT.setData([]);
            S.current.ichK.setData([]);
        }

        // ── Sub-panels — clear all, then set active ────────────────────────────
        const clr = keys => keys.forEach(k => S.current[k]?.setData([]));
        clr(["rsiLine","rsiOb","rsiOs","rsiMid"]);
        clr(["macdLine","macdSig","macdHist"]);
        clr(["stochK","stochD","stochOb","stochOs"]);
        clr(["adxLine","adxPos","adxNeg","adx25"]);
        clr(["obvLine"]);
        clr(["cciLine","cciOb","cciOs","cciMid"]);
        clr(["wrLine","wrOb","wrOs"]);

        if (subInd === "rsi") {
            const d = calcRSI(filtered);
            S.current.rsiLine.setData(d);
            S.current.rsiOb.setData(d.map(v => ({ time: v.time, value: 70 })));
            S.current.rsiOs.setData(d.map(v => ({ time: v.time, value: 30 })));
            S.current.rsiMid.setData(d.map(v => ({ time: v.time, value: 50 })));
        } else if (subInd === "macd") {
            const { macd, signal, hist } = calcMACD(filtered);
            S.current.macdLine.setData(macd);
            S.current.macdSig.setData(signal);
            S.current.macdHist.setData(hist);
        } else if (subInd === "stoch") {
            const d = calcStoch(filtered);
            S.current.stochK.setData( d.map(v => ({ time: v.time, value: v.k })));
            S.current.stochD.setData( d.map(v => ({ time: v.time, value: v.d })));
            S.current.stochOb.setData(d.map(v => ({ time: v.time, value: 80 })));
            S.current.stochOs.setData(d.map(v => ({ time: v.time, value: 20 })));
        } else if (subInd === "adx") {
            const { adx, diPlus, diMinus } = calcADX(filtered);
            S.current.adxLine.setData(adx);
            S.current.adxPos.setData(diPlus);
            S.current.adxNeg.setData(diMinus);
            S.current.adx25.setData(adx.map(v => ({ time: v.time, value: 25 })));
        } else if (subInd === "obv") {
            S.current.obvLine.setData(calcOBV(filtered));
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
        if (targetPrice)        mkLine(targetPrice,  isSell ? "#ef5350" : "#26a69a",    2, 0, `${isHold ? "⬆ Resist" : "🎯 T1"}  Rs.${targetPrice.toFixed(2)}  (${targetPct >= 0 ? "+" : ""}${targetPct}%)`);
        if (target2)            mkLine(target2,      isSell ? "#f87171" : "#34d399",    1, 1, `🎯 T2  Rs.${target2.toFixed(2)}  (${target2Pct >= 0 ? "+" : ""}${target2Pct}%)`);
        if (stopLoss)           mkLine(stopLoss,     isSell ? "#26a69a" : "#ef5350",    2, 0, `${isHold ? "⬇ Supp"  : "🛑 SL"}  Rs.${stopLoss.toFixed(2)}  (${stopLossPct}%)`);
        if (trailingStop)       mkLine(trailingStop, "#f59e0b",                         1, 2, `~ Trail  Rs.${trailingStop.toFixed(2)}`);

        // ── Signal markers ─────────────────────────────────────────────────────
        if (markersP.current) { try { markersP.current.setMarkers([]); } catch (e) { void e; } }

        const times   = new Set(filtered.map(d => d.time));
        const markers = [];

        if (signalHistory?.length) {
            let last = null;
            for (const s of signalHistory) {
                if (!times.has(s.time) || s.signal === last) continue;
                last = s.signal;
                markers.push(s.signal === "BUY"
                    ? { time: s.time, position: "belowBar", color: "#26a69a", shape: "arrowUp",   text: "B", size: 1 }
                    : { time: s.time, position: "aboveBar", color: "#ef5350", shape: "arrowDown", text: "S", size: 1 });
            }
        }

        if (prediction && filtered.length) {
            const lastBar = filtered[filtered.length - 1];
            const ei = markers.findIndex(m => m.time === lastBar.time);
            const lm = prediction === "BUY"  ? { time: lastBar.time, position: "belowBar", color: "#26a69a", shape: "arrowUp",   text: "AI BUY",  size: 2 }
                     : prediction === "SELL" ? { time: lastBar.time, position: "aboveBar", color: "#ef5350", shape: "arrowDown", text: "AI SELL", size: 2 }
                     :                         { time: lastBar.time, position: "aboveBar", color: "#eab308", shape: "circle",    text: "HOLD",    size: 1 };
            if (ei >= 0) markers[ei] = lm; else markers.push(lm);
        }

        if (markers.length) {
            const plugin = createSeriesMarkers(chartType === "line" ? S.current.lineChart : S.current.candle);
            plugin.setMarkers(markers);
            markersP.current = plugin;
        }

        mainChart.current?.timeScale().fitContent();
    }, [data, tf, chartType, overlay, subInd, prediction, idealEntry, entryZoneLow, entryZoneHigh, targetPrice, target2, stopLoss, trailingStop, targetPct, target2Pct, stopLossPct, signalHistory, filteredData]);

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
            <div className="flex items-center gap-3 px-4 py-2 border-b shrink-0 flex-wrap gap-y-1.5" style={{ borderColor: BORDER }}>

                {/* Price + change */}
                <div className="flex items-center gap-2">
                    <span className="text-lg font-black tabular-nums" style={{ color: isUp ? "#26a69a" : "#ef5350" }}>
                        Rs.&nbsp;{fmt(ohlcv?.close ?? last?.close)}
                    </span>
                    <span className="text-xs font-bold px-2 py-0.5 rounded" style={{ background: isUp ? "rgba(38,166,154,0.12)" : "rgba(239,83,80,0.12)", color: isUp ? "#26a69a" : "#ef5350" }}>
                        {isUp ? "▲" : "▼"} {Math.abs(chg).toFixed(2)} ({isUp ? "+" : ""}{chgPct}%)
                    </span>
                </div>

                <div style={{ width: 1, height: 16, background: "rgba(255,255,255,0.07)" }} />

                {/* OHLV row */}
                {ohlcv ? (
                    <span className="text-xs font-mono" style={{ color: ohlcv.up ? "#26a69a" : "#ef5350" }}>
                        O&nbsp;{fmt(ohlcv.open)}&nbsp; H&nbsp;{fmt(ohlcv.high)}&nbsp; L&nbsp;{fmt(ohlcv.low)}&nbsp; C&nbsp;<strong>{fmt(ohlcv.close)}</strong>&nbsp; V&nbsp;{Math.round(ohlcv.volume).toLocaleString()}
                    </span>
                ) : (
                    <div className="flex items-center gap-3 text-xs" style={{ color: "#4a6080" }}>
                        <span>H <span style={{ color: "#94a3b8" }}>{fmt(last?.high)}</span></span>
                        <span>L <span style={{ color: "#94a3b8" }}>{fmt(last?.low)}</span></span>
                        <span>V <span style={{ color: "#94a3b8" }}>{Math.round(last?.value ?? 0).toLocaleString()}</span></span>
                        {atrVal != null && <span>ATR <span style={{ color: "#94a3b8" }}>{fmt(atrVal)}</span></span>}
                    </div>
                )}

                <div style={{ width: 1, height: 16, background: "rgba(255,255,255,0.07)" }} />

                {/* 52W stats */}
                {stats52w && (
                    <div className="flex items-center gap-3 text-xs" style={{ color: "#4a6080" }}>
                        <span>52W H <span style={{ color: "#22c55e" }}>{fmt(stats52w.high)}</span></span>
                        <span>52W L <span style={{ color: "#ef4444" }}>{fmt(stats52w.low)}</span></span>
                    </div>
                )}

                {/* RSI pill */}
                {rsiNow != null && (
                    <>
                        <div style={{ width: 1, height: 16, background: "rgba(255,255,255,0.07)" }} />
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                            style={{ background: `${rsiColor}14`, color: rsiColor, border: `1px solid ${rsiColor}30` }}>
                            RSI {rsiNow.toFixed(1)}{rsiNow > 70 ? " OB" : rsiNow < 30 ? " OS" : ""}
                        </span>
                    </>
                )}

                {/* Chart type badge */}
                {chartType !== "candle" && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                        style={{ background: "rgba(59,130,246,0.12)", color: "#60a5fa", border: "1px solid rgba(59,130,246,0.25)" }}>
                        {chartType === "ha" ? "HEIKIN-ASHI" : "LINE"}
                    </span>
                )}

                {/* Signal badge */}
                {prediction && (
                    <div className="ml-auto flex items-center gap-1.5 px-3 py-1 rounded-lg border font-black text-xs tracking-widest"
                        style={{ background: `${sigColor}14`, borderColor: `${sigColor}40`, color: sigColor }}>
                        <SigIcon style={{ width: 12, height: 12 }} />
                        {prediction}
                    </div>
                )}

                {/* Fullscreen */}
                <button onClick={toggleFullscreen} title={`${isFullscreen ? "Exit" : "Enter"} fullscreen (F)`}
                    className="p-1.5 rounded-md transition-colors hover:bg-white/5" style={{ color: "#4a6080" }}>
                    {isFullscreen ? <Minimize2 style={{ width: 14, height: 14 }} /> : <Maximize2 style={{ width: 14, height: 14 }} />}
                </button>
            </div>

            {/* ── Toolbar ────────────────────────────────────────────────────── */}
            <div className="flex items-center flex-wrap gap-1.5 px-3 py-2 border-b shrink-0" style={{ borderColor: BORDER }}>

                {/* Chart types */}
                <div className="flex rounded overflow-hidden" style={{ border: `1px solid ${BORDER}` }}>
                    {CHART_TYPES.map((ct, i) => (
                        <button key={ct.key} title={ct.title} onClick={() => setChartType(ct.key)}
                            style={{
                                padding: "3px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer",
                                borderRight: i < CHART_TYPES.length - 1 ? `1px solid ${BORDER}` : "none",
                                background: chartType === ct.key ? "rgba(59,130,246,0.22)" : "transparent",
                                color:      chartType === ct.key ? "#60a5fa" : "#4a6080",
                            }}>
                            {ct.label}
                        </button>
                    ))}
                </div>

                <div style={{ width: 1, height: 18, background: "rgba(255,255,255,0.06)" }} />

                {/* Timeframes */}
                <div className="flex rounded overflow-hidden" style={{ border: `1px solid ${BORDER}` }}>
                    {TFS.map((t, i) => (
                        <button key={t.label} onClick={() => setTf(t.label)}
                            style={{
                                padding: "3px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer",
                                borderRight: i < TFS.length - 1 ? `1px solid ${BORDER}` : "none",
                                background: tf === t.label ? "#3b82f6" : "transparent",
                                color:      tf === t.label ? "#fff"    : "#4a6080",
                            }}>
                            {t.label}
                        </button>
                    ))}
                </div>

                <div style={{ width: 1, height: 18, background: "rgba(255,255,255,0.06)" }} />

                {/* Overlays */}
                {OVERLAYS.map(({ key, label, color }) => (
                    <Btn key={key} onClick={() => toggleOverlay(key)} active={overlay[key]} color={color} title={`Toggle ${label}`}>
                        {label}
                    </Btn>
                ))}

                <div style={{ width: 1, height: 18, background: "rgba(255,255,255,0.06)" }} />

                {/* Sub-panel indicators */}
                {SUB_PANELS.map(({ key, label, color }) => (
                    <Btn key={key} onClick={() => toggleSub(key)} active={subInd === key} color={color} title={`${label} panel`}>
                        {label}
                    </Btn>
                ))}
                {subInd && (
                    <button onClick={() => setSubInd(null)}
                        style={{ padding: "3px 8px", borderRadius: 5, fontSize: 11, border: `1px solid ${BORDER}`, background: "transparent", color: "#475569", cursor: "pointer" }}>
                        ✕
                    </button>
                )}

                {/* Spacer + Reset */}
                <div style={{ flex: 1 }} />
                <button onClick={() => mainChart.current?.timeScale().fitContent()} title="Reset zoom (R)"
                    className="p-1.5 rounded hover:bg-white/5 transition-colors" style={{ color: "#4a6080" }}>
                    <RotateCcw style={{ width: 13, height: 13 }} />
                </button>
            </div>

            {/* ── Indicator legend ───────────────────────────────────────────── */}
            {(overlay.sma20 || overlay.sma50 || overlay.ema200 || overlay.ema9 || overlay.ema21 || overlay.bb || overlay.vwap || overlay.ich) && (
                <div className="flex items-center flex-wrap gap-x-4 gap-y-0.5 px-4 py-1.5 shrink-0" style={{ borderBottom: `1px solid ${BORDER}` }}>
                    {overlay.sma20  && legendVals.sma20  != null && <span style={{ fontSize: 11, fontWeight: 700, color: "#3b82f6" }}>MA20 {fmt(legendVals.sma20)}</span>}
                    {overlay.sma50  && legendVals.sma50  != null && <span style={{ fontSize: 11, fontWeight: 700, color: "#f59e0b" }}>MA50 {fmt(legendVals.sma50)}</span>}
                    {overlay.ema200 && legendVals.ema200 != null && <span style={{ fontSize: 11, fontWeight: 700, color: "#e879f9" }}>EMA200 {fmt(legendVals.ema200)}</span>}
                    {overlay.ema9   && legendVals.ema9   != null && <span style={{ fontSize: 11, fontWeight: 700, color: "#a78bfa" }}>EMA9 {fmt(legendVals.ema9)}</span>}
                    {overlay.ema21  && legendVals.ema21  != null && <span style={{ fontSize: 11, fontWeight: 700, color: "#ec4899" }}>EMA21 {fmt(legendVals.ema21)}</span>}
                    {overlay.vwap   && legendVals.vwap   != null && <span style={{ fontSize: 11, fontWeight: 700, color: "#14b8a6" }}>VWAP {fmt(legendVals.vwap)}</span>}
                    {overlay.bb     && <span style={{ fontSize: 11, fontWeight: 700, color: "#6366f1" }}>BB(20,2)</span>}
                    {overlay.ich    && <span style={{ fontSize: 11, fontWeight: 700, color: "#22c55e" }}>ICH — <span style={{ color: "#0ea5e9" }}>Tenkan</span> · <span style={{ color: "#f43f5e" }}>Kijun</span></span>}
                </div>
            )}

            {/* ── Main chart area ────────────────────────────────────────────── */}
            <div ref={mainRef} style={{ width: "100%", flex: showSub ? "0 0 62%" : "1 1 auto" }} />

            {/* ── Sub-panel ──────────────────────────────────────────────────── */}
            <div style={{ height: showSub ? "23%" : "0", overflow: "hidden", borderTop: showSub ? `1px solid ${BORDER}` : "none" }} className="shrink-0">
                {showSub && (
                    <div className="flex items-center gap-3 px-4 pt-1.5 pb-1">
                        {subInd === "rsi"   && <><span style={{ fontSize: 10, fontWeight: 700, color: "#22d3ee" }}>RSI (14)</span><span style={{ fontSize: 10, color: "rgba(239,68,68,0.7)" }}>— OB 70</span><span style={{ fontSize: 10, color: "rgba(34,197,94,0.7)" }}>— OS 30</span>{rsiNow != null && <span style={{ fontSize: 10, fontWeight: 700, color: rsiColor }}>&nbsp;Current: {rsiNow.toFixed(1)}</span>}</>}
                        {subInd === "macd"  && <><span style={{ fontSize: 10, fontWeight: 700, color: "#f472b6" }}>MACD (12,26,9)</span><span style={{ fontSize: 10, color: "#fb923c" }}>— Signal</span><span style={{ fontSize: 10, color: "#64748b" }}>&nbsp;▮ Hist</span></>}
                        {subInd === "stoch" && <><span style={{ fontSize: 10, fontWeight: 700, color: "#fb7185" }}>STOCH (14,3)</span><span style={{ fontSize: 10, color: "#fbbf24" }}>— %D</span><span style={{ fontSize: 10, color: "rgba(239,68,68,0.7)" }}>— OB 80</span><span style={{ fontSize: 10, color: "rgba(34,197,94,0.7)" }}>— OS 20</span></>}
                        {subInd === "adx"   && <><span style={{ fontSize: 10, fontWeight: 700, color: "#f97316" }}>ADX (14)</span><span style={{ fontSize: 10, color: "#22c55e" }}>— +DI</span><span style={{ fontSize: 10, color: "#ef4444" }}>— -DI</span><span style={{ fontSize: 10, color: "rgba(255,255,255,0.2)" }}>— Trend threshold 25</span></>}
                        {subInd === "obv"   && <><span style={{ fontSize: 10, fontWeight: 700, color: "#10b981" }}>OBV</span><span style={{ fontSize: 10, color: "#64748b" }}>&nbsp;On Balance Volume — rising = accumulation</span></>}
                        {subInd === "cci"   && <><span style={{ fontSize: 10, fontWeight: 700, color: "#a78bfa" }}>CCI (20)</span><span style={{ fontSize: 10, color: "rgba(239,68,68,0.7)" }}>— +100 OB</span><span style={{ fontSize: 10, color: "rgba(34,197,94,0.7)" }}>— -100 OS</span></>}
                        {subInd === "wr"    && <><span style={{ fontSize: 10, fontWeight: 700, color: "#fb923c" }}>Williams %R (14)</span><span style={{ fontSize: 10, color: "rgba(239,68,68,0.7)" }}>— -20 OB</span><span style={{ fontSize: 10, color: "rgba(34,197,94,0.7)" }}>— -80 OS</span></>}
                    </div>
                )}
                <div ref={subRef} style={{ width: "100%", height: "calc(100% - 28px)" }} />
            </div>

            {/* ── AI Levels bar ──────────────────────────────────────────────── */}
            {(targetPrice || stopLoss) && (
                <div className="flex items-center flex-wrap justify-around gap-x-5 gap-y-1 px-4 py-2 shrink-0"
                    style={{ borderTop: `1px solid ${BORDER}`, background: "#030910" }}>

                    {idealEntry && (
                        <LevelChip label="Entry" value={`Rs. ${fmt(idealEntry)}`} color="#94a3b8" />
                    )}
                    {targetPrice && (
                        <LevelChip label={prediction === "HOLD" ? "Resistance" : "T1"} value={`Rs. ${fmt(targetPrice)}`}
                            sub={targetPct != null ? `${targetPct >= 0 ? "+" : ""}${targetPct}%` : null}
                            color={isSell ? "#ef5350" : "#26a69a"} />
                    )}
                    {target2 && (
                        <LevelChip label="T2" value={`Rs. ${fmt(target2)}`}
                            sub={target2Pct != null ? `${target2Pct >= 0 ? "+" : ""}${target2Pct}%` : null}
                            color={isSell ? "#f87171" : "#34d399"} />
                    )}
                    {stopLoss && (
                        <LevelChip label={prediction === "HOLD" ? "Support" : "Stop Loss"} value={`Rs. ${fmt(stopLoss)}`}
                            sub={stopLossPct != null ? `${stopLossPct}%` : null}
                            color={isSell ? "#26a69a" : "#ef5350"} />
                    )}
                    {trailingStop && (
                        <LevelChip label="Trail Stop" value={`Rs. ${fmt(trailingStop)}`} color="#f59e0b" />
                    )}
                    {riskReward != null && (
                        <div className="flex flex-col items-center">
                            <span style={{ fontSize: 9, color: "#4a6080", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>Risk : Reward</span>
                            <span style={{ fontSize: 13, fontWeight: 900, color: riskReward >= 2 ? "#22c55e" : riskReward >= 1 ? "#f59e0b" : "#ef4444" }}>
                                1 : {Number(riskReward).toFixed(2)}
                            </span>
                        </div>
                    )}
                    {estimatedDays && (
                        <LevelChip label="Timeline" value={`${estimatedDays} days`} color="#3b82f6" />
                    )}
                </div>
            )}
        </div>
    );
}

function LevelChip({ label, value, sub, color }) {
    return (
        <div className="flex flex-col items-center">
            <span style={{ fontSize: 9, color: "#4a6080", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</span>
            <span style={{ fontSize: 13, fontWeight: 900, color }}>{value}</span>
            {sub && <span style={{ fontSize: 10, fontWeight: 700, color, opacity: 0.8 }}>{sub}</span>}
        </div>
    );
}
