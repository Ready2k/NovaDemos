'use client';

import { useState, useEffect, useRef } from 'react';
import { Phone, PhoneOff, Wrench, ChevronDown, ChevronUp } from 'lucide-react';
import { useApp } from '@/lib/context/AppContext';
import type { SbcCall, SbcMessage } from '@/lib/context/AppContext';
import { cn } from '@/lib/utils';

// ── Duration timer ──────────────────────────────────────────────────────────

function useDuration(startTime: number, endTime?: number) {
    const [elapsed, setElapsed] = useState(0);

    useEffect(() => {
        if (endTime) {
            setElapsed(Math.floor((endTime - startTime) / 1000));
            return;
        }
        const id = setInterval(() => {
            setElapsed(Math.floor((Date.now() - startTime) / 1000));
        }, 1000);
        return () => clearInterval(id);
    }, [startTime, endTime]);

    const m = Math.floor(elapsed / 60).toString().padStart(2, '0');
    const s = (elapsed % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
}

// ── Message row ──────────────────────────────────────────────────────────────

function MessageRow({ msg, isDarkMode }: { msg: SbcMessage; isDarkMode: boolean }) {
    const [expanded, setExpanded] = useState(false);

    if (msg.role === 'tool_use') {
        return (
            <div className={cn(
                'rounded-lg border p-3 text-xs font-mono',
                isDarkMode ? 'border-violet-500/30 bg-violet-500/10' : 'border-violet-300 bg-violet-50'
            )}>
                <button
                    onClick={() => setExpanded(e => !e)}
                    className="flex items-center gap-2 w-full text-left"
                >
                    <Wrench className="w-3 h-3 text-violet-400 shrink-0" />
                    <span className={isDarkMode ? 'text-violet-300' : 'text-violet-700'}>
                        Tool: <strong>{msg.toolName}</strong>
                    </span>
                    {expanded
                        ? <ChevronUp className="w-3 h-3 ml-auto text-violet-400" />
                        : <ChevronDown className="w-3 h-3 ml-auto text-violet-400" />
                    }
                </button>
                {expanded && msg.args && (
                    <pre className={cn(
                        'mt-2 p-2 rounded text-[10px] overflow-x-auto',
                        isDarkMode ? 'bg-black/30 text-violet-200' : 'bg-violet-100 text-violet-800'
                    )}>
                        {JSON.stringify(msg.args, null, 2)}
                    </pre>
                )}
            </div>
        );
    }

    if (msg.role === 'tool_result') {
        return (
            <div className={cn(
                'rounded-lg border p-3 text-xs font-mono',
                isDarkMode ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-emerald-300 bg-emerald-50'
            )}>
                <button
                    onClick={() => setExpanded(e => !e)}
                    className="flex items-center gap-2 w-full text-left"
                >
                    <Wrench className="w-3 h-3 text-emerald-400 shrink-0" />
                    <span className={isDarkMode ? 'text-emerald-300' : 'text-emerald-700'}>
                        Result: <strong>{msg.toolName}</strong>
                    </span>
                    {expanded
                        ? <ChevronUp className="w-3 h-3 ml-auto text-emerald-400" />
                        : <ChevronDown className="w-3 h-3 ml-auto text-emerald-400" />
                    }
                </button>
                {expanded && (
                    <pre className={cn(
                        'mt-2 p-2 rounded text-[10px] overflow-x-auto whitespace-pre-wrap',
                        isDarkMode ? 'bg-black/30 text-emerald-200' : 'bg-emerald-100 text-emerald-800'
                    )}>
                        {msg.text}
                    </pre>
                )}
            </div>
        );
    }

    // user / assistant transcript
    const isAssistant = msg.role === 'assistant';
    return (
        <div className={cn('flex gap-2 items-start', isAssistant ? 'flex-row-reverse' : 'flex-row')}>
            <div className={cn(
                'w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-[10px]',
                isAssistant
                    ? isDarkMode ? 'bg-violet-500/30 text-violet-300' : 'bg-violet-100 text-violet-700'
                    : isDarkMode ? 'bg-blue-500/20 text-blue-300' : 'bg-blue-100 text-blue-700'
            )}>
                {isAssistant ? <Phone className="w-3 h-3" /> : 'C'}
            </div>
            <div className={cn(
                'max-w-[80%] rounded-xl px-3 py-2 text-sm',
                isAssistant
                    ? isDarkMode ? 'bg-violet-500/20 text-white' : 'bg-violet-100 text-gray-900'
                    : isDarkMode ? 'bg-white/10 text-white' : 'bg-gray-100 text-gray-900'
            )}>
                {msg.text}
            </div>
        </div>
    );
}

// ── Active call card ─────────────────────────────────────────────────────────

function ActiveCallCard({ call, isDarkMode }: { call: SbcCall; isDarkMode: boolean }) {
    const duration = useDuration(call.startTime, call.endTime);
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [call.messages.length]);

    return (
        <div className={cn(
            'rounded-2xl border flex flex-col overflow-hidden',
            call.status === 'active'
                ? isDarkMode ? 'border-emerald-500/40 bg-white/3' : 'border-emerald-400 bg-emerald-50/30'
                : isDarkMode ? 'border-white/10 bg-white/3' : 'border-gray-200 bg-gray-50'
        )}>
            {/* Card header */}
            <div className={cn(
                'flex items-center gap-3 px-4 py-3 border-b',
                isDarkMode ? 'border-white/8' : 'border-gray-200'
            )}>
                <div className={cn(
                    'w-8 h-8 rounded-full flex items-center justify-center',
                    call.status === 'active'
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : isDarkMode ? 'bg-white/10 text-white/40' : 'bg-gray-100 text-gray-400'
                )}>
                    {call.status === 'active'
                        ? <Phone className="w-4 h-4" />
                        : <PhoneOff className="w-4 h-4" />
                    }
                </div>
                <div className="flex-1 min-w-0">
                    <div className={cn('font-medium text-sm truncate', isDarkMode ? 'text-white' : 'text-gray-900')}>
                        {call.from || 'Unknown caller'}
                    </div>
                    <div className={cn('text-xs', isDarkMode ? 'text-white/40' : 'text-gray-500')}>
                        {call.persona} · {call.voice} · {call.workflow}
                    </div>
                </div>
                <div className="flex flex-col items-end gap-0.5">
                    <span className={cn(
                        'text-xs font-mono font-semibold',
                        call.status === 'active' ? 'text-emerald-400' : isDarkMode ? 'text-white/40' : 'text-gray-500'
                    )}>
                        {duration}
                    </span>
                    {call.status === 'active' && (
                        <span className="flex items-center gap-1 text-[10px] text-emerald-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            Live
                        </span>
                    )}
                    {call.status === 'ended' && (
                        <span className={cn('text-[10px]', isDarkMode ? 'text-white/30' : 'text-gray-400')}>
                            Ended
                        </span>
                    )}
                </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 max-h-80">
                {call.messages.length === 0 ? (
                    <div className={cn('text-xs text-center py-4', isDarkMode ? 'text-white/30' : 'text-gray-400')}>
                        Waiting for conversation...
                    </div>
                ) : (
                    call.messages.map((msg, i) => (
                        <MessageRow key={i} msg={msg} isDarkMode={isDarkMode} />
                    ))
                )}
                <div ref={bottomRef} />
            </div>
        </div>
    );
}

