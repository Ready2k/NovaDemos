'use client';

import { useEffect, useRef, useState } from 'react';
import { useApp } from '@/lib/context/AppContext';

export function useSessionStats() {
    const { currentSession, updateSessionStats, settings, connectionStatus } = useApp();
    const [duration, setDuration] = useState(0);

    // Start duration counter when session starts
    useEffect(() => {
        if (!currentSession?.sessionId) {
            setDuration(0);
            return;
        }

        // Stop timer if disconnected
        if (connectionStatus === 'disconnected') {
            return;
        }

        const startTime = currentSession.startTime ? new Date(currentSession.startTime).getTime() : Date.now();

        // Initial set (in case of re-renders/resume)
        setDuration(Math.floor((Date.now() - startTime) / 1000));

        const interval = setInterval(() => {
            const elapsed = Math.floor((Date.now() - startTime) / 1000);
            setDuration(elapsed);
        }, 1000);

        return () => clearInterval(interval);
    }, [currentSession?.sessionId, currentSession?.startTime, connectionStatus]);

    // Calculate cost based on tokens and brain mode
    const calculateCost = (inputTokens: number, outputTokens: number): number => {
        const config = settings.costConfig;
        const mode = settings.brainMode === 'raw_nova' ? 'nova' : 'agent';

        const inputCost = (inputTokens / 1000) * config[mode].inputCost;
        const outputCost = (outputTokens / 1000) * config[mode].outputCost;

        return inputCost + outputCost;
    };

    // Format duration as HH:MM:SS or MM:SS
    const formatDuration = (seconds: number): string => {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;

        if (hours > 0) {
            return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
        return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    // Format cost with 3 decimal places
    const formatCost = (cost: number): string => {
        return `$${cost.toFixed(3)}`;
    };

    // Format token count with commas
    const formatTokens = (tokens: number): string => {
        return tokens.toLocaleString();
    };

    return {
        duration,
        formattedDuration: formatDuration(duration),
        calculateCost,
        formatCost,
        formatTokens,
        inputTokens: currentSession?.inputTokens || 0,
        outputTokens: currentSession?.outputTokens || 0,
        cost: currentSession ? calculateCost(currentSession.inputTokens, currentSession.outputTokens) : 0,
    };
}
