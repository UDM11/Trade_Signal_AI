/**
 * Standard formatters for numbers, dates, and trade-specific metrics.
 */

export function fmt(n, d = 2) {
    if (n == null || isNaN(n)) return '—';
    return Number(n).toLocaleString('en-IN', {
        minimumFractionDigits: d,
        maximumFractionDigits: d
    });
}

export function fmtVol(n) {
    if (!n) return '—';
    if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e7) return (n / 1e7).toFixed(2) + 'Cr';
    if (n >= 1e5) return (n / 1e5).toFixed(2) + 'L';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return String(Math.round(n));
}

export function timeAgo(iso) {
    if (!iso) return '—';
    const diff = Math.floor((Date.now() - new Date(iso)) / 1000);
    if (diff < 60)   return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
}

export function chgColor(v) {
    if (v > 0) return 'var(--color-bullish)';
    if (v < 0) return 'var(--color-bearish)';
    return 'var(--color-text-muted)';
}

export function getSignalColors(sig) {
    const map = {
        BUY: {
            text: 'var(--color-bullish)',
            bg: 'rgba(34,197,94,0.1)',
            border: 'rgba(34,197,94,0.25)',
            glow: 'rgba(34,197,94,0.05)'
        },
        SELL: {
            text: 'var(--color-bearish)',
            bg: 'rgba(239,68,68,0.1)',
            border: 'rgba(239,68,68,0.25)',
            glow: 'rgba(239,68,68,0.05)'
        },
        HOLD: {
            text: 'var(--color-warning)',
            bg: 'rgba(245,158,11,0.1)',
            border: 'rgba(245,158,11,0.25)',
            glow: 'rgba(245,158,11,0.05)'
        }
    };
    return map[sig] || {
        text: 'var(--color-text-muted)',
        bg: 'rgba(100,116,139,0.1)',
        border: 'rgba(100,116,139,0.2)',
        glow: 'transparent'
    };
}
