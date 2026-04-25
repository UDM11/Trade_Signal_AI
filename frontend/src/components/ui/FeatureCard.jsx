import React, { useRef, useState } from 'react';
import { ArrowRight } from 'lucide-react';

export default function FeatureCard({ Icon, color, glow, border, title, desc, badge, onClick }) {
    const cardRef = useRef(null);
    const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
    const [isHovering, setIsHovering] = useState(false);

    const handleMouseMove = (e) => {
        if (!cardRef.current) return;
        const rect = cardRef.current.getBoundingClientRect();
        setMousePosition({
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
        });
    };

    return (
        <button 
            ref={cardRef}
            onClick={onClick}
            onMouseMove={handleMouseMove}
            onMouseEnter={() => setIsHovering(true)}
            onMouseLeave={() => setIsHovering(false)}
            className="group relative rounded-2xl overflow-hidden text-left w-full transition-all duration-300 hover:-translate-y-1"
            style={{ 
                background: 'var(--color-glass)', 
                border: `1px solid ${border || 'var(--color-glass-border)'}`, 
                boxShadow: isHovering ? `0 8px 32px ${glow || 'transparent'}` : `0 4px 16px rgba(0,0,0,0.2)`
            }}>
            
            {/* Top edge highlight */}
            <div className="absolute top-0 left-0 right-0 h-[2px] opacity-50 group-hover:opacity-100 transition-opacity duration-300"
                style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)` }} />
            
            {/* Spotlight Glow Effect tracking mouse */}
            <div 
                className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
                style={{ 
                    background: isHovering ? `radial-gradient(400px circle at ${mousePosition.x}px ${mousePosition.y}px, ${glow || 'rgba(255,255,255,0.06)'}, transparent 40%)` : 'transparent',
                }} 
            />

            {/* Static radial background backup */}
            <div className="absolute inset-0 opacity-0 group-hover:opacity-50 transition-opacity duration-300 pointer-events-none"
                style={{ background: `radial-gradient(ellipse at top left, ${glow} 0%, transparent 70%)` }} />
            
            <div className="relative p-6 z-10">
                <div className="flex items-start justify-between mb-4">
                    <div className="p-3 rounded-xl transition-transform duration-300 group-hover:scale-110" 
                        style={{ background: glow || 'rgba(255,255,255,0.03)', border: `1px solid ${border || 'rgba(255,255,255,0.05)'}` }}>
                        <Icon className="w-5 h-5 drop-shadow-md" style={{ color }} />
                    </div>
                    {badge && (
                        <span className="text-[10px] font-black px-2.5 py-1 rounded-lg tracking-wide uppercase shadow-sm"
                            style={{ background: `${color}18`, color: color, border: `1px solid ${color}40` }}>
                            {badge}
                        </span>
                    )}
                </div>
                <h3 className="text-lg font-black text-white mb-2 group-hover:text-primary transition-colors">{title}</h3>
                <p className="text-xs leading-relaxed text-text-muted mb-6">{desc}</p>
                <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest transition-colors duration-300" style={{ color }}>
                    Explore Feature <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1.5 transition-transform duration-300" />
                </div>
            </div>
        </button>
    );
}
