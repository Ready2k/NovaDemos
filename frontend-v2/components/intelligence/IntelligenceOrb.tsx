'use client';
import { useApp } from '@/lib/context/AppContext';
import SentimentHalo from './SentimentHalo';
import AntiGravityVisualizer from './AntiGravityVisualizer';
import FluidVisualizer from './FluidVisualizer';
import WaveformVisualizer from './WaveformVisualizer';
import ParticleVortexVisualizer from './ParticleVortexVisualizer';
import PulseWaveformVisualizer from './PulseWaveformVisualizer';

interface IntelligenceOrbProps {
    sentiment?: number;
    isActive?: boolean;
    getAudioData?: () => Uint8Array | null;
}

export default function IntelligenceOrb({ sentiment: propSentiment, isActive: propIsActive, getAudioData }: IntelligenceOrbProps) {
    const { messages, connectionStatus, settings, workflowState } = useApp();

    // Determine if a tool/workflow is currently processing
    const isWorkflowActive = workflowState?.status === 'active';
    // Steps are not Tools -> Only visualize Tool usage if explicitly identified
    const isToolActive = false;

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

    // Determine Mode for Visualizers
    const fluidMode = connectionStatus === 'disconnected' ? 'dormant' :
        connectionStatus === 'recording' ? 'user' :
            connectionStatus === 'connected' ? 'agent' : 'idle';

    // Visualizer Selection
    const renderVisualizer = () => {
        const speed = settings.physicsSpeed ?? 1.0;
        const sensitivity = settings.physicsSensitivity ?? 1.0;
        const growth = settings.contextGrowth ?? 0;

        switch (settings.visualizationStyle) {
            case 'fluid_physics':
                return <FluidVisualizer
                    mode={fluidMode}
                    getAudioData={getAudioData}
                    isToolActive={isToolActive}
                    isLiveView={true}
                    {...({ speed, sensitivity } as any)}
                />;
            case 'pulse_waveform':
                return <PulseWaveformVisualizer
                    mode={fluidMode === 'dormant' ? 'idle' : fluidMode}
                    isActive={isActive}
                    getAudioData={getAudioData}
                    isToolActive={isToolActive}
                    isThinking={isWorkflowActive}
                    speed={speed}
                    sensitivity={sensitivity}
                    growth={growth}
                />;
            case 'anti_gravity':
                return <AntiGravityVisualizer
                    isActive={isActive}
                    getAudioData={getAudioData}
                    mode={fluidMode}
                    isToolActive={isToolActive}
                    speed={speed}
                    sensitivity={sensitivity}
                    growth={growth}
                />;
            case 'particle_vortex':
                return <ParticleVortexVisualizer
                    mode={fluidMode}
                    getAudioData={getAudioData}
                    isToolActive={isToolActive}
                    speed={speed}
                    sensitivity={sensitivity}
                    growth={growth}
                />;
            case 'simple_wave':
            default:
                return <WaveformVisualizer
                    isActive={isActive}
                    getAudioData={getAudioData}
                    mode={fluidMode}
                    isThinking={isWorkflowActive}
                />; // Waveform doesn't support physics tuning yet
        }
    };

    return (
        <div className="relative w-full h-full flex items-center justify-center p-0">
            {/* Sentiment Halo */}
            <SentimentHalo sentiment={sentiment} />

            {/* Wide Horizontal Waveform Container - Full Space Usage */}
            <div className="relative w-full h-full overflow-hidden">
                {renderVisualizer()}
            </div>
        </div>
    );
}
