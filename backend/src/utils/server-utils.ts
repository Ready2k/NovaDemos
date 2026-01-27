
// String Manipulation Utilities for Voice S2S

/**
 * Clean text for Nova Sonic (Input to TTS/Model)
 */
export function cleanTextForSonic(text: string): string {
    if (!text || typeof text !== 'string') return text;

    let clean = text;

    // Remove workflow step tags (internal markers, not for user)
    clean = clean.replace(/\[STEP:\s*[^\]]+\]\s*/gi, '');

    // Remove markdown formatting while preserving spaces
    // First, handle bold and italic (preserve the text, remove markers)
    clean = clean.replace(/\*\*([^*]+)\*\*/g, '$1');  // **text** -> text
    clean = clean.replace(/\*([^*]+)\*/g, '$1');      // *text* -> text
    // clean = clean.replace(/_([^_]+)_/g, '$1');        // _text_ -> text (Disabled to protect JSON keys)
    // Remove remaining markdown (headers, code blocks)
    clean = clean.replace(/[#`]/g, '');
    // Collapse newlines
    clean = clean.replace(/\n{3,}/g, '\n\n');

    // Extract just the time information for cleaner speech if present
    const timeMatch = clean.match(/current time.*?is[:\s]+([^.\n]+)/i);
    if (timeMatch) {
        return `The current time is ${timeMatch[1].trim()}`;
    }

    return clean;
}

/**
 * Clean assistant transcripts for display in the UI.
 * Handles stripping hidden tags, fixing punctuation spacing, and cleaning up brackets.
 */
export function cleanAssistantDisplay(text: string): string {
    if (!text) return text;

    let clean = text;

    // 1. Remove all specific bracketed tags but keep contents of [Read Digits]
    clean = clean.replace(/\[STEP:\s*[^\]]*\]\s*/gi, '');
    clean = clean.replace(/\[DIALECT:\s*[^\]]*\]\s*/gi, '');
    clean = clean.replace(/(?:\[|\b)S?E?N?TIMENT:?\s*[^\]]*\]?/gi, ''); // Robust TIMENT stripping
    clean = clean.replace(/\[TRANSLATION:\s*[^\]]*\]\s*/gi, '');
    clean = clean.replace(/\[SYSTEM_INJECTION:[^\]]*\]\s*/gi, '');

    // 2. Extract contents of [Read Digits: ...] or just [1 2 3]
    clean = clean.replace(/\[Read\s+Digits:\s*([^\]]+)\]/gi, '$1');

    // 3. Remove any other [TAG: ...] or [TAG] but be careful not to strip legitimate markdown/UI elements
    // We only strip tags that are all caps and likely internal.
    clean = clean.replace(/\[[A-Z0-9_\s]+\s*(?::\s*[^\]]*)?\]/g, '');

    // 3.5 Fix Money Formatting (e.g. £4. 50 -> £4.50)
    clean = clean.replace(/£\s*([\d,]+)\s*[.,]\s+(\d{2})/g, '£$1.$2');

    // 4. Fix missing spaces after punctuation (common after tag stripping)
    // Add space after . ! ? if followed by a letter or number, but NOT for decimals
    clean = clean.replace(/([.!?])([a-zA-Z0-9])/g, '$1 $2');

    // 5. Ensure space between words and numbers (common after stripping [Read Digits])
    clean = clean.replace(/([a-zA-Z])(\d)/g, '$1 $2');
    clean = clean.replace(/(\d)([a-zA-Z])/g, '$1 $2');

    // 6. Clean up stray brackets and punctuation
    clean = clean.replace(/(\d)\]/g, '$1'); // Fix "12345678]"
    clean = clean.replace(/\[(?=\s*\d)/g, ''); // Fix "[ 123"
    clean = clean.replace(/\]\./g, '.'); // Fix "]."
    clean = clean.replace(/\]\s*([a-zA-Z0-9])/g, ' $1'); // Fix "]word" or "]123"

    // 7. Formatting: Newlines and collapsing spaces
    clean = clean.replace(/[ \t]+/g, ' '); // Collapse horizontal whitespace
    clean = clean.replace(/\n\s*\n/g, '\n\n'); // Normalize double newlines

    // 8. Final trim
    clean = clean.trim();

    // Ensure first letter is capitalized if it's a sentence
    if (clean.length > 2 && /^[a-z]/.test(clean)) {
        clean = clean.charAt(0).toUpperCase() + clean.slice(1);
    }

    return clean;
}

