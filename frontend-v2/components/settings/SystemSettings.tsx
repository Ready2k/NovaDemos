
import { useApp } from '@/lib/context/AppContext';
import { cn } from '@/lib/utils';
import { useState, useEffect } from 'react';
import Toast from '@/components/ui/Toast';

export default function SystemSettings() {
    const { isDarkMode, showToast, settings, updateSettings } = useApp();
    const [awsStatus, setAwsStatus] = useState<'checking' | 'connected' | 'error'>('checking');
    const [awsRegion, setAwsRegion] = useState('');
    const [debugMode, setDebugMode] = useState(false);
    const [resetConfirm, setResetConfirm] = useState(false);
    const [isChecking, setIsChecking] = useState(false);

    const checkAwsStatus = async () => {
        setIsChecking(true);
        try {
            const response = await fetch('/api/system/status');
            const data = await response.json();
            if (data.aws === 'connected') {
                setAwsStatus('connected');
                setAwsRegion(data.region);
            } else {
                setAwsStatus('error');
            }
        } catch (err) {
            console.error('Failed to check AWS status', err);
            setAwsStatus('error');
        } finally {
            setIsChecking(false);
        }
    };

    const toggleDebugMode = async (enabled: boolean) => {
        try {
            await fetch('/api/system/debug', {
                method: 'POST',
                body: JSON.stringify({ enabled }),
                headers: { 'Content-Type': 'application/json' }
            });
            setDebugMode(enabled);
            showToast(`Debug mode ${enabled ? 'enabled' : 'disabled'}`, 'success');
        } catch (err) {
            showToast('Failed to toggle debug mode', 'error');
        }
    };

    const handleFactoryReset = async () => {
        if (!resetConfirm) {
            setResetConfirm(true);
            setTimeout(() => setResetConfirm(false), 3000); // Auto-reset confirmation
            return;
        }

        try {
            const response = await fetch('/api/system/reset', { method: 'POST' });
            if (response.ok) {
                showToast('System reset complete. Reloading...', 'success');
                setTimeout(() => window.location.reload(), 2000);
            } else {
                throw new Error('Reset failed');
            }
        } catch (err) {
            showToast('Factory reset failed', 'error');
            setResetConfirm(false);
        }
    };

    useEffect(() => {
        checkAwsStatus();
    }, []);

    return (
        <div className="max-w-2xl flex flex-col gap-8">
            <h1 className={cn("text-2xl font-bold", isDarkMode ? "text-white" : "text-gray-900")}>
                System Settings
            </h1>

            {/* Connectivity Section */}
            <section className={cn(
                "p-6 rounded-xl border flex flex-col gap-4",
                isDarkMode ? "bg-white/5 border-white/10" : "bg-white border-gray-200"
            )}>
                <h3 className={cn("text-lg font-semibold", isDarkMode ? "text-white" : "text-gray-900")}>
                    Connectivity & Diagnostics
                </h3>

                <div className="flex items-center justify-between p-4 rounded-lg bg-black/5 dark:bg-white/5">
                    <div className="flex flex-col">
                        <span className={cn("font-medium", isDarkMode ? "text-white" : "text-gray-900")}>AWS Credentials</span>
                        <span className="text-xs text-gray-500">
                            {awsRegion ? `Region: ${awsRegion}` : 'Checking connection...'}
                        </span>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className={cn(
                            "flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider",
                            awsStatus === 'connected' ? "bg-green-500/10 text-green-500" :
                                awsStatus === 'error' ? "bg-red-500/10 text-red-500" :
                                    "bg-yellow-500/10 text-yellow-500"
                        )}>
                            <div className={cn(
                                "w-2 h-2 rounded-full animate-pulse",
                                awsStatus === 'connected' ? "bg-green-500" :
                                    awsStatus === 'error' ? "bg-red-500" :
                                        "bg-yellow-500"
                            )} />
                            {awsStatus === 'connected' ? 'Connected' : awsStatus === 'error' ? 'Error' : 'Checking'}
                        </div>
                        <button
                            onClick={checkAwsStatus}
                            disabled={isChecking}
                            className={cn(
                                "p-2 rounded-lg transition-colors hover:bg-black/5 dark:hover:bg-white/10",
                                isChecking && "opacity-50 cursor-not-allowed"
                            )}
                            title="Re-check Connection"
                        >
                            <svg className={cn("w-4 h-4 text-gray-500", isChecking && "animate-spin")} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                        </button>
                    </div>
                </div>

                <div className="flex items-center justify-between p-4 rounded-lg bg-black/5 dark:bg-white/5">
                    <div className="flex flex-col">
                        <span className={cn("font-medium", isDarkMode ? "text-white" : "text-gray-900")}>Debug Mode</span>
                        <span className="text-xs text-gray-500">Enable verbose logging in server console</span>
                    </div>
                    <button
                        onClick={() => toggleDebugMode(!debugMode)}
                        className={cn(
                            "relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2",
                            debugMode ? "bg-violet-600" : "bg-gray-200 dark:bg-white/20"
                        )}
                    >
                        <span
                            className={cn(
                                "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                                debugMode ? "translate-x-6" : "translate-x-1"
                            )}
                        />
                    </button>
                </div>
            </section>

            {/* Cost Configuration */}
            <section className={cn(
                "p-6 rounded-xl border flex flex-col gap-4",
                isDarkMode ? "bg-white/5 border-white/10" : "bg-white border-gray-200"
            )}>
                <h3 className={cn("text-lg font-semibold", isDarkMode ? "text-white" : "text-gray-900")}>
                    Cost Configuration (per 1k tokens)
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Nova Costs */}
                    <div className="space-y-3">
                        <h4 className={cn("text-xs font-bold uppercase tracking-wider", isDarkMode ? "text-gray-400" : "text-gray-500")}>
                            Nova Sonic
                        </h4>
                        <div className="grid gap-2">
                            <label className="text-xs text-gray-500">Input Cost ($)</label>
                            <input
                                type="number"
                                step="0.000001"
                                value={settings.costConfig.nova.inputCost}
                                onChange={(e) => updateSettings({
                                    costConfig: {
                                        ...settings.costConfig,
                                        nova: { ...settings.costConfig.nova, inputCost: parseFloat(e.target.value) || 0 }
                                    }
                                })}
                                className={cn("p-2 rounded-lg border bg-transparent", isDarkMode ? "border-white/10" : "border-gray-200")}
                            />
                        </div>
                        <div className="grid gap-2">
                            <label className="text-xs text-gray-500">Output Cost ($)</label>
                            <input
                                type="number"
                                step="0.000001"
                                value={settings.costConfig.nova.outputCost}
                                onChange={(e) => updateSettings({
                                    costConfig: {
                                        ...settings.costConfig,
                                        nova: { ...settings.costConfig.nova, outputCost: parseFloat(e.target.value) || 0 }
                                    }
                                })}
                                className={cn("p-2 rounded-lg border bg-transparent", isDarkMode ? "border-white/10" : "border-gray-200")}
                            />
                        </div>
                    </div>

                    {/* Agent Costs */}
                    <div className="space-y-3">
                        <h4 className={cn("text-xs font-bold uppercase tracking-wider", isDarkMode ? "text-gray-400" : "text-gray-500")}>
                            Bedrock Agent
                        </h4>
                        <div className="grid gap-2">
                            <label className="text-xs text-gray-500">Input Cost ($)</label>
                            <input
                                type="number"
                                step="0.000001"
                                value={settings.costConfig.agent.inputCost}
                                onChange={(e) => updateSettings({
                                    costConfig: {
                                        ...settings.costConfig,
                                        agent: { ...settings.costConfig.agent, inputCost: parseFloat(e.target.value) || 0 }
                                    }
                                })}
                                className={cn("p-2 rounded-lg border bg-transparent", isDarkMode ? "border-white/10" : "border-gray-200")}
                            />
                        </div>
                        <div className="grid gap-2">
                            <label className="text-xs text-gray-500">Output Cost ($)</label>
                            <input
                                type="number"
                                step="0.000001"
                                value={settings.costConfig.agent.outputCost}
                                onChange={(e) => updateSettings({
                                    costConfig: {
                                        ...settings.costConfig,
                                        agent: { ...settings.costConfig.agent, outputCost: parseFloat(e.target.value) || 0 }
                                    }
                                })}
                                className={cn("p-2 rounded-lg border bg-transparent", isDarkMode ? "border-white/10" : "border-gray-200")}
                            />
                        </div>
                    </div>
                </div>
            </section>

            {/* Danger Zone */}
            <section className={cn(
                "p-6 rounded-xl border border-red-500/20 bg-red-500/5 flex flex-col gap-4"
            )}>
                <h3 className="text-lg font-semibold text-red-600 dark:text-red-400">
                    Danger Zone
                </h3>

                <div className="flex items-center justify-between">
                    <div>
                        <div className={cn("font-medium", isDarkMode ? "text-white" : "text-gray-900")}>
                            Factory Reset
                        </div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">
                            Delete all presets, chat history, and restore default settings. This cannot be undone.
                        </div>
                    </div>
                    <button
                        onClick={handleFactoryReset}
                        className={cn(
                            "px-4 py-2 rounded-lg font-semibold transition-all border",
                            resetConfirm
                                ? "bg-red-600 text-white border-red-600 hover:bg-red-700"
                                : "text-red-600 border-red-200 dark:border-red-900 hover:bg-red-50 dark:hover:bg-red-900/20"
                        )}
                    >
                        {resetConfirm ? "Click to Confirm" : "Reset Data"}
                    </button>
                </div>
            </section>
        </div>
    );
}
