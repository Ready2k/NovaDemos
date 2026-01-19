import { useApp } from '@/lib/context/AppContext';
import { cn } from '@/lib/utils';
import GeneralSettings from './GeneralSettings';
import PersonaSettings from './PersonaSettings';
import KnowledgeBaseSettings from './KnowledgeBaseSettings';

export default function SettingsLayout() {
    const { activeSettingsTab, setActiveSettingsTab, isDarkMode } = useApp();

    const tabs = [
        { id: 'general', label: 'General' },
        { id: 'persona', label: 'Persona' },
        { id: 'knowledge', label: 'Knowledge' },
        { id: 'system', label: 'System' },
    ];

    return (
        <div className="flex h-full w-full">
            {/* Settings Sidebar */}
            <div className={cn(
                "w-64 border-r p-6 flex flex-col gap-1",
                isDarkMode ? "border-white/10 bg-ink-bg" : "border-gray-200 bg-gray-50"
            )}>
                <h2 className={cn(
                    "text-lg font-bold mb-6 px-4",
                    isDarkMode ? "text-ink-text-primary" : "text-gray-900"
                )}>
                    Settings
                </h2>

                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveSettingsTab(tab.id)}
                        className={cn(
                            "text-left px-4 py-3 rounded-lg text-sm font-medium transition-colors",
                            activeSettingsTab === tab.id
                                ? isDarkMode
                                    ? "bg-violet-500/20 text-violet-300"
                                    : "bg-violet-100 text-violet-700"
                                : isDarkMode
                                    ? "text-ink-text-muted hover:bg-white/5 hover:text-ink-text-primary"
                                    : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                        )}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Settings Content Area */}
            <div className="flex-1 p-8 overflow-y-auto">
                {activeSettingsTab === 'general' && <GeneralSettings />}
                {activeSettingsTab === 'persona' && <PersonaSettings />}
                {activeSettingsTab === 'knowledge' && <KnowledgeBaseSettings />}
                {activeSettingsTab === 'system' && <div className="text-gray-500">System Settings (Coming Soon)</div>}
            </div>
        </div>
    );
}