/**
 * Format user transcript (e.g. "one two three" -> "123")
 */
export function formatUserTranscript(text: string): string {
    if (!text) return text;

    let formatted = text;

    // Simple textual number to digit mapping
    const numberMap: { [key: string]: string } = {
        'zero': '0', 'one': '1', 'two': '2', 'three': '3', 'four': '4', 'five': '5',
        'six': '6', 'seven': '7', 'eight': '8', 'nine': '9', 'ten': '10',
        'eleven': '11', 'twelve': '12', 'twenty': '20', 'thirty': '30',
        'forty': '40', 'fifty': '50', 'sixty': '60', 'seventy': '70',
        'eighty': '80', 'ninety': '90', 'double': 'double', 'triple': 'triple'
    };

    // Pre-processing: Split concatenated number words (e.g. "seveneight" -> "seven eight", "onetwo" -> "one two")
    // Use a specific regex built from number words
    const numKeys = Object.keys(numberMap).filter(k => k !== 'double' && k !== 'triple').join('|');
    // Regex matches instances where two number words are adjacent with NO space
    const concatRegex = new RegExp(`(${numKeys})(${numKeys})`, 'gi');

    // Apply multiple times to handle overlaps (e.g. onetwothree -> one two three)
    let prevText = '';
    while (formatted !== prevText) {
        prevText = formatted;
        formatted = formatted.replace(concatRegex, '$1 $2');
    }

    // Regex to capture "£word point word" pattern
    // e.g. "£three point fifty" -> "£3.50"
    formatted = formatted.replace(/£([a-z]+)\s+point\s+([a-z]+)/gi, (match, p1, p2) => {
        const whole = numberMap[p1.toLowerCase()];
        const fraction = numberMap[p2.toLowerCase()];

        if (whole && fraction) {
            // "point fifty" (50) vs "point five" (5)
            // If fraction is single digit like '5' (from 'five'), it might mean 0.5 or 0.50? 
            // Usually "point five" = .5, "point fifty" = .50
            return `£${whole}.${fraction}`;
        }
        return match;
    });

    // Handle "£word" (e.g. "£five")
    formatted = formatted.replace(/£([a-z]+)/gi, (match, p1) => {
        const num = numberMap[p1.toLowerCase()];
        return num ? `£${num}` : match;
    });

    // Handle "three pounds fifty" -> "£3.50"
    formatted = formatted.replace(/([a-z]+)\s+pounds?\s+([a-z]+)/gi, (match, p1, p2) => {
        const whole = numberMap[p1.toLowerCase()];
        const fraction = numberMap[p2.toLowerCase()];
        if (whole && fraction) {
            return `£${whole}.${fraction}`;
        }
        return match;
    });

    // Handle generic number sequences (e.g. "one two three four" -> "1234", "one, two" -> "12")
    const numberWords = Object.keys(numberMap).join('|');
    // Allow spaces, commas, dots, dashes as separators between number words
    const separatorRegex = /[\s,.-]+/;
    const sequenceRegex = new RegExp(`\\b(${numberWords})([\\s,.-]+(${numberWords}))+\\b`, 'gi');

    formatted = formatted.replace(sequenceRegex, (match) => {
        // Split but capture separators so we can ignore them
        const parts = match.split(/([\s,.-]+)/);
        let result = '';
        let pendingMultiplier = 1;
        let pendingTens = 0; // Track if we have a "ty" number awaiting a single digit

        for (const part of parts) {
            // Check if it is a separator - if so, IGNORE it (collapse to contiguous digits)
            if (separatorRegex.test(part)) {
                continue;
            }

            const lower = part.toLowerCase();
            if (lower === 'double') {
                pendingMultiplier = 2;
                continue;
            }
            if (lower === 'triple') {
                pendingMultiplier = 3;
                continue;
            }

            const digit = numberMap[lower];
            if (digit) {
                // Check if this is a "ty" number (20, 30, 40, etc.) that should combine with next digit
                const isTyNumber = ['20', '30', '40', '50', '60', '70', '80', '90'].includes(digit);
                const isSingleDigit = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'].includes(digit);

                // If we have a pending tens value and current is a single digit, combine them
                if (pendingTens > 0 && isSingleDigit) {
                    result += (pendingTens + parseInt(digit)).toString();
                    pendingTens = 0;
                    pendingMultiplier = 1;
                }
                // If this is a ty number, store it to potentially combine with next digit
                else if (isTyNumber) {
                    // First flush any pending tens that weren't combined
                    if (pendingTens > 0) {
                        result += pendingTens.toString();
                    }
                    pendingTens = parseInt(digit);
                    // Don't add to result yet, wait to see if next digit combines
                }
                // Regular case
                else {
                    // First flush any pending tens that weren't combined
                    if (pendingTens > 0) {
                        result += pendingTens.toString();
                        pendingTens = 0;
                    }

                    // Apply multiplier
                    let digits = '';
                    for (let i = 0; i < pendingMultiplier; i++) digits += digit;

                    result += digits;
                    pendingMultiplier = 1; // Reset
                }
            } else {
                // Flush pending tens if any non-number word appears
                if (pendingTens > 0) {
                    result += pendingTens.toString();
                    pendingTens = 0;
                }
                // Fallback (unlikely)
                result += part;
            }
        }

        // Flush any remaining pending tens at end of sequence
        if (pendingTens > 0) {
            result += pendingTens.toString();
        }

        return result;
    });

    return formatted;
}

