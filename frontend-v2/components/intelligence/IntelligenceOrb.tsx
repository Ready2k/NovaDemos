'use client';

import { useApp } from '@/lib/context/AppContext';
import SentimentHalo from './SentimentHalo';
import DataConstellationVisualizer from './DataConstellationVisualizer';
import DataConstellationV2Visualizer from './DataConstellationV2Visualizer';
import AntiGravityVisualizer from './AntiGravityVisualizer';
import FluidVisualizer from './FluidVisualizer';
import WaveformVisualizer from './WaveformVisualizer';

interface IntelligenceOrbProps {
    sentiment?: number;
    isActive?: boolean;
    getAudioData?: () => Uint8Array | null;
}

export default function IntelligenceOrb({ sentiment: propSentiment, isActive: propIsActive, getAudioData }: IntelligenceOrbProps) {
    const { messages, connectionStatus, settings } = useApp();

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

    // Determine Mode for Fluid Visualizer
    const fluidMode = connectionStatus === 'recording' ? 'user' :
        connectionStatus === 'connected' ? 'agent' : 'idle';

    // Visualizer Selection
    const renderVisualizer = () => {
        switch (settings.visualizationStyle) {
            case 'fluid_physics':
                return <FluidVisualizer mode={fluidMode} getAudioData={getAudioData} />;
            case 'anti_gravity':
                return <AntiGravityVisualizer isActive={isActive} getAudioData={getAudioData} />;
            case 'data_constellation_v2':
                return <DataConstellationV2Visualizer isActive={isActive} getAudioData={getAudioData} />;
            case 'data_constellation':
                return <DataConstellationVisualizer isActive={isActive} getAudioData={getAudioData} />;
            case 'simple_wave':
            default:
                return <WaveformVisualizer isActive={isActive} getAudioData={getAudioData} />;
        }
    };

    return (
        <div className="relative w-full px-8 py-4 md:py-6 flex items-center justify-center">
            {/* Sentiment Halo */}
            <SentimentHalo sentiment={sentiment} />

            {/* Wide Horizontal Waveform Container - Responsive Height */}
            <div className="relative w-full max-w-4xl h-20 md:h-32 rounded-2xl bg-gradient-to-br from-ink-surface/80 to-ink-surface/40 border border-white/10 backdrop-blur-xl overflow-hidden shadow-2xl">
                {renderVisualizer()}
            </div>
        </div>
    );
}
