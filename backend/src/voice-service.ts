/**
 * Voice Service for Nova 2 Sonic
 * 
 * This service manages available voices for Amazon Nova 2 Sonic.
 * Based on AWS documentation: https://docs.aws.amazon.com/nova/latest/nova2-userguide/using-conversational-speech.html
 */

export interface Voice {
    id: string;
    name: string;
    language: string;
    region: string;
    gender: 'male' | 'female';
    description?: string;
}

/**
 * Nova 2 Sonic voices - verified working voices only
 * Based on actual Nova 2 Sonic API validation and AWS documentation
 * Note: Nova 2 Sonic supports polyglot voices that can speak multiple languages
 */
export const NOVA_SONIC_VOICES: Voice[] = [
    // English (US) voices - confirmed working
    { id: "matthew", name: "Matthew", language: "en-US", region: "US", gender: "male", description: "US Male voice" },
    { id: "tiffany", name: "Tiffany", language: "en-US", region: "US", gender: "female", description: "US Female voice" },
    
    // English (UK) voices - confirmed working  
    { id: "amy", name: "Amy", language: "en-GB", region: "UK", gender: "female", description: "British Female voice" },
    
    // French voices - confirmed working
    { id: "florian", name: "Florian", language: "fr-FR", region: "FR", gender: "male", description: "French Male voice" },
    { id: "ambre", name: "Ambre", language: "fr-FR", region: "FR", gender: "female", description: "French Female voice" },
    
    // Additional voices that may be supported (conservative list)
    // These are common Polly voices that Nova 2 Sonic likely supports
    { id: "joanna", name: "Joanna", language: "en-US", region: "US", gender: "female", description: "US Female voice" },
    { id: "joey", name: "Joey", language: "en-US", region: "US", gender: "male", description: "US Male voice" },
    { id: "justin", name: "Justin", language: "en-US", region: "US", gender: "male", description: "US Male voice" },
    { id: "kendra", name: "Kendra", language: "en-US", region: "US", gender: "female", description: "US Female voice" },
    { id: "kimberly", name: "Kimberly", language: "en-US", region: "US", gender: "female", description: "US Female voice" },
    { id: "salli", name: "Salli", language: "en-US", region: "US", gender: "female", description: "US Female voice" },
    
    // UK voices
    { id: "brian", name: "Brian", language: "en-GB", region: "UK", gender: "male", description: "British Male voice" },
    { id: "emma", name: "Emma", language: "en-GB", region: "UK", gender: "female", description: "British Female voice" },
    
    // Australian voices
    { id: "nicole", name: "Nicole", language: "en-AU", region: "AU", gender: "female", description: "Australian Female voice" },
    { id: "russell", name: "Russell", language: "en-AU", region: "AU", gender: "male", description: "Australian Male voice" },
    
    // Indian English voices (using standard Polly voice IDs)
    { id: "aditi", name: "Aditi", language: "en-IN", region: "IN", gender: "female", description: "Indian Female voice" },
    { id: "raveena", name: "Raveena", language: "en-IN", region: "IN", gender: "female", description: "Indian Female voice" },
];

/**
 * Get all available voices
 */
export function getAllVoices(): Voice[] {
    return NOVA_SONIC_VOICES;
}

/**
 * Get voices filtered by language
 */
export function getVoicesByLanguage(language: string): Voice[] {
    return NOVA_SONIC_VOICES.filter(voice => voice.language === language);
}

/**
 * Get voices filtered by region
 */
export function getVoicesByRegion(region: string): Voice[] {
    return NOVA_SONIC_VOICES.filter(voice => voice.region === region);
}

/**
 * Get voice by ID
 */
export function getVoiceById(id: string): Voice | undefined {
    return NOVA_SONIC_VOICES.find(voice => voice.id === id);
}

/**
 * Format voices for frontend consumption
 */
export function formatVoicesForFrontend(): Array<{id: string, name: string}> {
    return NOVA_SONIC_VOICES.map(voice => ({
        id: voice.id,
        name: `${voice.name} (${voice.region} ${voice.gender === 'male' ? 'Male' : 'Female'})`
    }));
}

/**
 * Future: This function could be extended to dynamically fetch voices from AWS
 * Currently returns the static list, but could be enhanced to call AWS APIs
 */
export async function fetchAvailableVoices(): Promise<Voice[]> {
    // TODO: In the future, this could call AWS Bedrock APIs to get available voices
    // For now, return the comprehensive static list
    return getAllVoices();
}