/**
 * Workflow Injection Helper
 */
export function convertWorkflowToText(workflow: any): string {
    if (!workflow || !workflow.nodes || !Array.isArray(workflow.nodes)) return "";

    let text = "### WORKFLOW INSTRUCTIONS\n";
    text += "You are executing a STRICT workflow. You represent a state machine.\n";
    text += "CRITICAL RULE: You MUST begin EVERY single response with the tag [STEP: node_id].\n";
    text += "This tag tells the UI where you are. Without it, the interface BREAKS.\n";
    text += "Format: [STEP: node_id] Your response text...\n";
    text += "Example: [STEP: check_auth] I removed the example text to save tokens.\n";
    text += "DO NOT FORGET THIS TAG. IT IS MANDATORY FOR EVERY TURN.\n";
    text += "SILENCE INSTRUCTION: The [STEP: ...] tag is for system control only. DO NOT SPEAK IT ALOUD. Keep it silent.\n\n";

    // 1. Map Nodes
    const startNode = workflow.nodes.find((n: any) => n.type === 'start');
    if (startNode) {
        text += `ENTRY POINT: Begin execution at step [${startNode.id}]. Start your first response with [STEP: ${startNode.id}].\n`;
    }

    workflow.nodes.forEach((node: any) => {
        text += `STEP [${node.id}] (${node.type}):\n   INSTRUCTION: ${node.label || 'No instruction'}\n`;

        // Tool Config
        if (node.type === 'tool' && node.toolName) {
            text += `   -> ACTION REQUIRED: You MUST call the tool "${node.toolName}" after completing your verbal response. Do not cut yourself off.\n`;
        }

        // Sub-Workflow Config - MODIFIED FOR DRIP FEED
        if (node.type === 'workflow' && node.workflowId) {
            text += `   -> SUB-PROCESS REQUIRED: You must load the "${node.workflowId}" workflow to proceed.\n`;
            text += `   -> ACTION: Call Tool "start_workflow" with workflowId="${node.workflowId}"\n`;
            text += `   -> WAIT for the system to reload with new instructions.\n`;
        }

        // Transitions
        const edges = workflow.edges.filter((e: any) => e.from === node.id);
        if (edges.length > 0) {
            text += "   TRANSITIONS:\n";
            edges.forEach((edge: any) => {
                const condition = edge.label ? `IF "${edge.label}"` : "NEXT";
                text += `   - ${condition} -> GOTO [${edge.to}]\n`;
            });
        } else if (node.type === 'end') {
            text += "   -> PROCESS ENDS. (If this was a sub-workflow, navigate back to the calling step).\n";
        }
        text += "\n";
    });

    return text;
}

