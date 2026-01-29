
import * as fs from 'fs';
import * as path from 'path';
// We need to access Langfuse here. In original server.ts it was a global or imported.
// We'll instantiate a new Langfuse instance or import it if we make it a singleton.
// For now, let's assume we import the class and instantiate, or pass it in.
// However, the `langfuse` generic usage suggests we might want a singleton wrapper.
import { Langfuse } from 'langfuse';

// Determine if running in Docker or locally
const isDocker = fs.existsSync('/app');
const BASE_DIR = isDocker ? '/app' : path.join(__dirname, '../..');
const PROMPTS_DIR = path.join(BASE_DIR, 'prompts');

export class PromptService {
    private langfuse: Langfuse;
    private promptsCache: { id: string, name: string, content: string, source: 'langfuse' | 'local', config?: any }[] | null = null;
    private lastPromptsSyncTime = 0;
    private promptsSyncPromise: Promise<any[]> | null = null;
    private PROMPTS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

    constructor() {
        this.langfuse = new Langfuse({
            publicKey: process.env.LANGFUSE_PUBLIC_KEY,
            secretKey: process.env.LANGFUSE_SECRET_KEY,
            baseUrl: process.env.LANGFUSE_HOST || process.env.LANGFUSE_BASEURL || "https://cloud.langfuse.com"
        });

        // Ensure prompt dir exists
        if (!fs.existsSync(PROMPTS_DIR)) {
            fs.mkdirSync(PROMPTS_DIR, { recursive: true });
        }
    }

    async loadPrompt(filename: string): Promise<string> {
        const promptName = filename.replace('.txt', '');
        try {
            console.log(`[PromptService] Fetching prompt from Langfuse: ${promptName}`);
            const prompt = await this.langfuse.getPrompt(promptName);
            return prompt.compile();
        } catch (err) {
            console.warn(`[PromptService] Failed to fetch prompt ${promptName} from Langfuse, falling back to local file:`, err);
            try {
                const promptPath = path.join(PROMPTS_DIR, filename);
                console.log(`[PromptService] DEBUG: Loading local prompt from ${promptPath}`);
                if (!fs.existsSync(promptPath)) {
                    console.error(`[PromptService] CRITICAL: File does not exist at ${promptPath}`);
                    return '';
                }
                return fs.readFileSync(promptPath, 'utf-8').trim();
            } catch (localErr) {
                console.error(`[PromptService] Failed to load prompt ${filename} locally:`, localErr);
                return '';
            }
        }
    }

    async listPrompts(forceRefresh = false): Promise<{ id: string, name: string, content: string, source: 'langfuse' | 'local', config?: any }[]> {
        const now = Date.now();

        // 1. Return cached data if valid
        if (!forceRefresh && this.promptsCache && (now - this.lastPromptsSyncTime < this.PROMPTS_CACHE_TTL)) {
            return this.promptsCache;
        }

        // 2. Return active promise if already syncing
        if (this.promptsSyncPromise) {
            return this.promptsSyncPromise;
        }

        console.log('[PromptService] Syncing prompts (Source: Langfuse + Local)...');

        // 3. Start new sync
        this.promptsSyncPromise = (async () => {
            try {
                // 1. Get Prompts from Langfuse
                const cloudPrompts = new Set<string>();
                try {
                    // @ts-ignore
                    const response = await this.langfuse.api.promptsList({ limit: 100 });
                    if (response && response.data) {
                        response.data.forEach((p: any) => cloudPrompts.add(p.name));
                    }
                } catch (e) {
                    console.warn('[PromptService] Failed to list prompts from Langfuse API:', e);
                }

                // 2. Get Local Files
                const localFiles = new Set<string>();
                try {
                    const files = fs.readdirSync(PROMPTS_DIR);
                    files.filter(f => f.endsWith('.txt')).forEach(f => localFiles.add(f.replace('.txt', '')));
                } catch (e) {
                    console.error('[PromptService] Failed to read local prompts directory:', e);
                }

                // 3. Union
                const allNames = Array.from(new Set([...cloudPrompts, ...localFiles]));
                const promptsWithSource: any[] = [];
                const BATCH_SIZE = 5;

                for (let i = 0; i < allNames.length; i += BATCH_SIZE) {
                    const batch = allNames.slice(i, i + BATCH_SIZE);
                    const batchResults = await Promise.all(
                        batch.map(async promptName => {
                            let displayName = promptName;
                            const filename = promptName + '.txt';

                            // Formatting names
                            if (displayName.startsWith('core-')) {
                                displayName = 'Core ' + displayName.substring(5).replace(/_/g, ' ');
                            } else if (displayName.startsWith('persona-')) {
                                displayName = 'Persona ' + displayName.substring(8).replace(/_/g, ' ');
                            } else {
                                displayName = displayName.replace(/_/g, ' ');
                            }
                            displayName = displayName.replace(/\b\w/g, l => l.toUpperCase());

                            let source: 'langfuse' | 'local' = 'local';
                            let content = '';
                            let config: any = {};

                            try {
                                if (cloudPrompts.has(promptName)) {
                                    const prompt = await this.langfuse.getPrompt(promptName);
                                    config = (prompt as any).config || {};
                                    if (prompt.type === 'chat' && Array.isArray(prompt.prompt)) {
                                        const systemMsg = prompt.prompt.find((m: any) => m.role === 'system') || prompt.prompt[0];
                                        content = systemMsg?.content || '';
                                    } else {
                                        content = prompt.compile();
                                    }
                                    source = 'langfuse';

                                    // Update local cache
                                    try {
                                        const localPath = path.join(PROMPTS_DIR, filename);
                                        fs.writeFileSync(localPath, content.trim());
                                    } catch (writeErr) {
                                        console.error(`[PromptService] Failed to cache prompt ${promptName}:`, writeErr);
                                    }
                                } else {
                                    throw new Error("Local only");
                                }
                            } catch (err) {
                                source = 'local';
                                try {
                                    const localPath = path.join(PROMPTS_DIR, filename);
                                    if (fs.existsSync(localPath)) {
                                        let rawContent = fs.readFileSync(localPath, 'utf-8');
                                        const parts = rawContent.split(/[\r\n]+-{3,}[\r\n]+/);
                                        if (parts.length > 1) {
                                            content = parts[0].trim();
                                            try {
                                                config = JSON.parse(parts[1].trim());
                                            } catch (e) {
                                                console.warn(`[PromptService] Failed to parse config from ${filename}:`, e);
                                            }
                                        } else {
                                            content = rawContent.trim();
                                        }
                                    }
                                } catch (localErr) {
                                    console.error(`[PromptService] Failed to load local backup for ${promptName}:`, localErr);
                                }
                            }

                            if (!content) return null;
                            return { id: promptName, name: displayName, content, source, config };
                        })
                    );
                    promptsWithSource.push(...batchResults.filter(p => p !== null));
                }

                this.promptsCache = promptsWithSource;
                this.lastPromptsSyncTime = Date.now();
                return promptsWithSource;

            } catch (e) {
                console.error('[PromptService] listPrompts failed:', e);
                return [];
            } finally {
                this.promptsSyncPromise = null;
            }
        })();

        return this.promptsSyncPromise;
    }
}