// ── Collapsed ended call ─────────────────────────────────────────────────────

function EndedCallRow({ call, isDarkMode }: { call: SbcCall; isDarkMode: boolean }) {
    const [open, setOpen] = useState(false);
    const duration = useDuration(call.startTime, call.endTime);

    return (
        <div className={cn(
            'rounded-xl border overflow-hidden',
            isDarkMode ? 'border-white/8' : 'border-gray-200'
        )}>
            <button
                onClick={() => setOpen(o => !o)}
                className={cn(
                    'w-full flex items-center gap-3 px-4 py-3 text-left transition-colors',
                    isDarkMode ? 'hover:bg-white/5' : 'hover:bg-gray-50'
                )}
            >
                <PhoneOff className={cn('w-4 h-4 shrink-0', isDarkMode ? 'text-white/30' : 'text-gray-400')} />
                <span className={cn('flex-1 text-sm truncate', isDarkMode ? 'text-white/50' : 'text-gray-500')}>
                    {call.from || 'Unknown caller'}
                </span>
                <span className={cn('text-xs font-mono', isDarkMode ? 'text-white/30' : 'text-gray-400')}>
                    {duration}
                </span>
                {open
                    ? <ChevronUp className="w-3.5 h-3.5 shrink-0" />
                    : <ChevronDown className="w-3.5 h-3.5 shrink-0" />
                }
            </button>
            {open && (
                <div className={cn(
                    'border-t px-4 py-3 flex flex-col gap-2 max-h-64 overflow-y-auto',
                    isDarkMode ? 'border-white/8' : 'border-gray-100'
                )}>
                    {call.messages.map((msg, i) => (
                        <MessageRow key={i} msg={msg} isDarkMode={isDarkMode} />
                    ))}
                </div>
            )}
        </div>
    );
}

