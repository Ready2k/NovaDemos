import { useApp } from '@/lib/context/AppContext';
import { cn } from '@/lib/utils';

export default function InteractionsSettings() {
    const { settings, updateSettings, isDarkMode } = useApp();

    const hoursWindow = settings.recentInteractionsWindowHours ?? 48;
    const maxCount = settings.recentInteractionsCount ?? 7;

    return (
        <div className="max-w-2xl flex flex-col gap-8">
            <h1 className={cn("text-2xl font-bold", isDarkMode ? "text-white" : "text-gray-900")}>
                Interactions
            </h1>

            <div className={cn("text-sm", isDarkMode ? "text-ink-text-muted" : "text-gray-500")}>
                After identity verification, the AI fetches the customer's recent interactions and uses them to predict the reason for the call. If confident, it re-affirms with the customer before proceeding.
            </div>

            {/* Time Window */}
            <section className="flex flex-col gap-6 pt-2">
                <h3 className={cn("text-sm font-semibold uppercase tracking-wider", isDarkMode ? "text-ink-text-muted" : "text-gray-500")}>
                    Recent Interactions Window
                </h3>

                <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                        <span className={isDarkMode ? "text-white" : "text-gray-900"}>Look-back Window</span>
                        <span className="text-gray-500">{hoursWindow}h</span>
                    </div>
                    <input
                        type="range" min="1" max="168" step="1"
                        value={hoursWindow}
                        onChange={(e) => updateSettings({ recentInteractionsWindowHours: parseInt(e.target.value) })}
                        className="w-full h-2 rounded-full bg-gray-700 appearance-none cursor-pointer accent-violet-500"
                    />
                    <div className={cn("text-xs", isDarkMode ? "text-ink-text-muted" : "text-gray-500")}>
                        Only fetch interactions from the last {hoursWindow} hour{hoursWindow !== 1 ? 's' : ''} ({hoursWindow < 24 ? `${hoursWindow}h` : hoursWindow === 24 ? '1 day' : `${(hoursWindow / 24).toFixed(1)} days`}). Default: 48h.
                    </div>
                </div>

                {/* Max Count */}
                <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                        <span className={isDarkMode ? "text-white" : "text-gray-900"}>Max Interactions to Fetch</span>
                        <span className="text-gray-500">{maxCount}</span>
                    </div>
                    <input
                        type="range" min="1" max="20" step="1"
                        value={maxCount}
                        onChange={(e) => updateSettings({ recentInteractionsCount: parseInt(e.target.value) })}
                        className="w-full h-2 rounded-full bg-gray-700 appearance-none cursor-pointer accent-violet-500"
                    />
                    <div className={cn("text-xs", isDarkMode ? "text-ink-text-muted" : "text-gray-500")}>
                        Maximum number of recent interactions the AI will analyse to predict call reason. Default: 7.
                    </div>
                </div>
            </section>

            {/* Behaviour Info */}
            <section className={cn("flex flex-col gap-3 pt-4 border-t", isDarkMode ? "border-white/5" : "border-gray-100")}>
                <h3 className={cn("text-sm font-semibold uppercase tracking-wider", isDarkMode ? "text-ink-text-muted" : "text-gray-500")}>
                    Behaviour
                </h3>
                <ul className={cn("text-sm space-y-2 list-disc pl-4", isDarkMode ? "text-ink-text-muted" : "text-gray-500")}>
                    <li>Triggered automatically after successful ID&V — runs in parallel with the AI's next response.</li>
                    <li>The AI will only re-affirm if it judges the topic is likely related to an <strong>open</strong> (unresolved) recent interaction.</li>
                    <li>If the customer's opening statement already indicates their reason, the AI uses that directly and skips re-affirmation.</li>
                    <li>Applies to all banking personas.</li>
                </ul>
            </section>
        </div>
    );
}
