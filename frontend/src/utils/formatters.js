export const fmt = (n, d = 2) => {
    if (n == null || isNaN(n)) return '—';
    return Number(n).toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d });
};

export const fmtVol = (n) => {
    if (!n) return '—';
    if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e7) return (n / 1e7).toFixed(2) + 'Cr';
    if (n >= 1e5) return (n / 1e5).toFixed(2) + 'L';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return String(Math.round(n));
};

export const chgColor = (v) => {
    if (v > 0) return '#22c55e';
    if (v < 0) return '#ef4444';
    return '#64748b';
};

export const relativeTime = (dateStr) => {
    const diff = (Date.now() - new Date(dateStr)) / 1000;
    if (diff < 60)        return `${Math.floor(diff)}s ago`;
    if (diff < 3600)      return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400)     return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

export const fmtPrice = (v) =>
    v != null ? `Rs. ${Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : null;

export const fmtPct = (v) =>
    v != null ? `${v >= 0 ? '+' : ''}${Number(v).toFixed(2)}%` : null;
