'use client';

import { useApp } from '@/lib/context/AppContext';
import SentimentHalo from './SentimentHalo';
import WaveformVisualizer from './WaveformVisualizer';

interface IntelligenceOrbProps {
    sentiment?: number;
    isActive?: boolean;
}

export default function IntelligenceOrb({ sentiment: propSentiment, isActive: propIsActive }: IntelligenceOrbProps) {
    const { messages, connectionStatus } = useApp();

    // Calculate average sentiment from recent messages (last 5)
    const recentMessages = messages.slice(-5);
    const calculatedSentiment = recentMessages.length > 0
        ? recentMessages
            .filter(m => m.sentiment !== undefined)
            .reduce((sum, m) => sum + (m.sentiment || 0), 0) / recentMessages.filter(m => m.sentiment !== undefined).length
        : 0.5;

    // Use prop sentiment if provided, otherwise use calculated
    const sentiment = propSentiment !== undefined ? propSentiment : calculatedSentiment;

    // Determine if active based on connection status
    const isActive = propIsActive !== undefined
        ? propIsActive
        : (connectionStatus === 'connected' || connectionStatus === 'recording');

    return (
        <div className="relative w-full px-8 py-4 md:py-6 flex items-center justify-center">
            {/* Sentiment Halo */}
            <SentimentHalo sentiment={sentiment} />

            {/* Wide Horizontal Waveform Container - Responsive Height */}
            <div className="relative w-full max-w-4xl h-20 md:h-32 rounded-2xl bg-gradient-to-br from-ink-surface/80 to-ink-surface/40 border border-white/10 backdrop-blur-xl overflow-hidden shadow-2xl">
                <WaveformVisualizer isActive={isActive} />
            </div>
        </div>
    );
}
