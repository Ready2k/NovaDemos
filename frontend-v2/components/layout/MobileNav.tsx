import { cn } from '@/lib/utils';
import { useApp } from '@/lib/context/AppContext';
import { useState } from 'react';

interface MobileNavProps {
    className?: string;
}

export default function MobileNav({ className }: MobileNavProps) {
    const { activeView, navigateTo, resetSession, isDarkMode } = useApp();
    const [confirmReset, setConfirmReset] = useState(false);

    const handleNewSession = () => {
        if (confirmReset) {
            resetSession();
            setConfirmReset(false);
        } else {
            setConfirmReset(true);
            setTimeout(() => setConfirmReset(false), 3000);
        }
    };

    const navItems = [
        {
            id: 'chat',
            icon: '🎙️',
            label: 'Live',
            action: () => navigateTo('chat'),
            isActive: activeView === 'chat'
        },
        {
            id: 'history',
            icon: '💬',
            label: 'Chat',
            action: () => navigateTo('history'),
            isActive: activeView === 'history'
        },
        {
            id: 'settings',
            icon: '👤',
            label: 'Settings',
            action: () => navigateTo('settings'),
            isActive: activeView === 'settings'
        },
        {
            id: 'new',
            icon: confirmReset ? '✅' : '✨',
            label: confirmReset ? 'Confirm' : 'New',
            action: handleNewSession,
            isActive: false,
            isWarning: confirmReset
        },
    ];

    return (
        <div className={cn(
            "fixed bottom-0 left-0 right-0 border-t safe-area-inset-bottom z-50 transition-colors duration-300",
            isDarkMode ? "bg-ink-surface/95 backdrop-blur-xl border-white/8" : "bg-white/95 backdrop-blur-xl border-gray-200",
            className
        )}>
            <div className="flex items-center justify-around px-2 py-2">
                {navItems.map((item) => (
                    <button
                        key={item.id}
                        onClick={item.action}
                        className={cn(
                            "flex flex-col items-center justify-center w-16 h-14 gap-1 rounded-xl transition-all duration-200",
                            item.isActive
                                ? (isDarkMode ? "bg-white/10 text-ink-text-primary" : "bg-violet-100 text-violet-700")
                                : (isDarkMode ? "text-ink-text-muted hover:text-ink-text-primary hover:bg-white/5" : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"),
                            item.isWarning && (isDarkMode ? "bg-red-500/20 text-red-500" : "bg-red-100 text-red-600")
                        )}
                    >
                        <span className="text-xl leading-none mb-0.5">{item.icon}</span>
                        <span className={cn(
                            "text-[10px] uppercase tracking-wider font-medium",
                            item.isActive ? "opacity-100" : "opacity-70"
                        )}>
                            {item.label}
                        </span>
                    </button>
                ))}
            </div>
        </div>
    );
}
