import { useRef, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { Message, TestConfiguration } from '@/lib/types';
import { RefreshCw, Settings, X, CheckCircle2, XCircle, AlertCircle, Copy, Download, Loader2, Clock } from 'lucide-react';
import { useApp } from '@/lib/context/AppContext';
import WorkflowJourney from '@/components/chat/WorkflowJourney';
import MultimodalMessage from '@/components/chat/MultimodalMessage';
import { format } from 'date-fns';

interface TestReportModalProps {
    isOpen: boolean;
    onClose: () => void;
    onRetry: () => void;
    onReconfigure: () => void;
    messages: Message[];
    testConfig?: TestConfiguration;
    isDarkMode?: boolean;
    sessionId?: string | null; // Added sessionId
}

export default function TestReportModal({
    isOpen,
    onClose,
    onRetry,
    onReconfigure,
    messages,
    testConfig,
    isDarkMode = true,
    sessionId // Added sessionId
}: TestReportModalProps) {
    const [status, setStatus] = useState<'pending' | 'success' | 'failure'>('pending');
    const [notes, setNotes] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    // Reset state on open
    useEffect(() => {
        if (isOpen) {
            setStatus('pending');
            setNotes('');
            setIsSaving(false);
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const handleCopyTranscript = () => {
        const text = messages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n');
        navigator.clipboard.writeText(text);
    };

    const handleDownloadReport = () => {
        const report = {
            timestamp: new Date().toISOString(),
            config: testConfig,
            status,
            notes,
            transcript: messages,
            sessionId
        };
        const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `test-report-${new Date().toISOString()}.json`;
        a.click();
    };

    const handleSaveResult = async (newStatus: 'success' | 'failure') => {
        setStatus(newStatus);

        if (!sessionId) {
            console.warn('Cannot save test result: No sessionId provided');
            return;
        }

        setIsSaving(true);
        try {
            const mappedResult = newStatus === 'success' ? 'PASS' : 'FAIL';
            const res = await fetch('/api/test-result', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionId: sessionId,
                    result: mappedResult,
                    notes: notes
                })
            });

            if (!res.ok) {
                console.error('Failed to save test result');
            } else {
                console.log('Test result saved successfully');
            }
        } catch (error) {
            console.error('Error saving test result:', error);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
            <div
                ref={containerRef}
                className={cn(
                    "w-full max-w-3xl rounded-2xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden animate-in zoom-in-95",
                    isDarkMode ? "bg-[#0F0F12] border border-white/10 text-white" : "bg-white border-gray-200 text-gray-900"
                )}
            >
                {/* Header */}
                <div className={cn("p-6 border-b flex justify-between items-center", isDarkMode ? "border-white/10 bg-white/5" : "border-gray-200 bg-gray-50")}>
                    <div>
                        <h2 className="text-xl font-bold flex items-center gap-2">
                            Test Report
                            <span className={cn("text-xs px-2 py-0.5 rounded-full border", isDarkMode ? "bg-white/5 border-white/10" : "bg-white border-gray-200")}>
                                {testConfig?.name || "Workflow Test"}
                            </span>
                        </h2>
                        <p className={cn("text-sm mt-1", isDarkMode ? "text-gray-400" : "text-gray-500")}>
                            {messages.length} messages exchanged • {new Date().toLocaleTimeString()}
                        </p>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-0 flex flex-col md:flex-row">

                    {/* Left: Transcript */}
                    <div className={cn("flex-1 flex flex-col border-r overflow-hidden", isDarkMode ? "border-white/10" : "border-gray-200")}>
                        {/* Workflow Journey Visualization */}
                        {(() => {
                            const workflowSteps = messages
                                .map((m, i) => ({ ...m, id: `test-msg-${i}` }))
                                .filter(m => m.role === 'system' && m.type === 'workflow_step')
                                .map(m => ({
                                    msgId: m.id,
                                    label: m.metadata?.stepId || (typeof m.content === 'string' && m.content.match(/Active Workflow Step: (.*)/)?.[1])
                                }))
                                .filter(s => s.label);

                            if (workflowSteps.length > 0) {
                                return (
                                    <div className="px-6 pt-6 pb-2 shrink-0">
                                        <WorkflowJourney
                                            steps={workflowSteps.map(s => s.label as string)}
                                            isDarkMode={isDarkMode}
                                            className="mb-0"
                                            onStepClick={(step, idx) => {
                                                const msgId = workflowSteps[idx].msgId;
                                                const element = document.getElementById(msgId);
                                                if (element) {
                                                    element.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                                }
                                            }}
                                        />
                                    </div>
                                );
                            }
                            return null;
                        })()}

                        <div className="flex-1 overflow-y-auto p-6 pt-2">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-xs font-bold uppercase tracking-wider opacity-70">Transcript</h3>
                                <button onClick={handleCopyTranscript} className="p-1.5 rounded hover:bg-white/10" title="Copy">
                                    <Copy className="w-3.5 h-3.5" />
                                </button>
                            </div>
                            <div className="space-y-4">
                                {messages.map((m, i) => (
                                    <MultimodalMessage
                                        key={i}
                                        id={`test-msg-${i}`}
                                        role={m.role}
                                        type={m.type}
                                        content={m.content}
                                        timestamp={m.timestamp ? format(new Date(m.timestamp), 'h:mm a') : ''}
                                        isDarkMode={isDarkMode}
                                        sentiment={m.sentiment}
                                        feedback={m.feedback}
                                    />
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Right: Evaluation */}
                    <div className="w-full md:w-80 p-6 flex flex-col gap-6 bg-black/5">
                        {/* Success Criteria */}
                        <div className="space-y-2">
                            <label className="text-xs font-bold uppercase tracking-wider opacity-70">Success Criteria</label>
                            <div className={cn("p-3 rounded-lg text-sm border", isDarkMode ? "bg-white/5 border-white/10" : "bg-white border-gray-200")}>
                                {testConfig?.successCriteria || "No specific criteria defined."}
                            </div>
                        </div>

                        {/* Outcome Selection */}
                        <div className="space-y-2">
                            <div className="flex justify-between items-center">
                                <label className="text-xs font-bold uppercase tracking-wider opacity-70">Test Outcome</label>
                                {isSaving && <Loader2 className="w-3 h-3 animate-spin text-gray-400" />}
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    onClick={() => handleSaveResult('success')}
                                    className={cn(
                                        "p-3 rounded-lg border flex flex-col items-center gap-2 transition-all",
                                        status === 'success'
                                            ? "bg-emerald-500/20 border-emerald-500 text-emerald-400"
                                            : isDarkMode ? "bg-white/5 border-white/10 hover:bg-white/10" : "bg-white border-gray-200"
                                    )}
                                >
                                    <CheckCircle2 className={cn("w-6 h-6", status === 'success' ? "text-emerald-400" : "text-gray-500")} />
                                    <span className="text-xs font-medium">Success</span>
                                </button>
                                <button
                                    onClick={() => handleSaveResult('failure')}
                                    className={cn(
                                        "p-3 rounded-lg border flex flex-col items-center gap-2 transition-all",
                                        status === 'failure'
                                            ? "bg-red-500/20 border-red-500 text-red-400"
                                            : isDarkMode ? "bg-white/5 border-white/10 hover:bg-white/10" : "bg-white border-gray-200"
                                    )}
                                >
                                    <XCircle className={cn("w-6 h-6", status === 'failure' ? "text-red-400" : "text-gray-500")} />
                                    <span className="text-xs font-medium">Failure</span>
                                </button>
                            </div>
                        </div>

                        {/* Notes */}
                        <div className="space-y-2 flex-1">
                            <label className="text-xs font-bold uppercase tracking-wider opacity-70">Observations</label>
                            <textarea
                                value={notes}
                                onChange={e => setNotes(e.target.value)}
                                placeholder="Add notes about the test..."
                                className={cn(
                                    "w-full h-full min-h-[100px] p-3 rounded-lg border outline-none resize-none bg-transparent text-sm",
                                    isDarkMode ? "border-white/10 focus:border-violet-500" : "border-gray-200 focus:border-violet-500"
                                )}
                            />
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className={cn("p-6 border-t flex justify-between items-center bg-black/20", isDarkMode ? "border-white/10" : "border-gray-200")}>
                    <button
                        onClick={handleDownloadReport}
                        className={cn("text-xs flex items-center gap-1.5 px-3 py-1.5 rounded hover:bg-white/5 transition-colors", isDarkMode ? "text-gray-400" : "text-gray-600")}
                    >
                        <Download className="w-3.5 h-3.5" /> Save JSON
                    </button>

                    <div className="flex gap-3">
                        <button
                            onClick={onClose}
                            className={cn("px-4 py-2 rounded-lg text-sm font-medium transition-colors", isDarkMode ? "hover:bg-white/5 text-gray-400" : "hover:bg-gray-100")}
                        >
                            Close
                        </button>
                        <button
                            onClick={onReconfigure}
                            className={cn("px-4 py-2 rounded-lg text-sm font-medium border transition-colors flex items-center gap-2",
                                isDarkMode ? "border-white/10 hover:bg-white/5 text-white" : "border-gray-200 hover:bg-gray-50"
                            )}
                        >
                            <Settings className="w-4 h-4" /> Reconfigure
                        </button>
                        <button
                            onClick={onRetry}
                            className="px-6 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-sm font-bold shadow-lg shadow-violet-500/20 flex items-center gap-2"
                        >
                            <RefreshCw className="w-4 h-4" /> Retry
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
