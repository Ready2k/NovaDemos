import { cn } from '@/lib/utils';

interface SentimentHaloProps {
    sentiment: number; // -1 to 1 scale
    className?: string;
}

export default function SentimentHalo({ sentiment }: SentimentHaloProps) {
    const getGradientColors = () => {
        if (sentiment > 0.6) return ['#10B981', '#06B6D4']; // Positive: green to cyan
        if (sentiment < 0.4) return ['#EF4444', '#F59E0B']; // Negative: red to amber
        return ['#8B5CF6', '#06B6D4']; // Neutral: purple to cyan
    };

    const [color1, color2] = getGradientColors();

    return (
        <div
            className="absolute inset-0 rounded-2xl transition-sentiment"
            style={{
                background: `radial-gradient(ellipse at center, transparent 0%, ${color1}15 50%, ${color2}25 100%)`,
                filter: 'blur(40px)',
            }}
        />
    );
}