/**
 * Remove Internal Duplication from a text block
 * Nova Sonic sometimes repeats its whole thought process (e.g. "Let me check... Let me check...").
 * We strip these out if they are adjacent and identical.
 * Also handles strict repetition of the exact same sentence multiple times.
 */
export function removeInternalDuplication(text: string): string {
    if (!text || text.length < 10) return text;

    // 1. Sentence-level duplication (e.g. "Hello world. Hello world.")
    // Split by sentence boundaries (keep delimiters)
    const sentences = text.match(/[^.!?]+[.!?]+(\s|$)/g) || [text];
    const uniqueSentences: string[] = [];

    sentences.forEach((sent, idx) => {
        const trimmed = sent.trim();
        // If it's the same as the previous sentence, skip it
        if (idx > 0 && trimmed === uniqueSentences[uniqueSentences.length - 1]?.trim()) {
            return; // Skip duplicate
        }
        uniqueSentences.push(sent);
    });

    // Reassemble
    let clean = uniqueSentences.join('');

    // 2. Phrase-level duplication (e.g. "Let me check Let me check")
    // Simple heuristic: if the string is composed of two identical halves, take one.
    if (clean.length > 20) {
        const half = Math.floor(clean.length / 2);
        // Check if first half equals second half (ignoring whitespace differences or slight cutoffs)
        const first = clean.substring(0, half).trim();
        const second = clean.substring(half).trim();

        if (first === second || second.startsWith(first)) {
            return first;
        }
    }

    return clean;
}

/**
 * Extract New Content from accumulated response
 * Nova Sonic behaves like an LLM completing a prompt - it often repeats the ENTIRE assistant turn so far.
 * We need to diff the new text against what we've already processed/displayed.
 * 
 * @param currentText The full text received from the current event
 * @param previousResponses Array of previous finalized responses from the assistant in this turn/session
 */
export function extractNewContent(currentText: string, previousResponses: string[]): string {
    if (!currentText || previousResponses.length === 0) return currentText;

    let processed = currentText.trim();

    // Iterate backwards through previous responses to find overlap
    // We assume the model appends to the history, so currentText should START with some previous response content.
    for (let i = previousResponses.length - 1; i >= 0; i--) {
        const prev = previousResponses[i].trim();
        if (prev.length < 5) continue; // Ignore very short previous messages

        // Check for Prefix Match
        // If currentText starts with prev, strip it.
        if (processed.startsWith(prev)) {
            processed = processed.substring(prev.length).trim();
        }
        // Check for Suffix Match (Model repeating itself in reverse?! Uncommon, but possible in hallucination)
        // Check for Overlap (end of prev matches start of processed)
        // ... (Advanced diffing if needed, but prefix check handles 90% of Nova Sonic repetition)
    }

    return processed;
}

export function calculateStringSimilarity(str1: string, str2: string): number {
    const words1 = str1.split(' ').filter(w => w.length > 2);
    const words2 = str2.split(' ').filter(w => w.length > 2);

    if (words1.length === 0 || words2.length === 0) return 0;

    const commonWords = words1.filter(w => words2.includes(w));
    return commonWords.length / Math.max(words1.length, words2.length);
}

/**
 * Calculate Root Mean Square (RMS) of audio buffer
 */
export function calculateRMS(buffer: Buffer): number {
    if (buffer.length === 0) return 0;

    let sum = 0;
    const int16Buffer = new Int16Array(buffer.buffer, buffer.byteOffset, buffer.length / 2);

    for (let i = 0; i < int16Buffer.length; i++) {
        sum += int16Buffer[i] * int16Buffer[i];
    }

    return Math.sqrt(sum / int16Buffer.length);
}
