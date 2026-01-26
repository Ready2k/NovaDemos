import { cn } from '@/lib/utils';
import { useApp } from '@/lib/context/AppContext';
import { useState } from 'react';

interface SidebarProps {
    className?: string;
}

export default function Sidebar({ className }: SidebarProps) {
    const {
        isDarkMode,
        activeView,
        navigateTo,
        resetSession,
        setIsAboutModalOpen,
        setActiveSettingsTab
    } = useApp();

    const [confirmReset, setConfirmReset] = useState(false);

    const navItems = [
        {
            id: 'chat',
            icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>,
            label: 'Live Session'
        },
        {
            id: 'settings',
            icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
            label: 'Settings'
        },
        {
            id: 'workflow',
            icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" /></svg>,
            label: 'Workflow'
        },
        {
            id: 'history',
            icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
            label: 'History'
        },
    ];

    const actionItems = [
        {
            id: 'new_session',
            // Show checkmark when confirming, recycle icon otherwise
            icon: confirmReset ? (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
            ) : (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            ),
            label: confirmReset ? 'Click to Confirm' : 'New Session',
            action: () => {
                if (confirmReset) {
                    resetSession();
                    setConfirmReset(false);
                } else {
                    setConfirmReset(true);
                    // Build-in timeout to reset confirmation state if not clicked
                    setTimeout(() => setConfirmReset(false), 3000);
                }
            },
            isWarning: confirmReset
        },
    ];

    return (
        <div className={cn(
            "w-16 flex flex-col items-center py-6 gap-2 transition-colors duration-300",
            isDarkMode ? "bg-ink-surface border-r border-white/8" : "bg-gray-50 border-r border-gray-200",
            className
        )}>
            {/* Logo */}
            <button
                onClick={() => setIsAboutModalOpen(true)}
                title="About Voice S2S"
                className="mb-6 w-10 h-10 rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-white font-bold text-sm shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-200"
            >
                A
            </button>

            {/* Navigation Items */}
            <div className="flex flex-col gap-2 flex-1">
                {navItems.map((item) => (
                    <button
                        key={item.id}
                        onClick={() => navigateTo(item.id as any)}
                        className={cn(
                            "w-10 h-10 rounded-lg flex items-center justify-center transition-all duration-200 border",
                            activeView === item.id
                                ? isDarkMode
                                    ? "bg-white/10 text-ink-text-primary border-white/20 shadow-lg"
                                    : "bg-violet-100 text-violet-700 border-violet-200 shadow-md"
                                : isDarkMode
                                    ? "text-ink-text-muted border-transparent hover:bg-white/5 hover:border-white/10 hover:text-ink-text-primary"
                                    : "text-gray-500 border-transparent hover:bg-gray-100 hover:border-gray-200 hover:text-gray-700"
                        )}
                        title={item.label}
                    >
                        {item.icon}
                    </button>
                ))}
            </div>

            {/* Action Items */}
            <div className={cn(
                "flex flex-col gap-2 mt-auto pt-4 border-t transition-colors duration-300",
                isDarkMode ? "border-white/8" : "border-gray-200"
            )}>
                {actionItems.map((item) => (
                    <button
                        key={item.id}
                        onClick={item.action}
                        className={cn(
                            "w-10 h-10 rounded-lg flex items-center justify-center border transition-all duration-200",
                            item.isWarning
                                ? (isDarkMode ? "bg-red-500/20 text-red-500 border-red-500/50" : "bg-red-100 text-red-600 border-red-200")
                                : (isDarkMode
                                    ? "text-ink-text-muted border-transparent hover:bg-white/5 hover:border-white/10 hover:text-ink-text-primary"
                                    : "text-gray-500 border-transparent hover:bg-gray-100 hover:border-gray-200 hover:text-gray-700")
                        )}
                        title={item.label}
                    >
                        {item.icon}
                    </button>
                ))}
            </div>
        </div>
    );
}
