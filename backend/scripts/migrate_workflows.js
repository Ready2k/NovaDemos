const fs = require('fs');
const path = require('path');

const SRC_DIR = path.join(__dirname, '../src');
const DEST_DIR = path.join(__dirname, '../workflows');

if (!fs.existsSync(DEST_DIR)) {
    fs.mkdirSync(DEST_DIR, { recursive: true });
}

const files = fs.readdirSync(SRC_DIR).filter(f => f.startsWith('workflow-') && f.endsWith('.json'));

console.log(`Found ${files.length} workflows in ${SRC_DIR}`);

files.forEach(file => {
    try {
        const content = JSON.parse(fs.readFileSync(path.join(SRC_DIR, file), 'utf-8'));

        // Extract ID from filename: 'workflow-banking.json' -> 'banking'
        // 'workflow-persona-sci_fi_bot.json' -> 'persona-sci_fi_bot'? Or just replace hyphen with underscore?
        // My server expects `workflow_${id}.json`.
        // Let's take everything after 'workflow-' as the ID.
        const idPart = file.replace('workflow-', '').replace('.json', '');

        // standardise ID to underscores if it has hyphens?
        // If I change the ID, I must ensure I don't break links if any exist.
        // For now, let's keep the ID as close to filename as possible but use underscores for the *file prefix* only.
        // wait, server.ts does `workflow_${req.params.id}.json`.
        // If file is `workflow-banking.json`, ID is `banking`. New file: `workflow_banking.json`.
        // If file is `workflow-persona-mortgage.json`, ID is `persona-mortgage`. New file: `workflow_persona-mortgage.json`.

        const id = idPart;
        const name = id.split(/[-_]/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

        // Inject metadata if missing
        if (!content.id) content.id = id;
        if (!content.name) content.name = name;

        const newFilename = `workflow_${id}.json`;
        fs.writeFileSync(path.join(DEST_DIR, newFilename), JSON.stringify(content, null, 2));
        console.log(`Migrated ${file} -> ${newFilename}`);

    } catch (e) {
        console.error(`Failed to migrate ${file}:`, e);
    }
});
