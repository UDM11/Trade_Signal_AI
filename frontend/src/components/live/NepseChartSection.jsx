import React from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Brush } from 'recharts';
import { api } from '../../api';
import { Maximize2, Activity } from 'lucide-react';

export default function NepseChartSection({ data: intradayData = [], index, onSelect }) {
    const [tf, setTf] = React.useState('1D');
    const [histData, setHistData] = React.useState([]);
    const [loading, setLoading] = React.useState(false);

    // Fetch history when TF changes
    React.useEffect(() => {
        if (tf === '1D') return;
        const fetchHist = async () => {
            setLoading(true);
            try {
                const res = await api.getNepseChart('NEPSE');
                let raw = res.data.chart_data || [];
                
                const now = new Date();
                if (tf === '1W') raw = raw.filter(d => (now - new Date(d.time)) < 7 * 86400000);
                else if (tf === '1M') raw = raw.filter(d => (now - new Date(d.time)) < 30 * 86400000);
                
                setHistData(raw.map(d => ({ ...d, value: d.close })));
            } catch (e) {
                console.error("Failed to fetch NEPSE history", e);
            } finally {
                setLoading(false);
            }
        };
        fetchHist();
    }, [tf]);

    const activeData = tf === '1D' ? intradayData : histData;

    if ((!activeData || activeData.length === 0) && !loading) {
        return <NepseChartSkeleton />;
    }

    if (loading) return <NepseChartSkeleton />;

    const last = activeData[activeData.length - 1];
    const first = activeData[0];
    
    // Calculate local change from data points
    const calcChange = last.value - (tf === '1D' ? first.value : first.close || first.value);
    const calcChgPct = (calcChange / (tf === '1D' ? first.value : first.close || first.value)) * 100;

    // Use absolute index from API if 1D (to match Navbar), otherwise use calculated
    const displayValue  = (tf === '1D' && index?.value) ? index.value : last.value;
    const displayChange = (tf === '1D' && index?.change != null) ? index.change : calcChange;
    const displayChgPct = (tf === '1D' && index?.change_pct != null) ? index.change_pct : calcChgPct;
    
    const isUp = displayChange >= 0;

    const handleNavigate = () => {
        onSelect && onSelect({ 
            symbol: 'NEPSE', 
            name: 'NEPSE Index', 
            ltp: displayValue, 
            change: displayChange, 
            change_pct: displayChgPct 
        });
    };

    return (
        <div className="rounded-xl sm:rounded-2xl p-3 sm:p-6 relative overflow-hidden group select-none transition-shadow duration-300 hover:shadow-[0_8px_30px_rgba(0,0,0,0.3)]" 
             style={{ background: 'var(--color-glass)', border: '1px solid var(--color-glass-border)', touchAction: 'none' }}>
            
            {/* Top gradient accent line */}
            <div className="absolute top-0 left-0 right-0 h-[2px] opacity-60" 
                 style={{ background: `linear-gradient(90deg, transparent, ${isUp ? '#22c55e' : '#ef4444'}, transparent)` }} />
            
            {/* Glossy Header */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 sm:gap-6 mb-4 sm:mb-8">
                <div className="flex-1">
                    <div className="flex items-center flex-wrap gap-2 sm:gap-3">
                        <h3 className="text-[8px] sm:text-[10px] font-black text-text-muted uppercase tracking-[0.2em] sm:tracking-[0.3em] flex items-center gap-1.5 sm:gap-2 cursor-pointer hover:text-blue-400 transition-colors"
                            onClick={handleNavigate}>
                            <Activity className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-blue-500" />
                            NEPSE Index
                            <span className={`w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full animate-pulse ${isUp ? 'bg-bullish shadow-[0_0_10px_rgba(34,197,94,0.5)]' : 'bg-bearish shadow-[0_0_10px_rgba(239,68,68,0.5)]'}`} />
                        </h3>
                        <button 
                            onClick={handleNavigate}
                            className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-white/5 hover:bg-white/10 border border-white/5 text-[8px] font-bold text-blue-400 transition-all uppercase tracking-wider group"
                        >
                            <Maximize2 className="w-2 h-2 group-hover:scale-110 transition-transform" />
                            Terminal
                        </button>
                    </div>
                    <div className="flex items-baseline flex-wrap gap-2 sm:gap-3 mt-2 sm:mt-2">
                        <span className="text-xl sm:text-4xl font-black text-white tabular-nums tracking-tighter">
                            {displayValue?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </span>
                        <div className={`flex items-center font-black text-[9px] sm:text-sm px-1.5 sm:px-2.5 py-0.5 sm:py-1 rounded-lg sm:rounded-xl ${isUp ? 'text-bullish bg-bullish/10' : 'text-bearish bg-bearish/10'}`}>
                            {isUp ? '▲' : '▼'} {Math.abs(displayChange).toFixed(2)} ({Math.abs(displayChgPct).toFixed(2)}%)
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-1 bg-white/5 p-0.5 sm:p-1 rounded-lg sm:rounded-xl self-start lg:self-center border border-white/5 shadow-inner">
                    {['1D', '1W', '1M', 'ALL'].map(t => (
                        <button 
                            key={t}
                            onClick={() => setTf(t)}
                            className={`px-2 sm:px-4 py-1 sm:py-2 rounded-md sm:rounded-lg text-[8px] sm:text-[10px] font-black transition-all ${tf === t ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30' : 'text-text-muted hover:text-white hover:bg-white/5'}`}
                        >
                            {t}
                        </button>
                    ))}
                </div>
            </div>

            <div className="h-[250px] sm:h-[300px] lg:h-[350px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={activeData}>
                        <defs>
                            <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={isUp ? '#22c55e' : '#ef4444'} stopOpacity={0.25}/>
                                <stop offset="95%" stopColor={isUp ? '#22c55e' : '#ef4444'} stopOpacity={0}/>
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" vertical={false} />
                        <XAxis 
                            dataKey="time" 
                            axisLine={false}
                            tickLine={false}
                            tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 9, fontWeight: 700 }}
                            minTickGap={40}
                            dy={10}
                        />
                        <YAxis 
                            orientation="right"
                            domain={['auto', 'auto']} 
                            axisLine={false}
                            tickLine={false}
                            tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 9, fontWeight: 700 }}
                            dx={10}
                        />
                        <Tooltip 
                            content={<CustomTooltip />} 
                            cursor={{ stroke: 'rgba(255,255,255,0.2)', strokeWidth: 1, strokeDasharray: '4 4' }}
                        />
                        <Area 
                            type="monotone" 
                            dataKey="value" 
                            stroke={isUp ? '#22c55e' : '#ef4444'} 
                            strokeWidth={3}
                            fillOpacity={1} 
                            fill="url(#colorValue)" 
                            animationDuration={1500}
                        />
                        {tf !== '1D' && (
                            <Brush 
                                dataKey="time" 
                                height={20} 
                                stroke="#3b82f6" 
                                fill="rgba(0,0,0,0.2)"
                                travellerWidth={10}
                                tickFormatter={() => ''}
                            />
                        )}
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}

