/**
 * Test Persona Configurations
 * 
 * This module provides test persona configurations for integration testing.
 * These personas are simplified versions for testing agent behavior.
 * 
 * Validates: Requirement 13.5 - Testing Support
 */

import { PersonaConfig } from '../../src/persona-types';

/**
 * Basic test persona with minimal configuration
 */
export const basicPersona: PersonaConfig = {
    id: 'test-basic',
    name: 'Basic Test Persona',
    description: 'A basic persona for simple testing',
    promptFile: 'test-basic.txt',
    workflows: ['test-simple'],
    allowedTools: [],
    voiceId: 'matthew',
    metadata: {
        language: 'en-US',
        region: 'US',
        tone: 'neutral'
    }
};

/**
 * Banking test persona with tool access
 */
export const bankingPersona: PersonaConfig = {
    id: 'test-banking',
    name: 'Banking Test Persona',
    description: 'A banking persona for tool testing',
    promptFile: 'test-banking.txt',
    workflows: ['test-tool'],
    allowedTools: [
        'agentcore_balance',
        'get_account_transactions',
        'perform_idv_check'
    ],
    voiceId: 'matthew',
    metadata: {
        language: 'en-US',
        region: 'UK',
        tone: 'professional',
        specializations: ['banking', 'account-management']
    }
};

/**
 * Triage test persona for handoff testing
 */
export const triagePersona: PersonaConfig = {
    id: 'test-triage',
    name: 'Triage Test Persona',
    description: 'A triage persona for handoff testing',
    promptFile: 'test-triage.txt',
    workflows: ['test-handoff'],
    allowedTools: [
        'transfer_to_banking',
        'transfer_to_idv',
        'return_to_triage'
    ],
    voiceId: 'matthew',
    metadata: {
        language: 'en-US',
        region: 'UK',
        tone: 'professional-efficient',
        specializations: ['routing', 'triage']
    }
};

/**
 * Specialist test persona for handoff target testing
 */
export const specialistPersona: PersonaConfig = {
    id: 'test-specialist',
    name: 'Specialist Test Persona',
    description: 'A specialist persona for handoff target testing',
    promptFile: 'test-specialist.txt',
    workflows: ['test-complex'],
    allowedTools: [
        'agentcore_balance',
        'get_account_transactions',
        'perform_idv_check',
        'return_to_triage'
    ],
    voiceId: 'tiffany',
    metadata: {
        language: 'en-US',
        region: 'UK',
        tone: 'professional-warm',
        specializations: ['banking', 'specialist-support']
    }
};

/**
 * Multi-lingual test persona
 */
export const multilingualPersona: PersonaConfig = {
    id: 'test-multilingual',
    name: 'Multilingual Test Persona',
    description: 'A multilingual persona for language testing',
    promptFile: 'test-multilingual.txt',
    workflows: ['test-simple'],
    allowedTools: [],
    voiceId: 'amy',
    metadata: {
        language: 'en-GB',
        region: 'UK',
        tone: 'friendly',
        supportedLanguages: ['en-US', 'en-GB', 'es-ES', 'fr-FR']
    }
};

/**
 * Get all test personas
 */
export const allTestPersonas = {
    basic: basicPersona,
    banking: bankingPersona,
    triage: triagePersona,
    specialist: specialistPersona,
    multilingual: multilingualPersona
};

/**
 * Get a test persona by ID
 */
export function getTestPersona(id: string): PersonaConfig | undefined {
    return Object.values(allTestPersonas).find(p => p.id === id);
}
