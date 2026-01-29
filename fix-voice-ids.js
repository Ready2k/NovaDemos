#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// AWS Nova Sonic voice IDs (all lowercase)
// Source: https://docs.aws.amazon.com/nova/latest/nova2-userguide/sonic-language-support.html
const validVoices = {
  // English (US) - Polyglot voices (can speak all languages)
  'tiffany': { language: 'en-US', gender: 'feminine', polyglot: true },
  'matthew': { language: 'en-US', gender: 'masculine', polyglot: true },
  
  // English (UK)
  'amy': { language: 'en-GB', gender: 'feminine' },
  
  // English (Australia)
  'olivia': { language: 'en-AU', gender: 'feminine' },
  
  // English (Indian) / Hindi
  'kiara': { language: 'en-IN/hi-IN', gender: 'feminine' },
  'arjun': { language: 'en-IN/hi-IN', gender: 'masculine' },
  
  // French
  'ambre': { language: 'fr-FR', gender: 'feminine' },
  'florian': { language: 'fr-FR', gender: 'masculine' },
  
  // Italian
  'beatrice': { language: 'it-IT', gender: 'feminine' },
  'lorenzo': { language: 'it-IT', gender: 'masculine' },
  
  // German
  'tina': { language: 'de-DE', gender: 'feminine' },
  'lennart': { language: 'de-DE', gender: 'masculine' },
  
  // Spanish (US)
  'lupe': { language: 'es-US', gender: 'feminine' },
  'carlos': { language: 'es-US', gender: 'masculine' },
  
  // Portuguese
  'carolina': { language: 'pt-BR', gender: 'feminine' },
  'leo': { language: 'pt-BR', gender: 'masculine' }
};

// Mapping from old capitalized names to Nova Sonic voice IDs
const voiceMapping = {
  'Matthew': 'matthew',
  'Ruth': 'tiffany',      // Ruth -> Tiffany (US feminine)
  'Stephen': 'matthew',   // Stephen -> Matthew (US masculine)
  'Amy': 'amy',           // Amy -> amy (UK feminine)
  'Joanna': 'tiffany',
  'Joey': 'matthew',
  'Kendra': 'tiffany',
  'Kimberly': 'tiffany',
  'Salli': 'tiffany'
};

const workflowsDir = path.join(__dirname, 'backend', 'workflows');
const files = fs.readdirSync(workflowsDir).filter(f => f.startsWith('workflow_') && f.endsWith('.json'));

console.log('========================================');
console.log('Fixing Voice IDs for AWS Nova Sonic');
console.log('========================================\n');
console.log('AWS Nova Sonic requires lowercase voice IDs');
console.log('Available voices:', Object.keys(validVoices).join(', '));
console.log('');

files.forEach(file => {
  const filePath = path.join(workflowsDir, file);
  const workflow = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  
  if (workflow.voiceId) {
    const oldVoice = workflow.voiceId;
    let newVoice = workflow.voiceId.toLowerCase();
    
    // Map old Polly names to Nova Sonic voices
    if (voiceMapping[workflow.voiceId]) {
      newVoice = voiceMapping[workflow.voiceId];
    }
    
    // Validate voice exists
    if (!validVoices[newVoice]) {
      console.log(`⚠️  ${file}: Unknown voice "${newVoice}", defaulting to "matthew"`);
      newVoice = 'matthew';
    }
    
    if (oldVoice !== newVoice) {
      workflow.voiceId = newVoice;
      fs.writeFileSync(filePath, JSON.stringify(workflow, null, 2));
      const voiceInfo = validVoices[newVoice];
      console.log(`✅ ${file}: ${oldVoice} → ${newVoice} (${voiceInfo.language}, ${voiceInfo.gender})`);
    } else {
      console.log(`⏭️  ${file}: ${newVoice} (already correct)`);
    }
  } else {
    console.log(`⚠️  ${file}: No voiceId found, adding "matthew"`);
    workflow.voiceId = 'matthew';
    fs.writeFileSync(filePath, JSON.stringify(workflow, null, 2));
  }
});

console.log('\n========================================');
console.log('Done! All voice IDs are now Nova Sonic compatible.');
console.log('========================================');
console.log('\nNote: "tiffany" and "matthew" are polyglot voices');
console.log('that can speak all supported languages.');