function NepseChartSkeleton() {
    return (
        <div className="rounded-2xl p-6 animate-pulse relative overflow-hidden" style={{ background: 'var(--color-glass)', border: '1px solid var(--color-glass-border)' }}>
            <div className="flex items-center justify-between mb-8">
                <div className="space-y-3">
                    <div className="h-3 w-24 bg-white/5 rounded-full" />
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-48 bg-white/10 rounded-xl" />
                        <div className="h-6 w-24 bg-white/5 rounded-lg" />
                    </div>
                </div>
                <div className="hidden sm:flex gap-6">
                    <div className="space-y-2">
                        <div className="h-2 w-16 bg-white/5 rounded-full ml-auto" />
                        <div className="h-5 w-24 bg-white/10 rounded-lg" />
                    </div>
                    <div className="space-y-2">
                        <div className="h-2 w-16 bg-white/5 rounded-full ml-auto" />
                        <div className="h-5 w-24 bg-white/10 rounded-lg" />
                    </div>
                </div>
            </div>
            <div className="h-[250px] w-full bg-gradient-to-t from-white/0 to-white/5 rounded-xl border-t border-white/5 relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full animate-[shimmer_2s_infinite]" />
            </div>
        </div>
    );
}

function CustomTooltip({ active, payload }) {
    if (active && payload && payload.length) {
        return (
            <div className="bg-surface/90 backdrop-blur-md border border-white/10 p-3 rounded-xl shadow-2xl">
                <p className="text-[10px] font-bold text-text-muted uppercase mb-1">{payload[0].payload.time}</p>
                <p className="text-sm font-black text-white tabular-nums">
                    {payload[0].value?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </p>
            </div>
        );
    }
    return null;
}
