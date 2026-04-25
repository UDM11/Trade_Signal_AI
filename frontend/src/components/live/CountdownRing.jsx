import React from 'react';

export default function CountdownRing({ refreshing }) {
    const R = 14;
    const C = 2 * Math.PI * R; // ~87.96
    return (
        <div className="relative flex items-center justify-center" style={{ width: 36, height: 36 }}>
            <svg width="36" height="36" style={{ position: 'absolute', top: 0, left: 0 }}>
                <circle cx="18" cy="18" r={R} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="2" />
                <circle
                    cx="18" cy="18" r={R}
                    fill="none"
                    stroke={refreshing ? 'var(--color-primary)' : 'rgba(59,130,246,0.45)'}
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeDasharray={`${C} ${C}`}
                    className="countdown-ring"
                    style={{ transition: refreshing ? 'stroke 0.3s' : undefined }}
                />
            </svg>
            <span
                className="rounded-full"
                style={{
                    width: 6, height: 6,
                    background: refreshing ? 'var(--color-primary)' : 'rgba(59,130,246,0.5)',
                    boxShadow: refreshing ? '0 0 6px var(--color-primary)' : 'none',
                    transition: 'all 0.3s',
                }}
            />
        </div>
    );
}
