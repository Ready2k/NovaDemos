'use client';

import SentimentHalo from './SentimentHalo';
import WaveformVisualizer from './WaveformVisualizer';

interface IntelligenceOrbProps {
    sentiment?: number;
    isActive?: boolean;
}

export default function IntelligenceOrb({ sentiment = 0, isActive = true }: IntelligenceOrbProps) {
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
