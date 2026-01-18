'use client';

import Sidebar from '@/components/layout/Sidebar';
import InsightPanel from '@/components/layout/InsightPanel';
import MobileNav from '@/components/layout/MobileNav';
import IntelligenceOrb from '@/components/intelligence/IntelligenceOrb';
import ChatContainer from '@/components/chat/ChatContainer';
import CommandBar from '@/components/chat/CommandBar';
import { useState } from 'react';
import { cn } from '@/lib/utils';

export default function Home() {
  const [sentiment, setSentiment] = useState(0.5); // Placeholder
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'recording'>('connected');
  const [isDarkMode, setIsDarkMode] = useState(true);

  return (
    <div className={cn(
      "flex h-screen overflow-hidden transition-colors duration-300",
      isDarkMode ? "bg-ink-bg" : "bg-white"
    )}>
      {/* Desktop: Slim iconic sidebar (60px) */}
      <Sidebar className="hidden md:flex" isDarkMode={isDarkMode} />

      {/* Main content area */}
      <main className="flex-1 flex flex-col min-w-0 relative">
        {/* Header with title, version, and mode */}
        <header className={cn(
          "flex items-center justify-between px-8 py-4 border-b transition-colors duration-300",
          isDarkMode ? "border-white/8" : "border-gray-200"
        )}>
          <div className="flex flex-col gap-1">
            <h1 className={cn(
              "text-xl font-semibold transition-colors duration-300",
              isDarkMode ? "text-ink-text-primary" : "text-gray-900"
            )}>Aspirational</h1>
            <div className={cn(
              "flex items-center gap-3 text-xs transition-colors duration-300",
              isDarkMode ? "text-ink-text-muted" : "text-gray-600"
            )}>
              <span>v1.0.0</span>
              <span>•</span>
              <span>Built: Jan 18, 05:59 PM</span>
              <span>•</span>
              <span className={cn(
                "px-2 py-0.5 rounded border transition-colors duration-300",
                isDarkMode ? "bg-white/5 border-white/8" : "bg-gray-100 border-gray-300"
              )}>Mode: Nova Sonic</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsDarkMode(!isDarkMode)}
              className={cn(
                "w-9 h-9 rounded-lg flex items-center justify-center border transition-all duration-300",
                isDarkMode ? "bg-white/5 hover:bg-white/10 border-white/8" : "bg-gray-100 hover:bg-gray-200 border-gray-300"
              )}
              title={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              <span className="text-base">{isDarkMode ? '☀️' : '🌙'}</span>
            </button>
          </div>
        </header>

        {/* Intelligence Orb (center stage) */}
        <IntelligenceOrb sentiment={sentiment} isActive={true} />

        {/* Chat Container - now with proper flex */}
        <div className="flex-1 overflow-hidden">
          <ChatContainer isDarkMode={isDarkMode} />
        </div>

        {/* Command Bar - now part of flex layout, not fixed */}
        <div className="flex-shrink-0 pb-0 md:pb-0 mb-16 md:mb-0">
          <CommandBar status={connectionStatus} isDarkMode={isDarkMode} />
        </div>
      </main>

      {/* Desktop: Right insight panel */}
      <InsightPanel className="hidden lg:flex" isDarkMode={isDarkMode} />

      {/* Mobile: Bottom nav */}
      <MobileNav className="md:hidden" />
    </div>
  );
}
