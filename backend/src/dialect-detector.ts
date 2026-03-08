/**
 * Dialect Detection Service
 *
 * Maps detected speaker locale/language codes to appropriate voice IDs.
 * Locale detection is handled by Nova Sonic's built-in language identification.
 */

export interface LocaleDetectionResult {
    locale: string; // e.g., 'en-US', 'en-GB', 'fr-FR'
    confidence: number; // 0.0 - 1.0
    voiceId: string;
}

/**
 * Voice mapping table - maps detected locales to voice IDs
 */
const LOCALE_VOICE_MAP: Record<string, string> = {
    'en-US': 'matthew',
    'en-GB': 'amy',
    'en-AU': 'olivia',
    'en-IN': 'kiara',
    'fr-FR': 'ambre',
    'es-ES': 'tiffany',
    'es-US': 'tiffany', // Spanish (US)
    'fr-CA': 'ambre', // French (Canada) - use same voice
};

/**
 * Parse locale from a language identification result
 *
 * @param localeResult - Object containing detected language code and confidence
 * @returns Detection result with locale, confidence, and recommended voice ID
 */
export function parseTranscribeLocale(localeResult: any): LocaleDetectionResult {
    const detectedLanguage = localeResult.detectedLanguage || localeResult.LanguageCode || 'en-US';
    const confidence = localeResult.languageConfidence || localeResult.IdentifiedLanguageScore || 0.5;

    // Map to voice ID
    const voiceId = LOCALE_VOICE_MAP[detectedLanguage] || 'matthew';

    return {
        locale: detectedLanguage,
        confidence: confidence,
        voiceId: voiceId
    };
}

/**
 * Get voice ID for a specific locale
 * 
 * @param locale - Locale code (e.g., 'en-GB', 'fr-FR')
 * @param customMap - Optional custom voice mapping
 * @returns Voice ID for Amazon Nova 2 Sonic, or undefined if not found
 */
export function getVoiceForLocale(locale: string, customMap?: Record<string, string>): string | undefined {
    const map = customMap || LOCALE_VOICE_MAP;
    return map[locale];
}

/**
 * Get all supported locales
 * 
 * @returns Array of supported locale codes
 */
export function getSupportedLocales(): string[] {
    return Object.keys(LOCALE_VOICE_MAP);
}

/**
 * Check if a locale is supported
 * 
 * @param locale - Locale code to check
 * @returns True if the locale is supported
 */
export function isLocaleSupported(locale: string): boolean {
    return locale in LOCALE_VOICE_MAP;
}

/**
 * Get default voice mapping
 * 
 * @returns Default locale to voice ID mapping
 */
export function getDefaultVoiceMap(): Record<string, string> {
    return { ...LOCALE_VOICE_MAP };
}
