import { cn } from '@/lib/utils';

interface MobileNavProps {
    className?: string;
}

export default function MobileNav({ className }: MobileNavProps) {
    const navItems = [
        { icon: '🎙️', label: 'Live' },
        { icon: '💬', label: 'Chat' },
        { icon: '👤', label: 'Settings' },
        { icon: '✨', label: 'New' },
    ];

    return (
        <div className={cn(
            "fixed bottom-0 left-0 right-0 bg-ink-surface/95 backdrop-blur-xl border-t border-white/8 safe-area-inset-bottom",
            className
        )}>
            <div className="flex items-center justify-around px-4 py-2">
                {navItems.map((item, idx) => (
                    <button
                        key={idx}
                        className="flex flex-col items-center gap-0.5 min-w-[50px]"
                    >
                        <span className="text-base">{item.icon}</span>
                        <span className="text-[9px] text-ink-text-muted uppercase tracking-wide">{item.label}</span>
                    </button>
                ))}
            </div>
        </div>
    );
}
