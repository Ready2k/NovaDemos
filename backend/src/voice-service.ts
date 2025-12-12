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
 * Comprehensive list of Nova 2 Sonic voices based on AWS documentation
 * These voices support multilingual and polyglot capabilities
 */
export const NOVA_SONIC_VOICES: Voice[] = [
    // English (US) voices
    { id: "matthew", name: "Matthew", language: "en-US", region: "US", gender: "male", description: "US Male voice" },
    { id: "tiffany", name: "Tiffany", language: "en-US", region: "US", gender: "female", description: "US Female voice" },
    { id: "james", name: "James", language: "en-US", region: "US", gender: "male", description: "US Male voice" },
    { id: "sarah", name: "Sarah", language: "en-US", region: "US", gender: "female", description: "US Female voice" },
    
    // English (UK) voices
    { id: "amy", name: "Amy", language: "en-GB", region: "UK", gender: "female", description: "British Female voice" },
    { id: "brian", name: "Brian", language: "en-GB", region: "UK", gender: "male", description: "British Male voice" },
    { id: "emma", name: "Emma", language: "en-GB", region: "UK", gender: "female", description: "British Female voice" },
    
    // English (Australia) voices
    { id: "nicole", name: "Nicole", language: "en-AU", region: "AU", gender: "female", description: "Australian Female voice" },
    { id: "russell", name: "Russell", language: "en-AU", region: "AU", gender: "male", description: "Australian Male voice" },
    
    // English (India) voices
    { id: "raveena", name: "Raveena", language: "en-IN", region: "IN", gender: "female", description: "Indian Female voice" },
    { id: "aditi", name: "Aditi", language: "en-IN", region: "IN", gender: "female", description: "Indian Female voice" },
    
    // French voices
    { id: "florian", name: "Florian", language: "fr-FR", region: "FR", gender: "male", description: "French Male voice" },
    { id: "ambre", name: "Ambre", language: "fr-FR", region: "FR", gender: "female", description: "French Female voice" },
    { id: "celine", name: "Céline", language: "fr-FR", region: "FR", gender: "female", description: "French Female voice" },
    { id: "mathieu", name: "Mathieu", language: "fr-FR", region: "FR", gender: "male", description: "French Male voice" },
    
    // German voices
    { id: "hans", name: "Hans", language: "de-DE", region: "DE", gender: "male", description: "German Male voice" },
    { id: "marlene", name: "Marlene", language: "de-DE", region: "DE", gender: "female", description: "German Female voice" },
    { id: "vicki", name: "Vicki", language: "de-DE", region: "DE", gender: "female", description: "German Female voice" },
    
    // Italian voices
    { id: "giorgio", name: "Giorgio", language: "it-IT", region: "IT", gender: "male", description: "Italian Male voice" },
    { id: "carla", name: "Carla", language: "it-IT", region: "IT", gender: "female", description: "Italian Female voice" },
    { id: "bianca", name: "Bianca", language: "it-IT", region: "IT", gender: "female", description: "Italian Female voice" },
    
    // Spanish voices
    { id: "enrique", name: "Enrique", language: "es-ES", region: "ES", gender: "male", description: "Spanish Male voice" },
    { id: "conchita", name: "Conchita", language: "es-ES", region: "ES", gender: "female", description: "Spanish Female voice" },
    { id: "lucia", name: "Lucía", language: "es-ES", region: "ES", gender: "female", description: "Spanish Female voice" },
    
    // Portuguese voices
    { id: "ricardo", name: "Ricardo", language: "pt-BR", region: "BR", gender: "male", description: "Portuguese Male voice" },
    { id: "vitoria", name: "Vitória", language: "pt-BR", region: "BR", gender: "female", description: "Portuguese Female voice" },
    { id: "camila", name: "Camila", language: "pt-BR", region: "BR", gender: "female", description: "Portuguese Female voice" },
    
    // Hindi voices
    { id: "aditi_hi", name: "Aditi", language: "hi-IN", region: "IN", gender: "female", description: "Hindi Female voice" },
    { id: "kendra_hi", name: "Kendra", language: "hi-IN", region: "IN", gender: "female", description: "Hindi Female voice" },
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