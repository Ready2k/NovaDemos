"use strict";
/**
 * Workflow Utilities
 *
 * Functions for converting workflow definitions to text instructions
 * for injection into Nova Sonic system prompts.
 *
 * Copied from backend/src/utils/server-utils.ts
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.convertWorkflowToText = convertWorkflowToText;
exports.cleanTextForSonic = cleanTextForSonic;
exports.formatUserTranscript = formatUserTranscript;
/**
 * Convert workflow definition to text instructions for Nova Sonic
 *
 * This function takes a workflow JSON and converts it into natural language
 * instructions that Nova Sonic can follow. The instructions include:
 * - Entry point
 * - Step-by-step instructions for each node
 * - Tool invocation requirements
 * - Sub-workflow handling
 * - Transition logic
 *
 * CRITICAL: Every response must start with [STEP: node_id] tag for state tracking
 */
function convertWorkflowToText(workflow) {
    if (!workflow || !workflow.nodes || !Array.isArray(workflow.nodes)) {
        return "";
    }
    let text = "### WORKFLOW INSTRUCTIONS\n";
    text += "You are executing a STRICT workflow. You represent a state machine.\n\n";
    text += "CRITICAL RULES:\n";
    text += "1. You MUST begin EVERY response with the tag [STEP: node_id]\n";
    text += "2. This tag is INTERNAL ONLY - DO NOT speak it aloud or mention it to the user\n";
    text += "3. The tag is for system tracking - it should be SILENT and INVISIBLE to the user\n";
    text += "4. Follow the workflow logic internally but speak naturally to the user\n";
    text += "5. DO NOT narrate your decision-making process (e.g., don't say 'Assuming X is Y')\n";
    text += "6. DO NOT mention conditions, transitions, or workflow steps in your spoken response\n";
    text += "7. Execute the workflow silently and only speak the user-facing content\n\n";
    text += "Format: [STEP: node_id] <your natural response to user>\n";
    text += "Example: [STEP: check_auth] I need to verify your identity first.\n";
    text += "BAD Example: [STEP: check_auth] (Assuming marker_Vunl is not greater than 5) I need to verify...\n\n";
    // 1. Map Nodes
    const startNode = workflow.nodes.find((n) => n.type === 'start');
    if (startNode) {
        text += `ENTRY POINT: Begin execution at step [${startNode.id}]. Start your first response with [STEP: ${startNode.id}].\n\n`;
    }
    text += "WORKFLOW STEPS (INTERNAL - DO NOT NARRATE THESE TO USER):\n\n";
    workflow.nodes.forEach((node) => {
        text += `STEP [${node.id}] (${node.type}):\n`;
        text += `   USER-FACING INSTRUCTION: ${node.label || 'No instruction'}\n`;
        // Tool Config
        if (node.type === 'tool' && node.toolName) {
            text += `   -> INTERNAL ACTION: Call tool "${node.toolName}" (do not mention this to user)\n`;
        }
        // Sub-Workflow Config
        if (node.type === 'workflow' && node.workflowId) {
            text += `   -> INTERNAL ACTION: Load workflow "${node.workflowId}" (do not mention this to user)\n`;
        }
        // Transitions
        const edges = workflow.edges?.filter((e) => e.from === node.id) || [];
        if (edges.length > 0) {
            text += "   INTERNAL TRANSITIONS (DO NOT SPEAK THESE):\n";
            edges.forEach((edge) => {
                const condition = edge.label ? `IF "${edge.label}"` : "NEXT";
                text += `   - ${condition} -> GOTO [${edge.to}]\n`;
            });
        }
        else if (node.type === 'end') {
            text += "   -> INTERNAL: Process ends here\n";
        }
        text += "\n";
    });
    text += "\nREMEMBER: All workflow logic is INTERNAL. Only speak naturally to the user about what they need to know.\n";
    return text;
}
/**
 * Clean text for Nova Sonic (Input to TTS/Model)
 * Removes internal markers and formatting that shouldn't be spoken
 */
function cleanTextForSonic(text) {
    if (!text || typeof text !== 'string')
        return text;
    let clean = text;
    // Remove workflow step tags (internal markers, not for user)
    clean = clean.replace(/\[STEP:\s*[^\]]+\]\s*/gi, '');
    // Remove markdown formatting while preserving spaces
    clean = clean.replace(/\*\*([^*]+)\*\*/g, '$1'); // **text** -> text
    clean = clean.replace(/\*([^*]+)\*/g, '$1'); // *text* -> text
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
 * Format user transcript (e.g. "one two three" -> "123")
 */
function formatUserTranscript(text) {
    if (!text)
        return text;
    let formatted = text;
    // Simple textual number to digit mapping
    const numberMap = {
        'zero': '0', 'one': '1', 'two': '2', 'three': '3', 'four': '4', 'five': '5',
        'six': '6', 'seven': '7', 'eight': '8', 'nine': '9', 'ten': '10',
        'eleven': '11', 'twelve': '12', 'twenty': '20', 'thirty': '30',
        'forty': '40', 'fifty': '50', 'sixty': '60', 'seventy': '70',
        'eighty': '80', 'ninety': '90', 'double': 'double', 'triple': 'triple'
    };
    // Handle number sequences (e.g. "one two three four" -> "1234")
    const numberWords = Object.keys(numberMap).join('|');
    const sequenceRegex = new RegExp(`\\b(${numberWords})([\\s,.-]+(${numberWords}))+\\b`, 'gi');
    formatted = formatted.replace(sequenceRegex, (match) => {
        const parts = match.split(/[\s,.-]+/);
        let result = '';
        let pendingMultiplier = 1;
        for (const part of parts) {
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
                let digits = '';
                for (let i = 0; i < pendingMultiplier; i++)
                    digits += digit;
                result += digits;
                pendingMultiplier = 1;
            }
        }
        return result;
    });
    return formatted;
}
