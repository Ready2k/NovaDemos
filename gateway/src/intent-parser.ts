/**
 * Intent Parser - Extract user intent and account details from messages
 */

export interface ParsedIntent {
    intent?: string;
    accountNumber?: string;
    sortCode?: string;
    hasAccountDetails: boolean;
}

/**
 * Extract account number and sort code from user message
 * Supports various formats:
 * - "account 12345678 sort code 112233"
 * - "12345678, 112233"
 * - "account number is 12345678 and sort code is 112233"
 * - "12345678" (just account number)
 * - "112233" (just sort code)
 * 
 * CRITICAL: Now supports PARTIAL matches - can extract just account OR just sort code
 */
export function extractAccountDetails(message: string): ParsedIntent {
    const result: ParsedIntent = {
        hasAccountDetails: false
    };

    // Normalize message
    const normalized = message.toLowerCase().replace(/[^\w\s]/g, ' ');

    // Pattern 1: "account 12345678 sort code 112233"
    const pattern1 = /account\s*(?:number|id|no)?\s*(\d{8})\s*(?:and|with)?\s*sort\s*code\s*(\d{6})/i;
    const match1 = message.match(pattern1);
    if (match1) {
        result.accountNumber = match1[1];
        result.sortCode = match1[2];
        result.hasAccountDetails = true;
        return result;
    }

    // Pattern 2: "sort code 112233 account 12345678" (reversed order)
    const pattern2 = /sort\s*code\s*(\d{6})\s*(?:and|with)?\s*account\s*(?:number|id|no)?\s*(\d{8})/i;
    const match2 = message.match(pattern2);
    if (match2) {
        result.sortCode = match2[1];
        result.accountNumber = match2[2];
        result.hasAccountDetails = true;
        return result;
    }

    // Pattern 3: "12345678, 112233" or "12345678 112233" (numbers only)
    const pattern3 = /\b(\d{8})\s*[,\s]\s*(\d{6})\b/;
    const match3 = message.match(pattern3);
    if (match3) {
        result.accountNumber = match3[1];
        result.sortCode = match3[2];
        result.hasAccountDetails = true;
        return result;
    }

    // Pattern 4: "my account is 12345678 and sort code is 112233"
    const pattern4 = /(?:my\s+)?account\s+(?:is\s+)?(\d{8})\s+(?:and\s+)?(?:my\s+)?sort\s*code\s+(?:is\s+)?(\d{6})/i;
    const match4 = message.match(pattern4);
    if (match4) {
        result.accountNumber = match4[1];
        result.sortCode = match4[2];
        result.hasAccountDetails = true;
        return result;
    }

    // Pattern 5: Just look for 8-digit and 6-digit numbers (both present)
    const eightDigit = message.match(/\b(\d{8})\b/);
    const sixDigit = message.match(/\b(\d{6})\b/);
    if (eightDigit && sixDigit) {
        result.accountNumber = eightDigit[1];
        result.sortCode = sixDigit[1];
        result.hasAccountDetails = true;
        return result;
    }

    // CRITICAL NEW PATTERNS: Handle partial matches
    
    // Pattern 6: Just account number (8 digits) with context
    const accountOnly = /(?:account|acc|acct)\s*(?:number|no|num|#)?\s*(?:is\s+)?(\d{8})\b/i;
    const matchAccount = message.match(accountOnly);
    if (matchAccount) {
        result.accountNumber = matchAccount[1];
        // Don't set hasAccountDetails=true since we only have partial
        return result;
    }

    // Pattern 7: Just sort code (6 digits) with context
    const sortOnly = /(?:sort\s*code|sortcode)\s*(?:is\s+)?(\d{6})\b/i;
    const matchSort = message.match(sortOnly);
    if (matchSort) {
        result.sortCode = matchSort[1];
        // Don't set hasAccountDetails=true since we only have partial
        return result;
    }

    // Pattern 8: Just 8 digits alone (likely account number)
    if (eightDigit && !sixDigit) {
        result.accountNumber = eightDigit[1];
        return result;
    }

    // Pattern 9: Just 6 digits alone (likely sort code)
    if (sixDigit && !eightDigit) {
        result.sortCode = sixDigit[1];
        return result;
    }

    return result;
}

/**
 * Extract user intent from message
 * Detects common banking intents
 */
export function extractIntent(message: string): string | undefined {
    const normalized = message.toLowerCase();

    // Balance check intent
    if (normalized.match(/\b(balance|check.*balance|what.*balance|show.*balance|my balance)\b/)) {
        return 'check_balance';
    }

    // Transaction history intent
    if (normalized.match(/\b(transactions?|transaction history|recent transactions?|statement)\b/)) {
        return 'view_transactions';
    }

    // Dispute intent
    if (normalized.match(/\b(dispute|challenge|unauthorized|unrecognized|didn't make|fraud)\b/)) {
        return 'dispute_transaction';
    }

    // Mortgage intent
    if (normalized.match(/\b(mortgage|home loan|loan|borrow|lending)\b/)) {
        return 'mortgage_inquiry';
    }

    // Payment intent
    if (normalized.match(/\b(pay|payment|transfer|send money)\b/)) {
        return 'make_payment';
    }

    return undefined;
}

/**
 * Parse user message for intent and account details
 */
export function parseUserMessage(message: string): ParsedIntent {
    const accountDetails = extractAccountDetails(message);
    const intent = extractIntent(message);

    return {
        ...accountDetails,
        intent
    };
}
