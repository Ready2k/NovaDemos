import { useApp } from '@/lib/context/AppContext';
import { cn } from '@/lib/utils';
import { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, Save, X } from 'lucide-react';

interface Persona {
    id: string;
    name: string;
    description: string;
    promptFile: string | null;
    workflows: string[];
    allowedTools: string[];
    voiceId: string;
    metadata: {
        language: string;
        region?: string;
        tone?: string;
        [key: string]: any;
    };
    promptContent?: string;
}

export default function PersonaSettings() {
    const { isDarkMode, showToast } = useApp();
    const [personas, setPersonas] = useState<Persona[]>([]);
    const [selectedPersona, setSelectedPersona] = useState<Persona | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [tools, setTools] = useState<any[]>([]);
    const [workflows, setWorkflows] = useState<any[]>([]);
    const [isSaving, setIsSaving] = useState(false);

    // Form state
    const [formData, setFormData] = useState<Persona>({
        id: '',
        name: '',
        description: '',
        promptFile: null,
        workflows: [],
        allowedTools: [],
        voiceId: 'matthew',
        metadata: {
            language: 'en-US',
            region: 'UK',
            tone: 'professional'
        },
        promptContent: ''
    });

    // Load personas
    useEffect(() => {
        fetchPersonas();
        fetchTools();
        fetchWorkflows();
    }, []);

    const fetchPersonas = async () => {
        try {
            const response = await fetch('/api/personas');
            if (response.ok) {
                const data = await response.json();
                setPersonas(data);
            }
        } catch (err) {
            console.error('Failed to fetch personas', err);
        }
    };

    const fetchTools = async () => {
        try {
            const response = await fetch('/api/tools');
            if (response.ok) {
                setTools(await response.json());
            }
        } catch (err) {
            console.error('Failed to fetch tools', err);
        }
    };

    const fetchWorkflows = async () => {
        try {
            const response = await fetch('/api/workflows');
            if (response.ok) {
                setWorkflows(await response.json());
            }
        } catch (err) {
            console.error('Failed to fetch workflows', err);
        }
    };

    const handleSelectPersona = async (personaId: string) => {
        try {
            const response = await fetch(`/api/personas/${personaId}`);
            if (response.ok) {
                const data = await response.json();
                setSelectedPersona(data);
                setFormData(data);
                setIsEditing(false);
                setIsCreating(false);
            }
        } catch (err) {
            console.error('Failed to load persona', err);
            showToast('Failed to load persona', 'error');
        }
    };

    const handleCreate = () => {
        setIsCreating(true);
        setIsEditing(true);
        setSelectedPersona(null);
        setFormData({
            id: '',
            name: 'New Persona',
            description: '',
            promptFile: null,
            workflows: [],
            allowedTools: [],
            voiceId: 'matthew',
            metadata: {
                language: 'en-US',
                region: 'UK',
                tone: 'professional'
            },
            promptContent: ''
        });
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            // Generate prompt filename if creating new
            if (isCreating && !formData.promptFile) {
                formData.promptFile = `persona-${formData.id}.txt`;
            }

            const url = isCreating ? '/api/personas' : `/api/personas/${formData.id}`;
            const method = isCreating ? 'POST' : 'PUT';

            const response = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });

            if (response.ok) {
                showToast(`Persona ${isCreating ? 'created' : 'updated'} successfully!`, 'success');
                await fetchPersonas();
                setIsEditing(false);
                setIsCreating(false);
                if (isCreating) {
                    handleSelectPersona(formData.id);
                }
            } else {
                const error = await response.json();
                throw new Error(error.error || 'Failed to save');
            }
        } catch (err: any) {
            console.error('Failed to save persona:', err);
            showToast(`Failed to save: ${err.message}`, 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!selectedPersona) return;
        
        if (!confirm(`Are you sure you want to delete "${selectedPersona.name}"?`)) {
            return;
        }

        try {
            const response = await fetch(`/api/personas/${selectedPersona.id}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                showToast('Persona deleted successfully', 'success');
                await fetchPersonas();
                setSelectedPersona(null);
                setFormData({
                    id: '',
                    name: '',
                    description: '',
                    promptFile: null,
                    workflows: [],
                    allowedTools: [],
                    voiceId: 'matthew',
                    metadata: { language: 'en-US', region: 'UK', tone: 'professional' },
                    promptContent: ''
                });
            } else {
                throw new Error('Failed to delete');
            }
        } catch (err: any) {
            console.error('Failed to delete persona:', err);
            showToast(`Failed to delete: ${err.message}`, 'error');
        }
    };

    const toggleTool = (toolName: string) => {
        setFormData(prev => ({
            ...prev,
            allowedTools: prev.allowedTools.includes(toolName)
                ? prev.allowedTools.filter(t => t !== toolName)
                : [...prev.allowedTools, toolName]
        }));
    };

    const toggleWorkflow = (workflowId: string) => {
        setFormData(prev => ({
            ...prev,
            workflows: prev.workflows.includes(workflowId)
                ? prev.workflows.filter(w => w !== workflowId)
                : [...prev.workflows, workflowId]
        }));
    };

    return (
        <div className="max-w-6xl flex gap-6 h-full">
            {/* Left Sidebar - Persona List */}
            <div className={cn(
                "w-64 flex flex-col gap-4 border-r pr-6",
                isDarkMode ? "border-white/10" : "border-gray-200"
            )}>
                <div className="flex justify-between items-center">
                    <h2 className={cn("text-lg font-bold", isDarkMode ? "text-white" : "text-gray-900")}>
                        Personas
                    </h2>
                    <button
                        onClick={handleCreate}
                        className="p-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white transition-colors"
                        title="Create New Persona"
                    >
                        <Plus className="w-4 h-4" />
                    </button>
                </div>

                <div className="flex flex-col gap-2 overflow-y-auto">
                    {personas.map(persona => (
                        <button
                            key={persona.id}
                            onClick={() => handleSelectPersona(persona.id)}
                            className={cn(
                                "text-left p-3 rounded-lg transition-colors border",
                                selectedPersona?.id === persona.id
                                    ? isDarkMode
                                        ? "bg-violet-500/20 border-violet-500/50"
                                        : "bg-violet-50 border-violet-200"
                                    : isDarkMode
                                        ? "bg-white/5 border-white/10 hover:bg-white/10"
                                        : "bg-white border-gray-200 hover:bg-gray-50"
                            )}
                        >
                            <div className={cn("font-medium text-sm", isDarkMode ? "text-white" : "text-gray-900")}>
                                {persona.name}
                            </div>
                            <div className="text-xs text-gray-500 truncate">
                                {persona.description || 'No description'}
                            </div>
                        </button>
                    ))}
                </div>
            </div>

            {/* Right Panel - Persona Editor */}
            <div className="flex-1 flex flex-col gap-6 overflow-y-auto">
                {!selectedPersona && !isCreating ? (
                    <div className="flex items-center justify-center h-full text-gray-500">
                        <div className="text-center">
                            <p className="text-lg mb-2">No persona selected</p>
                            <p className="text-sm">Select a persona from the list or create a new one</p>
                        </div>
                    </div>
                ) : (
                    <>
                        {/* Header */}
                        <div className="flex justify-between items-center">
                            <h1 className={cn("text-2xl font-bold", isDarkMode ? "text-white" : "text-gray-900")}>
                                {isCreating ? 'Create Persona' : isEditing ? 'Edit Persona' : formData.name}
                            </h1>
                            <div className="flex items-center gap-2">
                                {!isEditing && !isCreating && (
                                    <>
                                        <button
                                            onClick={() => setIsEditing(true)}
                                            className={cn(
                                                "px-4 py-2 rounded-lg text-sm font-medium transition-colors border flex items-center gap-2",
                                                isDarkMode
                                                    ? "bg-white/5 border-white/10 hover:bg-white/10 text-white"
                                                    : "bg-white border-gray-200 hover:bg-gray-50 text-gray-700"
                                            )}
                                        >
                                            <Edit className="w-4 h-4" />
                                            Edit
                                        </button>
                                        <button
                                            onClick={handleDelete}
                                            className={cn(
                                                "px-4 py-2 rounded-lg text-sm font-medium transition-colors border flex items-center gap-2",
                                                isDarkMode
                                                    ? "bg-red-500/10 border-red-500/20 hover:bg-red-500/20 text-red-400"
                                                    : "bg-red-50 border-red-200 hover:bg-red-100 text-red-600"
                                            )}
                                        >
                                            <Trash2 className="w-4 h-4" />
                                            Delete
                                        </button>
                                    </>
                                )}
                                {(isEditing || isCreating) && (
                                    <>
                                        <button
                                            onClick={() => {
                                                setIsEditing(false);
                                                setIsCreating(false);
                                                if (selectedPersona) {
                                                    setFormData(selectedPersona);
                                                }
                                            }}
                                            className={cn(
                                                "px-4 py-2 rounded-lg text-sm font-medium transition-colors border flex items-center gap-2",
                                                isDarkMode
                                                    ? "bg-white/5 border-white/10 hover:bg-white/10 text-white"
                                                    : "bg-white border-gray-200 hover:bg-gray-50 text-gray-700"
                                            )}
                                        >
                                            <X className="w-4 h-4" />
                                            Cancel
                                        </button>
                                        <button
                                            onClick={handleSave}
                                            disabled={isSaving || !formData.id || !formData.name}
                                            className={cn(
                                                "px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors flex items-center gap-2",
                                                isSaving || !formData.id || !formData.name
                                                    ? "bg-gray-500 cursor-not-allowed"
                                                    : "bg-violet-600 hover:bg-violet-700"
                                            )}
                                        >
                                            <Save className="w-4 h-4" />
                                            {isSaving ? 'Saving...' : 'Save'}
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>

                        {/* Form Fields */}
                        <div className="space-y-6">
                            {/* Basic Info */}
                            <section className="space-y-4">
                                <h3 className={cn("text-sm font-semibold uppercase tracking-wider", isDarkMode ? "text-gray-400" : "text-gray-500")}>
                                    Basic Information
                                </h3>
                                
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className={cn("text-sm font-medium block mb-2", isDarkMode ? "text-gray-300" : "text-gray-700")}>
                                            Persona ID *
                                        </label>
                                        <input
                                            type="text"
                                            value={formData.id}
                                            onChange={(e) => setFormData({ ...formData, id: e.target.value })}
                                            disabled={!isCreating}
                                            className={cn(
                                                "w-full p-3 rounded-lg border outline-none transition-colors",
                                                isDarkMode
                                                    ? "bg-white/5 border-white/10 text-white"
                                                    : "bg-white border-gray-200 text-gray-900",
                                                !isCreating && "opacity-50 cursor-not-allowed"
                                            )}
                                            placeholder="persona-example"
                                        />
                                    </div>

                                    <div>
                                        <label className={cn("text-sm font-medium block mb-2", isDarkMode ? "text-gray-300" : "text-gray-700")}>
                                            Name *
                                        </label>
                                        <input
                                            type="text"
                                            value={formData.name}
                                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                            disabled={!isEditing && !isCreating}
                                            className={cn(
                                                "w-full p-3 rounded-lg border outline-none transition-colors",
                                                isDarkMode
                                                    ? "bg-white/5 border-white/10 text-white"
                                                    : "bg-white border-gray-200 text-gray-900",
                                                !isEditing && !isCreating && "opacity-50 cursor-not-allowed"
                                            )}
                                            placeholder="Example Persona"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className={cn("text-sm font-medium block mb-2", isDarkMode ? "text-gray-300" : "text-gray-700")}>
                                        Description
                                    </label>
                                    <textarea
                                        value={formData.description}
                                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                        disabled={!isEditing && !isCreating}
                                        rows={2}
                                        className={cn(
                                            "w-full p-3 rounded-lg border outline-none transition-colors resize-none",
                                            isDarkMode
                                                ? "bg-white/5 border-white/10 text-white"
                                                : "bg-white border-gray-200 text-gray-900",
                                            !isEditing && !isCreating && "opacity-50 cursor-not-allowed"
                                        )}
                                        placeholder="What does this persona do?"
                                    />
                                </div>

                                <div>
                                    <label className={cn("text-sm font-medium block mb-2", isDarkMode ? "text-gray-300" : "text-gray-700")}>
                                        Voice
                                    </label>
                                    <select
                                        value={formData.voiceId}
                                        onChange={(e) => setFormData({ ...formData, voiceId: e.target.value })}
                                        disabled={!isEditing && !isCreating}
                                        className={cn(
                                            "w-full p-3 rounded-lg border outline-none transition-colors",
                                            isDarkMode
                                                ? "bg-white/5 border-white/10 text-white"
                                                : "bg-white border-gray-200 text-gray-900",
                                            !isEditing && !isCreating && "opacity-50 cursor-not-allowed"
                                        )}
                                    >
                                        <option value="matthew">Matthew (US Male, Polyglot)</option>
                                        <option value="tiffany">Tiffany (US Female, Polyglot)</option>
                                        <option value="amy">Amy (UK Female)</option>
                                        <option value="ruth">Ruth (US Female)</option>
                                        <option value="stephen">Stephen (US Male)</option>
                                    </select>
                                </div>
                            </section>

                            {/* System Prompt */}
                            <section className="space-y-4">
                                <h3 className={cn("text-sm font-semibold uppercase tracking-wider", isDarkMode ? "text-gray-400" : "text-gray-500")}>
                                    System Prompt
                                </h3>
                                <textarea
                                    value={formData.promptContent || ''}
                                    onChange={(e) => setFormData({ ...formData, promptContent: e.target.value })}
                                    disabled={!isEditing && !isCreating}
                                    rows={12}
                                    className={cn(
                                        "w-full p-4 rounded-lg border outline-none transition-colors resize-y font-mono text-sm",
                                        isDarkMode
                                            ? "bg-white/5 border-white/10 text-white"
                                            : "bg-white border-gray-200 text-gray-900",
                                        !isEditing && !isCreating && "opacity-50 cursor-not-allowed"
                                    )}
                                    placeholder="You are a helpful assistant..."
                                />
                            </section>

                            {/* Allowed Tools */}
                            <section className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <h3 className={cn("text-sm font-semibold uppercase tracking-wider", isDarkMode ? "text-gray-400" : "text-gray-500")}>
                                        Allowed Tools
                                    </h3>
                                    <span className="text-xs text-gray-500">
                                        {formData.allowedTools.length}/{tools.length} selected
                                    </span>
                                </div>
                                <div className={cn(
                                    "grid grid-cols-2 gap-2 p-4 rounded-lg border max-h-60 overflow-y-auto",
                                    isDarkMode ? "bg-white/5 border-white/10" : "bg-white border-gray-200"
                                )}>
                                    {tools.map(tool => (
                                        <label key={tool.name} className="flex items-center gap-2 p-2 rounded hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={formData.allowedTools.includes(tool.name)}
                                                onChange={() => toggleTool(tool.name)}
                                                disabled={!isEditing && !isCreating}
                                                className="rounded border-gray-300 text-violet-600 focus:ring-violet-500"
                                            />
                                            <div className="flex-1 min-w-0">
                                                <div className={cn("text-sm font-medium truncate", isDarkMode ? "text-white" : "text-gray-900")}>
                                                    {tool.displayName || tool.name}
                                                </div>
                                                <div className="text-xs text-gray-500 truncate">
                                                    {tool.description}
                                                </div>
                                            </div>
                                        </label>
                                    ))}
                                </div>
                            </section>

                            {/* Linked Workflows */}
                            <section className="space-y-4">
                                <h3 className={cn("text-sm font-semibold uppercase tracking-wider", isDarkMode ? "text-gray-400" : "text-gray-500")}>
                                    Linked Workflows
                                </h3>
                                <div className={cn(
                                    "grid grid-cols-2 gap-2 p-4 rounded-lg border",
                                    isDarkMode ? "bg-white/5 border-white/10" : "bg-white border-gray-200"
                                )}>
                                    {workflows.map(workflow => (
                                        <label key={workflow.id} className="flex items-center gap-2 p-2 rounded hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={formData.workflows.includes(workflow.id)}
                                                onChange={() => toggleWorkflow(workflow.id)}
                                                disabled={!isEditing && !isCreating}
                                                className="rounded border-gray-300 text-violet-600 focus:ring-violet-500"
                                            />
                                            <span className={cn("text-sm font-medium", isDarkMode ? "text-white" : "text-gray-900")}>
                                                {workflow.name}
                                            </span>
                                        </label>
                                    ))}
                                </div>
                            </section>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
