"use strict";
/**
 * Intent Parser - Extract user intent and account details from messages
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractAccountDetails = extractAccountDetails;
exports.extractIntent = extractIntent;
exports.parseUserMessage = parseUserMessage;
/**
 * Extract account number and sort code from user message
 * Supports various formats:
 * - "account 12345678 sort code 112233"
 * - "12345678, 112233"
 * - "account number is 12345678 and sort code is 112233"
 */
function extractAccountDetails(message) {
    const result = {
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
    // Pattern 5: Just look for 8-digit and 6-digit numbers
    const eightDigit = message.match(/\b(\d{8})\b/);
    const sixDigit = message.match(/\b(\d{6})\b/);
    if (eightDigit && sixDigit) {
        result.accountNumber = eightDigit[1];
        result.sortCode = sixDigit[1];
        result.hasAccountDetails = true;
        return result;
    }
    return result;
}
/**
 * Extract user intent from message
 * Detects common banking intents
 */
function extractIntent(message) {
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
function parseUserMessage(message) {
    const accountDetails = extractAccountDetails(message);
    const intent = extractIntent(message);
    return {
        ...accountDetails,
        intent
    };
}
