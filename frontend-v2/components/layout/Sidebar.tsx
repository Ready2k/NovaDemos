import { cn } from '@/lib/utils';

interface SidebarProps {
    className?: string;
    isDarkMode?: boolean;
}

export default function Sidebar({ className, isDarkMode = true }: SidebarProps) {
    const navItems = [
        { icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>, label: 'Live Session', active: true },
        { icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" /></svg>, label: 'Voice / General', active: false },
        { icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>, label: 'Contacts', active: false },
        { icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>, label: 'Conversations', active: false },
        { icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>, label: 'Archive', active: false },
        { icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>, label: 'Preferences', active: false },
        { icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>, label: 'Personas', active: false },
    ];

    const actionItems = [
        { icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>, label: 'Settings', active: false },
        { icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>, label: 'Logs', active: false },
        { icon: '✨', label: 'New Session' },
    ];

    return (
        <div className={cn(
            "w-16 flex flex-col items-center py-6 gap-2 transition-colors duration-300",
            isDarkMode ? "bg-ink-surface border-r border-white/8" : "bg-gray-50 border-r border-gray-200",
            className
        )}>
            {/* Logo */}
            <div className="mb-6 w-10 h-10 rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-white font-bold text-sm">A</div>

            {/* Navigation Items */}
            <div className="flex flex-col gap-2 flex-1">
                {navItems.map((item, idx) => (
                    <button
                        key={idx}
                        className={cn(
                            "w-10 h-10 rounded-lg flex items-center justify-center transition-all duration-200 border",
                            item.active
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
                {actionItems.map((item, idx) => (
                    <button
                        key={idx}
                        className={cn(
                            "w-10 h-10 rounded-lg flex items-center justify-center border transition-all duration-200",
                            isDarkMode
                                ? "text-ink-text-muted border-transparent hover:bg-white/5 hover:border-white/10 hover:text-ink-text-primary"
                                : "text-gray-500 border-transparent hover:bg-gray-100 hover:border-gray-200 hover:text-gray-700"
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
