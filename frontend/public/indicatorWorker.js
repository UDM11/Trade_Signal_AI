/**
 * Institutional Chart Indicator Worker
 * Offloads heavy mathematical calculations from the main UI thread.
 */

self.onmessage = function(e) {
    const { task, data, params } = e.data;
    let result = null;

    try {
        switch(task) {
            case 'CALC_ALL':
                result = calculateAll(data, params);
                break;
            case 'RSI':
                result = calcRSI(data, params.period);
                break;
            case 'MACD':
                result = calcMACD(data, params.fast, params.slow, params.signal);
                break;
            default:
                break;
        }
        self.postMessage({ task, result, status: 'success' });
    } catch (error) {
        self.postMessage({ task, error: error.message, status: 'error' });
    }
};

function calculateAll(data, params) {
    return {
        rsi: calcRSI(data, 14),
        macd: calcMACD(data, 12, 26, 9),
        sma20: calcSMA(data, 20),
        sma50: calcSMA(data, 50),
        ema200: calcEMA(data, 200),
        bb: calcBB(data, 20, 2)
    };
}

// ── Indicator Algorithms ──────────────────────────────────────────────────

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

function calcSMA(data, period) {
    const out = [];
    for (let i = period - 1; i < data.length; i++) {
        const avg = data.slice(i - period + 1, i + 1).reduce((s, d) => s + d.close, 0) / period;
        out.push({ time: data[i].time, value: avg });
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
        out.push({ time: data[i].time, value: l === 0 ? 100 : 100 - 100 / (1 + (g / period) / (l / period)) });
    }
    return out;
}

function calcMACD(data, fast = 12, slow = 26, sig = 9) {
    const ef = calcEMA(data, fast);
    const es = calcEMA(data, slow);
    const macd = es.map(s => {
        const f = ef.find(x => x.time === s.time);
        return f ? { time: f.time, value: f.value - s.value } : null;
    }).filter(Boolean);
    
    const signal = calcEMA(macd.map(m => ({ ...m, close: m.value })), sig);
    return {
        macd,
        signal,
        hist: signal.map(s => {
            const m = macd.find(x => x.time === s.time);
            return m ? { 
                time: s.time, 
                value: m.value - s.value, 
                color: m.value - s.value >= 0 ? "rgba(34,197,94,0.65)" : "rgba(239,68,68,0.65)" 
            } : null;
        }).filter(Boolean)
    };
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
