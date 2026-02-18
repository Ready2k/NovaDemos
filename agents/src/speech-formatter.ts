
/**
 * Speech Formatter - Converts text responses to speech-friendly format
 * 
 * This module handles the conversion of text agent responses to natural speech.
 * It's part of the "Text-to-Voice Wrapper" that makes text agents work as voice agents.
 */

// Mapping for number parsing
const smallNumbers: Record<string, number> = {
    'zero': 0, 'oh': 0, 'nil': 0, 'nought': 0,
    'one': 1, 'won': 1,
    'two': 2, 'too': 2, 'to': 2,
    'three': 3, 'tree': 3, 'free': 3,
    'four': 4, 'for': 4,
    'five': 5,
    'six': 6, 'sex': 6, 'c': 6, 'see': 6, 'sea': 6,
    'seven': 7,
    'eight': 8, 'aitch': 8, 'haitch': 8, 'h': 8,
    'nine': 9,
    'ten': 10, 'eleven': 11, 'twelve': 12, 'thirteen': 13, 'fourteen': 14,
    'fifteen': 15, 'sixteen': 16, 'seventeen': 17, 'eighteen': 18, 'nineteen': 19,
    'twenty': 20, 'thirty': 30, 'forty': 40, 'fifty': 50,
    'sixty': 60, 'seventy': 70, 'eighty': 80, 'ninety': 90
};

const magnitudes: Record<string, number> = {
    'hundred': 100,
    'thousand': 1000,
    'million': 1000000,
    'billion': 1000000000
};

/**
 * Convert spoken words to digits/numbers for clean transcript display
 * Handles both:
 * 1. Digit sequences: "my account is one two three" -> "my account is 123"
 * 2. Spoken values: "transfer one hundred and fifty pounds" -> "transfer 150 pounds"
 */
export function formatSpeechToText(text: string): string {
    if (!text) return text;

    // Pre-processing: 
    // - Remove 'and' when likely part of a number (e.g. "hundred and fifty")
    // - Normalize dashes ("twenty-one" -> "twenty one")
    let cleanText = text.toLowerCase()
        .replace(/-/g, ' ')
        // Replace punctuation with spaces to avoid joining words (e.g. "tuesday?and" -> "tuesday and")
        .replace(/[^\w\s]/g, ' ');

    const words = cleanText.split(/\s+/);
    const result: string[] = [];
    let currentNumberWords: string[] = [];

    const processBufferedNumber = () => {
        if (currentNumberWords.length === 0) return;

        // Decide if this is a sequence of digits (account number) or a value (amount)
        const hasMagnitude = currentNumberWords.some(w => magnitudes[w]);
        const hasDoubleDigits = currentNumberWords.some(w => smallNumbers[w] >= 10);

        // If it's just single digits 0-9, treat as sequence (12345)
        // If it looks like math ("hundred", "twenty"), parse as value
        if (hasMagnitude || hasDoubleDigits) {
            result.push(parseNumberString(currentNumberWords).toString());
        } else {
            // Treat as sequence of digits: "one two three" -> "123"
            const digits = currentNumberWords.map(w => smallNumbers[w]).join('');
            result.push(digits);
        }
        currentNumberWords = [];
    };

    for (let i = 0; i < words.length; i++) {
        const word = words[i];

        // Skip 'and' if it connects number words
        if (word === 'and') {
            const prevIsNum = i > 0 && (smallNumbers[words[i - 1]] !== undefined || magnitudes[words[i - 1]] !== undefined);
            const nextIsNum = i < words.length - 1 && (smallNumbers[words[i + 1]] !== undefined || magnitudes[words[i + 1]] !== undefined);
            if (prevIsNum && nextIsNum) {
                continue; // It's a connector "hundred AND fifty"
            }
        }

        if (smallNumbers[word] !== undefined || magnitudes[word] !== undefined) {
            currentNumberWords.push(word);
        } else {
            // End of number sequence
            processBufferedNumber();
            result.push(words[i]);
        }
    }
    processBufferedNumber();

    return result.join(' ');
}

function parseNumberString(words: string[]): number {
    let total = 0;
    let currentChunk = 0;

    for (const word of words) {
        if (smallNumbers[word] !== undefined) {
            currentChunk += smallNumbers[word];
        } else if (magnitudes[word] !== undefined) {
            const mag = magnitudes[word];
            if (mag === 100) {
                currentChunk *= 100;
            } else {
                total += currentChunk * mag;
                currentChunk = 0;
            }
        }
    }
    total += currentChunk;
    return total;
}

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
export function formatTextForSpeech(text: string): string {
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
        return `${numberToWords(parseInt(whole))} point ${decimal.split('').map((d: string) => numberToWords(parseInt(d))).join(' ')} percent`;
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
        // Skip if it's an 8 digit or 6 digit number (likely account/sort code)
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
        return numberToWords(numValue);

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
function numberToWords(num: number): string {
    if (num === 0) return 'zero';
    if (num < 0) return 'minus ' + numberToWords(-num);

    const ones = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
    const teens = ['ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
    const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
    const thousands = ['', 'thousand', 'million', 'billion'];

    function convertHundreds(n: number): string {
        let result = '';

        if (n >= 100) {
            result += ones[Math.floor(n / 100)] + ' hundred';
            n %= 100;
            if (n > 0) result += ' and ';
        }

        if (n >= 20) {
            result += tens[Math.floor(n / 10)];
            n %= 10;
            if (n > 0) result += '-' + ones[n];
        } else if (n >= 10) {
            result += teens[n - 10];
        } else if (n > 0) {
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
function getOrdinal(num: number): string {
    const ordinals = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth',
        'eleventh', 'twelfth', 'thirteenth', 'fourteenth', 'fifteenth', 'sixteenth', 'seventeenth', 'eighteenth', 'nineteenth', 'twentieth',
        'twenty-first', 'twenty-second', 'twenty-third', 'twenty-fourth', 'twenty-fifth', 'twenty-sixth', 'twenty-seventh', 'twenty-eighth', 'twenty-ninth', 'thirtieth', 'thirty-first'];

    return ordinals[num] || num.toString();
}

/**
 * Format year for speech (2024 → "twenty twenty-four")
 */
function formatYear(year: number): string {
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
export function containsAccountNumbers(text: string): boolean {
    return /\b\d{8}\b/.test(text) || /\b\d{6}\b/.test(text);
}
