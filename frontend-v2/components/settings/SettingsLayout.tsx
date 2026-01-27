import { useApp } from '@/lib/context/AppContext';
import { cn } from '@/lib/utils';
import GeneralSettings from './GeneralSettings';
import PersonaSettings from './PersonaSettings';
import KnowledgeSettings from './KnowledgeSettings'; // Changed from KnowledgeBaseSettings
import WorkflowSettings from './WorkflowSettings';
import PresetsSettings from './PresetsSettings';
import SystemSettings from '@/components/settings/SystemSettings';
import ToolsSettings from '@/components/settings/ToolsSettings';
import TestSettings from '@/components/settings/TestSettings';

// Assuming AppSettingsTab is defined elsewhere, e.g., in AppContext or a types file
type AppSettingsTab = 'general' | 'persona' | 'knowledge' | 'workflow' | 'presets' | 'system' | 'tools' | 'test';

export default function SettingsLayout() {
    const { activeSettingsTab, setActiveSettingsTab, isDarkMode } = useApp();

    const tabs: { id: AppSettingsTab; label: string }[] = [
        { id: 'general', label: 'General' },
        { id: 'persona', label: 'Persona' },
        { id: 'knowledge', label: 'Knowledge Base' },
        { id: 'tools', label: 'Tools' },
        { id: 'workflow', label: 'Workflow' },
        { id: 'presets', label: 'Presets' },
        { id: 'system', label: 'System' },
        { id: 'test', label: 'Test Logs' }
    ];

    return (
        <div className="flex flex-col md:flex-row h-full w-full">
            {/* Desktop: Sidebar */}
            <div className={cn(
                "hidden md:flex w-64 border-r p-6 flex-col gap-1 shrink-0",
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
                            "text-left px-4 py-3 rounded-lg text-sm font-medium transition-colors relative",
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
                        {activeSettingsTab === tab.id && (
                            <div className="absolute left-0 top-3 bottom-3 w-1 bg-violet-500 rounded-r-full" />
                        )}
                    </button>
                ))}
            </div>

            {/* Mobile: Top Tab Bar */}
            <div className={cn(
                "md:hidden w-full flex-shrink-0 border-b overflow-x-auto flex items-center px-4 gap-2 no-scrollbar",
                isDarkMode ? "bg-ink-bg border-white/10" : "bg-gray-50 border-gray-200"
            )}>
                {tabs.filter(t => ['general', 'persona', 'system'].includes(t.id)).map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveSettingsTab(tab.id)}
                        className={cn(
                            "whitespace-nowrap px-4 py-3 text-sm font-medium border-b-2 transition-colors",
                            activeSettingsTab === tab.id
                                ? isDarkMode
                                    ? "border-violet-500 text-violet-300"
                                    : "border-violet-500 text-violet-700"
                                : isDarkMode
                                    ? "border-transparent text-ink-text-muted"
                                    : "border-transparent text-gray-500"
                        )}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto p-4 md:p-8 scrollbar-thin">
                {activeSettingsTab === 'general' && <GeneralSettings />}
                {activeSettingsTab === 'persona' && <PersonaSettings />}
                {activeSettingsTab === 'knowledge' && <KnowledgeSettings />}
                {activeSettingsTab === 'tools' && <ToolsSettings />}
                {activeSettingsTab === 'workflow' && <WorkflowSettings />}
                {activeSettingsTab === 'presets' && <PresetsSettings />}
                {activeSettingsTab === 'system' && <SystemSettings />}
                {activeSettingsTab === 'test' && <TestSettings />}
            </div>
        </div>
    );
}