// ── Main panel ───────────────────────────────────────────────────────────────

export default function SbcCallPanel() {
    const { sbcCalls, isDarkMode } = useApp();

    const activeCalls = sbcCalls.filter(c => c.status === 'active');
    const endedCalls  = sbcCalls.filter(c => c.status === 'ended').slice(0, 5);

    return (
        <div className="flex flex-col h-full overflow-hidden">
            {/* Header */}
            <div className={cn(
                'flex items-center gap-3 px-6 py-4 border-b shrink-0',
                isDarkMode ? 'border-white/8' : 'border-gray-200'
            )}>
                <Phone className={cn('w-5 h-5', isDarkMode ? 'text-white/60' : 'text-gray-500')} />
                <h2 className={cn('text-lg font-semibold', isDarkMode ? 'text-white' : 'text-gray-900')}>
                    Phone Calls
                </h2>
                {activeCalls.length > 0 && (
                    <span className="ml-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500 text-white">
                        {activeCalls.length} active
                    </span>
                )}
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
                {/* Active calls */}
                {activeCalls.length > 0 ? (
                    <div className="flex flex-col gap-4">
                        {activeCalls.map(call => (
                            <ActiveCallCard key={call.callId} call={call} isDarkMode={isDarkMode} />
                        ))}
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center py-20 gap-4">
                        <div className={cn(
                            'w-16 h-16 rounded-full flex items-center justify-center',
                            isDarkMode ? 'bg-white/5' : 'bg-gray-100'
                        )}>
                            <Phone className={cn('w-8 h-8', isDarkMode ? 'text-white/20' : 'text-gray-300')} />
                        </div>
                        <div className="text-center">
                            <p className={cn('font-medium', isDarkMode ? 'text-white/50' : 'text-gray-500')}>
                                No active calls
                            </p>
                            <p className={cn('text-sm mt-1', isDarkMode ? 'text-white/30' : 'text-gray-400')}>
                                Waiting for inbound SIP calls
                            </p>
                        </div>
                    </div>
                )}

                {/* Ended call history */}
                {endedCalls.length > 0 && (
                    <div className="flex flex-col gap-2">
                        <h3 className={cn(
                            'text-xs font-semibold uppercase tracking-wider px-1',
                            isDarkMode ? 'text-white/30' : 'text-gray-400'
                        )}>
                            Recent calls
                        </h3>
                        {endedCalls.map(call => (
                            <EndedCallRow key={call.callId} call={call} isDarkMode={isDarkMode} />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
