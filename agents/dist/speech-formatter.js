"use strict";
/**
 * Speech Formatter - Converts text responses to speech-friendly format
 *
 * This module handles the conversion of text agent responses to natural speech.
 * It's part of the "Text-to-Voice Wrapper" that makes text agents work as voice agents.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatTextForSpeech = formatTextForSpeech;
exports.containsAccountNumbers = containsAccountNumbers;
/**
 * Format text for natural speech synthesis
 *
 * Key transformations:
 * 1. Numbers: "1200.50" → "one thousand two hundred pounds and fifty pence"
 * 2. Account numbers: Keep as individual digits for clarity
 * 3. Dates: "2024-01-15" → "January fifteenth, twenty twenty-four"
 * 4. Currency: "£1,200.50" → "one thousand two hundred pounds and fifty pence"
 * 5. Percentages: "3.5%" → "three point five percent"
 */
function formatTextForSpeech(text) {
    let formatted = text;
    // 1. Format currency amounts (£1,200.50 → "one thousand two hundred pounds and fifty pence")
    formatted = formatted.replace(/£([\d,]+)\.(\d{2})/g, (match, pounds, pence) => {
        const poundsNum = parseInt(pounds.replace(/,/g, ''));
        const penceNum = parseInt(pence);
        const poundsText = numberToWords(poundsNum);
        const penceText = penceNum > 0 ? ` and ${numberToWords(penceNum)} ${penceNum === 1 ? 'penny' : 'pence'}` : '';
        return `${poundsText} ${poundsNum === 1 ? 'pound' : 'pounds'}${penceText}`;
    });
    // 2. Format standalone currency amounts without pence (£1,200 → "one thousand two hundred pounds")
    formatted = formatted.replace(/£([\d,]+)(?!\.\d)/g, (match, pounds) => {
        const poundsNum = parseInt(pounds.replace(/,/g, ''));
        const poundsText = numberToWords(poundsNum);
        return `${poundsText} ${poundsNum === 1 ? 'pound' : 'pounds'}`;
    });
    // 3. Format percentages (3.5% → "three point five percent")
    formatted = formatted.replace(/(\d+)\.(\d+)%/g, (match, whole, decimal) => {
        return `${numberToWords(parseInt(whole))} point ${decimal.split('').map((d) => numberToWords(parseInt(d))).join(' ')} percent`;
    });
    formatted = formatted.replace(/(\d+)%/g, (match, num) => {
        return `${numberToWords(parseInt(num))} percent`;
    });
    // 4. Format dates (2024-01-15 → "January fifteenth, twenty twenty-four")
    formatted = formatted.replace(/(\d{4})-(\d{2})-(\d{2})/g, (match, year, month, day) => {
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'];
        const monthName = monthNames[parseInt(month) - 1];
        const dayOrdinal = getOrdinal(parseInt(day));
        const yearText = formatYear(parseInt(year));
        return `${monthName} ${dayOrdinal}, ${yearText}`;
    });
    // 5. Format large standalone numbers (but NOT account numbers or sort codes)
    // Only format numbers that are clearly amounts (with commas or in currency context)
    formatted = formatted.replace(/\b([\d,]+)\b(?!\s*(?:account|sort code|reference))/gi, (match, num) => {
        // Skip if it's an 8-digit or 6-digit number (likely account/sort code)
        const cleanNum = num.replace(/,/g, '');
        if (cleanNum.length === 8 || cleanNum.length === 6) {
            return match; // Keep as-is
        }
        // Skip if it's already been processed (contains letters)
        if (/[a-zA-Z]/.test(match)) {
            return match;
        }
        // Format large numbers (> 999) to words
        const numValue = parseInt(cleanNum);
        if (numValue > 999) {
            return numberToWords(numValue);
        }
        return match;
    });
    // 6. Clean up any remaining formatting artifacts
    formatted = formatted.replace(/\s+/g, ' ').trim();
    return formatted;
}
/**
 * Convert number to words (British English)
 * Examples:
 * - 1200 → "one thousand two hundred"
 * - 1000000 → "one million"
 * - 1234567 → "one million two hundred thirty-four thousand five hundred sixty-seven"
 */
function numberToWords(num) {
    if (num === 0)
        return 'zero';
    if (num < 0)
        return 'minus ' + numberToWords(-num);
    const ones = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
    const teens = ['ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
    const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
    const thousands = ['', 'thousand', 'million', 'billion'];
    function convertHundreds(n) {
        let result = '';
        if (n >= 100) {
            result += ones[Math.floor(n / 100)] + ' hundred';
            n %= 100;
            if (n > 0)
                result += ' and ';
        }
        if (n >= 20) {
            result += tens[Math.floor(n / 10)];
            n %= 10;
            if (n > 0)
                result += '-' + ones[n];
        }
        else if (n >= 10) {
            result += teens[n - 10];
        }
        else if (n > 0) {
            result += ones[n];
        }
        return result;
    }
    let result = '';
    let thousandCounter = 0;
    while (num > 0) {
        const chunk = num % 1000;
        if (chunk > 0) {
            const chunkText = convertHundreds(chunk);
            const thousandText = thousands[thousandCounter];
            result = chunkText + (thousandText ? ' ' + thousandText : '') + (result ? ' ' + result : '');
        }
        num = Math.floor(num / 1000);
        thousandCounter++;
    }
    return result.trim();
}
/**
 * Get ordinal suffix for day (1st, 2nd, 3rd, etc.)
 */
function getOrdinal(num) {
    const ordinals = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth',
        'eleventh', 'twelfth', 'thirteenth', 'fourteenth', 'fifteenth', 'sixteenth', 'seventeenth', 'eighteenth', 'nineteenth', 'twentieth',
        'twenty-first', 'twenty-second', 'twenty-third', 'twenty-fourth', 'twenty-fifth', 'twenty-sixth', 'twenty-seventh', 'twenty-eighth', 'twenty-ninth', 'thirtieth', 'thirty-first'];
    return ordinals[num] || num.toString();
}
/**
 * Format year for speech (2024 → "twenty twenty-four")
 */
function formatYear(year) {
    if (year >= 2000 && year < 2100) {
        const century = Math.floor(year / 100);
        const remainder = year % 100;
        if (remainder === 0) {
            return numberToWords(year);
        }
        const centuryText = numberToWords(century * 100);
        const remainderText = remainder < 10
            ? `oh ${numberToWords(remainder)}`
            : numberToWords(remainder);
        return `${centuryText.replace(' hundred', '')} ${remainderText}`;
    }
    return numberToWords(year);
}
/**
 * Check if text contains account/sort code patterns
 * Used to avoid formatting these as words
 */
function containsAccountNumbers(text) {
    return /\b\d{8}\b/.test(text) || /\b\d{6}\b/.test(text);
}
