#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Voice mappings for different workflows
const voiceConfig = {
  'triage': { voiceId: 'Matthew', persona: 'professional-banking', language: 'en-US' },
  'banking': { voiceId: 'Ruth', persona: 'friendly-banking', language: 'en-US' },
  'banking-master': { voiceId: 'Ruth', persona: 'friendly-banking', language: 'en-US' },
  'disputes': { voiceId: 'Stephen', persona: 'professional-disputes', language: 'en-US' },
  'idv': { voiceId: 'Matthew', persona: 'security-verification', language: 'en-US' },
  'transaction-investigation': { voiceId: 'Stephen', persona: 'investigation-specialist', language: 'en-US' },
  'persona-mortgage': { voiceId: 'Amy', persona: 'mortgage-advisor', language: 'en-GB' },
  'persona-sci_fi_bot': { voiceId: 'Matthew', persona: 'sci-fi-character', language: 'en-US' },
  'context': { voiceId: 'Matthew', persona: 'context-handler', language: 'en-US' },
  'handoff_test': { voiceId: 'Matthew', persona: 'test-agent', language: 'en-US' }
};

const workflowsDir = path.join(__dirname, 'backend', 'workflows');
const files = fs.readdirSync(workflowsDir).filter(f => f.startsWith('workflow_') && f.endsWith('.json'));

console.log(`Processing ${files.length} workflow files...`);

files.forEach(file => {
  const filePath = path.join(workflowsDir, file);
  const workflow = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  
  // Extract workflow ID
  const workflowId = workflow.id || file.replace('workflow_', '').replace('.json', '');
  
  // Get voice config or use default
  const config = voiceConfig[workflowId] || { 
    voiceId: 'Matthew', 
    persona: 'default', 
    language: 'en-US' 
  };
  
  // Add voice metadata if not present
  if (!workflow.voiceId) {
    workflow.voiceId = config.voiceId;
    workflow.metadata = {
      persona: config.persona,
      language: config.language,
      description: workflow.name || workflowId
    };
    
    fs.writeFileSync(filePath, JSON.stringify(workflow, null, 2));
    console.log(`✅ Updated ${file} with voice: ${config.voiceId}`);
  } else {
    console.log(`⏭️  Skipped ${file} (already has voice metadata)`);
  }
});

console.log('\nDone!');
