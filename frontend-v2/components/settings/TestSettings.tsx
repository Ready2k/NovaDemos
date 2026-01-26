import React, { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { useApp } from '@/lib/context/AppContext';

interface TestLogFile {
    filename: string;
    created: string;
    size: number;
}

interface TestLogContent {
    sessionId: string;
    testResult?: string;
    transcript: any[];
    [key: string]: any;
}

export default function TestSettings() {
    const { isDarkMode } = useApp();
    const [logs, setLogs] = useState<TestLogFile[]>([]);
    const [selectedLog, setSelectedLog] = useState<TestLogContent | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        fetchLogs();
    }, []);

    const fetchLogs = async () => {
        try {
            const res = await fetch('/api/tests');
            if (res.ok) {
                const data = await res.json();
                setLogs(data);
            }
        } catch (error) {
            console.error('Failed to fetch test logs:', error);
        }
    };

    const viewLog = async (filename: string) => {
        setLoading(true);
        try {
            const res = await fetch(`/api/tests/${filename}`);
            if (res.ok) {
                const data = await res.json();
                setSelectedLog(data);
            }
        } catch (error) {
            console.error('Failed to load log:', error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="h-full flex flex-col gap-6">
            <h2 className={cn("text-2xl font-bold", isDarkMode ? "text-white" : "text-gray-900")}>Test History</h2>

            {!selectedLog ? (
                <div className="overflow-auto border rounded-xl">
                    <table className={cn("w-full text-sm", isDarkMode ? "text-gray-300" : "text-gray-700")}>
                        <thead className={cn("text-left font-medium border-b", isDarkMode ? "bg-white/5 border-white/10" : "bg-gray-50 border-gray-200")}>
                            <tr>
                                <th className="p-4">Date</th>
                                <th className="p-4">Result (System / User)</th>
                                <th className="p-4">Session ID</th>
                                <th className="p-4 text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {logs.map((log) => {
                                // Extract result from filename convention: test_TIMESTAMP_SYS_USR_SESSIONID.json
                                // Old format: test_TIMESTAMP_RESULT_SESSIONID.json (4 parts)
                                // New format: test_TIMESTAMP_SYS_USR_SESSIONID.json (5 parts)
                                const parts = log.filename.split('_');
                                let sysResult = 'UNKNOWN';
                                let usrResult = 'UNKNOWN';
                                let sessionId = '';

                                if (parts.length >= 5) {
                                    sysResult = parts[2];
                                    usrResult = parts[3];
                                    sessionId = parts[4]?.replace('.json', '');
                                } else {
                                    sysResult = parts[2] || 'UNKNOWN';
                                    sessionId = parts[3]?.replace('.json', '');
                                }

                                const date = new Date(log.created).toLocaleString();

                                return (
                                    <tr key={log.filename} className={cn("border-b last:border-0", isDarkMode ? "border-white/5 hover:bg-white/5" : "border-gray-100 hover:bg-gray-50")}>
                                        <td className="p-4">{date}</td>
                                        <td className="p-4">
                                            <div className="flex gap-2">
                                                <span className={cn(
                                                    "px-2 py-1 rounded text-xs font-bold",
                                                    sysResult === 'PASS' ? "bg-green-500/20 text-green-500" :
                                                        sysResult === 'FAIL' ? "bg-red-500/20 text-red-500" :
                                                            "bg-gray-500/20 text-gray-500"
                                                )}>
                                                    SYS: {sysResult}
                                                </span>
                                                {usrResult !== 'UNKNOWN' && (
                                                    <span className={cn(
                                                        "px-2 py-1 rounded text-xs font-bold",
                                                        usrResult === 'PASS' ? "bg-blue-500/20 text-blue-500" :
                                                            usrResult === 'FAIL' ? "bg-orange-500/20 text-orange-500" :
                                                                "bg-gray-500/20 text-gray-500"
                                                    )}>
                                                        USR: {usrResult}
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="p-4 font-mono text-xs opacity-70">{sessionId}</td>
                                        <td className="p-4 text-right">
                                            <button
                                                onClick={() => viewLog(log.filename)}
                                                className="text-violet-500 hover:underline"
                                            >
                                                View Log
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                            {logs.length === 0 && (
                                <tr>
                                    <td colSpan={4} className="p-8 text-center opacity-50">No test logs found.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div className="flex flex-col gap-4 h-full overflow-hidden">
                    <button
                        onClick={() => setSelectedLog(null)}
                        className="text-violet-500 hover:underline self-start mb-2"
                    >
                        ← Back to List
                    </button>

                    <div className={cn("flex-1 overflow-auto p-4 rounded-xl border font-mono text-xs whitespace-pre-wrap", isDarkMode ? "bg-black/20 border-white/10" : "bg-gray-50 border-gray-200")}>
                        {JSON.stringify(selectedLog, null, 2)}
                    </div>
                </div>
            )}
        </div>
    );
}
