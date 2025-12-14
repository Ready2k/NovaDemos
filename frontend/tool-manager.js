/**
 * Tool Manager Logical Implementation
 */

document.addEventListener('DOMContentLoaded', () => {
    loadTools();
    setupEventListeners();
});

let currentTools = [];
let editingToolName = null;

function setupEventListeners() {
    document.getElementById('save-tool-btn').addEventListener('click', saveTool);
    document.getElementById('delete-tool-btn').addEventListener('click', deleteTool);
    document.getElementById('new-tool-btn').addEventListener('click', openNewTool);
    document.getElementById('import-gateway-btn').addEventListener('click', openGatewayImporter);
    document.getElementById('gateway-import-confirm-btn').addEventListener('click', importFromGateway);
    document.getElementById('gateway-modal-close').addEventListener('click', closeGatewayModal);

    // Reset form
    document.getElementById('cancel-edit-btn').addEventListener('click', () => {
        document.getElementById('tool-editor').classList.add('hidden');
        document.getElementById('tool-list-container').classList.remove('hidden');
    });

    // Visual Mode Switching
    document.getElementById('mode-visual-btn').addEventListener('click', () => switchEditorMode('visual'));
    document.getElementById('mode-json-btn').addEventListener('click', () => switchEditorMode('json'));

    // Add Param
    document.getElementById('add-param-btn').addEventListener('click', addVisualParam);

    // Sync JSON on change
    document.getElementById('tool-schema').addEventListener('input', () => {
        // Optional: validate JSON real-time
    });
    // Category Select Change
    document.getElementById('tool-category-select').addEventListener('change', (e) => {
        const customInput = document.getElementById('tool-category-custom');
        if (e.target.value === '__NEW__') {
            customInput.classList.remove('hidden');
            customInput.focus();
        } else {
            customInput.classList.add('hidden');
        }
    });
}

async function loadTools() {
    try {
        const response = await fetch('/api/tools');
        const tools = await response.json();
        currentTools = tools;
        renderToolList(tools);
    } catch (error) {
        console.error('Failed to load tools:', error);
        showToast('Failed to load tools', 'error');
    }
}

function renderToolList(tools) {
    const listContainer = document.getElementById('tool-list');
    listContainer.innerHTML = '';

    // --- Populate Categories Select ---
    const categories = new Set(['Banking', 'Mortgage', 'System', 'Other']);
    tools.forEach(t => {
        if (t.category) categories.add(t.category);
    });

    const select = document.getElementById('tool-category-select');
    if (select) {
        select.innerHTML = '';
        Array.from(categories).sort().forEach(cat => {
            const option = document.createElement('option');
            option.value = cat;
            option.textContent = cat;
            select.appendChild(option);
        });

        // Add "Create New" option
        const newOpt = document.createElement('option');
        newOpt.value = '__NEW__';
        newOpt.textContent = '[+] Create New Category...';
        newOpt.style.color = '#a78bfa'; // light purple
        newOpt.style.fontWeight = 'bold';
        select.appendChild(newOpt);
    }

    if (tools.length === 0) {
        listContainer.innerHTML = '<div class="text-gray-500 italic p-4">No tools found. Create one or import from Gateway.</div>';
        return;
    }

    tools.forEach(tool => {
        const item = document.createElement('div');
        item.className = 'tool-item p-3 border-b border-gray-700 hover:bg-gray-800 cursor-pointer flex justify-between items-center';
        item.innerHTML = `
            <div class="flex-1 min-w-0 mr-3">
                <div class="font-bold text-blue-400 truncate" title="${tool.name}">${tool.name}</div>
                <div class="text-xs text-gray-400 truncate" title="${tool.description || ''}">${tool.description || 'No description'}</div>
            </div>
            <div class="text-[10px] ${tool.gatewayTarget ? 'bg-purple-900/50 text-purple-300 border border-purple-700' : 'bg-gray-800 text-gray-500 border border-gray-700'} px-2 py-0.5 rounded uppercase font-bold tracking-wider whitespace-nowrap">
                ${tool.gatewayTarget ? 'Gateway' : 'Local'}
            </div>
        `;
        item.addEventListener('click', () => loadToolIntoEditor(tool));
        listContainer.appendChild(item);
    });
}

function loadToolIntoEditor(tool) {
    editingToolName = tool.name;
    document.getElementById('tool-name').value = tool.name;
    document.getElementById('tool-description').value = tool.description || '';
    document.getElementById('tool-instruction').value = tool.instruction || '';
    document.getElementById('tool-agent-prompt').value = tool.agentPrompt || '';
    document.getElementById('tool-gateway-target').value = tool.gatewayTarget || '';
    document.getElementById('tool-gateway-target').value = tool.gatewayTarget || '';

    // Category Handling
    const catSelect = document.getElementById('tool-category-select');
    const customInput = document.getElementById('tool-category-custom');

    // If checking existence in current options
    let found = false;
    for (let i = 0; i < catSelect.options.length; i++) {
        if (catSelect.options[i].value === tool.category) {
            catSelect.value = tool.category;
            found = true;
            break;
        }
    }

    if (!found) {
        // Should have been found via renderToolList logic, but if not (edge case), default to Other
        catSelect.value = 'Other';
    }
    customInput.classList.add('hidden');
    customInput.value = '';

    // Handle schema (prefer input_schema, fallback to parameters)
    const schema = tool.input_schema || tool.inputSchema || tool.parameters || {};
    document.getElementById('tool-schema').value = JSON.stringify(schema, null, 2);

    // Update UI state
    document.getElementById('tool-list-container').classList.add('hidden');
    document.getElementById('tool-editor').classList.remove('hidden');
    document.getElementById('editor-title').textContent = `Editing: ${tool.name}`;
    document.getElementById('delete-tool-btn').classList.remove('hidden');

    // Disable name editing for existing tools to correspond with filename
    document.getElementById('tool-name').readOnly = true;

    // Default to visual mode and load data
    switchEditorMode('visual');
}

function openNewTool() {
    editingToolName = null;
    document.getElementById('tool-name').value = '';
    document.getElementById('tool-name').readOnly = false;
    document.getElementById('tool-description').value = '';
    document.getElementById('tool-instruction').value = '';
    document.getElementById('tool-agent-prompt').value = '';
    document.getElementById('tool-gateway-target').value = '';
    document.getElementById('tool-gateway-target').value = '';

    document.getElementById('tool-category-select').value = 'Other';
    document.getElementById('tool-category-custom').classList.add('hidden');
    document.getElementById('tool-category-custom').value = '';
    document.getElementById('tool-schema').value = '{\n  "type": "object",\n  "properties": {},\n  "required": []\n}';

    document.getElementById('tool-list-container').classList.add('hidden');
    document.getElementById('tool-editor').classList.remove('hidden');
    document.getElementById('editor-title').textContent = 'New Tool';
    document.getElementById('delete-tool-btn').classList.add('hidden');

    // Default to visual mode for new tools
    switchEditorMode('visual');
}

async function saveTool() {
    const name = document.getElementById('tool-name').value.trim();
    if (!name) {
        showToast('Tool name is required', 'error');
        return;
    }

    // Sync Visual to JSON if in visual mode
    if (!document.getElementById('schema-visual-editor').classList.contains('hidden')) {
        syncVisualToJson();
    }

    try {
        const schema = JSON.parse(document.getElementById('tool-schema').value);

        const toolDef = {
            name: name,
            description: document.getElementById('tool-description').value,
            input_schema: schema,
            instruction: document.getElementById('tool-instruction').value,
            agentPrompt: document.getElementById('tool-agent-prompt').value,
            gatewayTarget: document.getElementById('tool-gateway-target').value,
            gatewayTarget: document.getElementById('tool-gateway-target').value,
            category: (document.getElementById('tool-category-select').value === '__NEW__')
                ? document.getElementById('tool-category-custom').value.trim()
                : document.getElementById('tool-category-select').value
        };

        const response = await fetch('/api/tools', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(toolDef)
        });

        if (response.ok) {
            showToast('Tool saved successfully', 'success');
            loadTools(); // Refresh list
            document.getElementById('tool-editor').classList.add('hidden');
            document.getElementById('tool-list-container').classList.remove('hidden');
        } else {
            const data = await response.json();
            showToast(`Error: ${data.message}`, 'error');
        }
    } catch (e) {
        showToast('Invalid Schema JSON', 'error');
    }
}

async function deleteTool() {
    if (!editingToolName) return;

    if (!confirm(`Are you sure you want to delete ${editingToolName}?`)) return;

    try {
        const response = await fetch(`/api/tools/${editingToolName}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            showToast('Tool deleted', 'success');
            loadTools();
            document.getElementById('tool-editor').classList.add('hidden');
            document.getElementById('tool-list-container').classList.remove('hidden');
        } else {
            showToast('Failed to delete tool', 'error');
        }
    } catch (e) {
        showToast('Network error', 'error');
    }
}

// --- Gateway Integration ---

async function openGatewayImporter() {
    const modal = document.getElementById('gateway-modal');
    modal.classList.remove('hidden');

    const list = document.getElementById('gateway-tool-list');
    list.innerHTML = '<div class="p-4 text-center">Loading Gateway tools...</div>';

    try {
        const response = await fetch('/api/gateway/tools');
        if (!response.ok) throw new Error('Failed to fetch from Gateway');

        const gatewayTools = await response.json();
        renderGatewayList(gatewayTools);
    } catch (e) {
        list.innerHTML = `<div class="p-4 text-center text-red-400">Error: ${e.message}</div>`;
    }
}

function closeGatewayModal() {
    document.getElementById('gateway-modal').classList.add('hidden');
}

function renderGatewayList(tools) {
    const list = document.getElementById('gateway-tool-list');
    list.innerHTML = '';

    if (!tools || tools.length === 0) {
        list.innerHTML = '<div class="p-4 text-center">No tools found on Gateway</div>';
        return;
    }

    tools.forEach(tool => {
        const item = document.createElement('div');
        item.className = 'p-2 border-b border-gray-600 hover:bg-gray-700 cursor-pointer flex items-center';

        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = 'gateway_tool';
        radio.value = tool.name; // This is the gateway target name
        radio.className = 'mr-3';
        radio.dataset.desc = tool.description || '';
        item.appendChild(radio);

        const info = document.createElement('div');
        info.innerHTML = `
            <div class="font-bold text-sm">${tool.name}</div>
            <div class="text-xs text-gray-400">${tool.description || ''}</div>
        `;
        item.appendChild(info);

        item.addEventListener('click', () => {
            radio.checked = true;
        });

        list.appendChild(item);
    });
}

function importFromGateway() {
    const selected = document.querySelector('input[name="gateway_tool"]:checked');
    if (!selected) {
        showToast('Please select a tool to import', 'error');
        return;
    }

    const gatewayTargetName = selected.value;
    const description = selected.dataset.desc;

    // Transform Gateway Name (e.g., get-Balance___get_Balance -> get_balance)
    let suggestedName = gatewayTargetName;
    if (suggestedName.includes('___')) {
        suggestedName = suggestedName.split('___')[1];
    }
    suggestedName = suggestedName.toLowerCase().replace(/-/g, '_');

    // Switch to creation mode
    openNewTool();

    // Pre-fill fields
    document.getElementById('tool-name').value = suggestedName;
    document.getElementById('tool-gateway-target').value = gatewayTargetName;
    document.getElementById('tool-description').value = description;

    closeGatewayModal();
    showToast(`Imported ${gatewayTargetName}. Review and save.`, 'success');
}

// --- Visual Editor Logic ---

function switchEditorMode(mode) {
    const visualEditor = document.getElementById('schema-visual-editor');
    const jsonEditor = document.getElementById('schema-json-editor');
    const visualBtn = document.getElementById('mode-visual-btn');
    const jsonBtn = document.getElementById('mode-json-btn');

    if (mode === 'visual') {
        // Sync JSON -> Visual
        try {
            const schema = JSON.parse(document.getElementById('tool-schema').value);
            renderVisualEditor(schema);
            visualEditor.classList.remove('hidden');
            jsonEditor.classList.add('hidden');

            visualBtn.classList.remove('bg-gray-700', 'text-gray-400');
            visualBtn.classList.add('bg-blue-600', 'text-white');
            jsonBtn.classList.remove('bg-blue-600', 'text-white');
            jsonBtn.classList.add('text-gray-400'); // removed bg-gray-700 to match HTML structure, simpler reset

        } catch (e) {
            showToast('Invalid JSON - cannot switch to Visual', 'error');
        }
    } else {
        // Sync Visual -> JSON
        syncVisualToJson();

        visualEditor.classList.add('hidden');
        jsonEditor.classList.remove('hidden');

        jsonBtn.classList.remove('text-gray-400');
        jsonBtn.classList.add('bg-blue-600', 'text-white');
        visualBtn.classList.remove('bg-blue-600', 'text-white');
        visualBtn.classList.add('text-gray-400');
    }
}

function renderVisualEditor(schema) {
    const list = document.getElementById('param-list');
    list.innerHTML = '';

    const props = schema.properties || {};
    const required = schema.required || [];

    // If empty
    if (Object.keys(props).length === 0) {
        // list.innerHTML = '<div class="text-xs text-gray-500 italic">No parameters defined.</div>';
    }

    for (const [key, value] of Object.entries(props)) {
        addVisualParamUI(key, value, required.includes(key));
    }
}

function addVisualParam() {
    addVisualParamUI('', { type: 'string', description: '' }, false);
}

function addVisualParamUI(name = '', def = {}, isRequired = false) {
    const list = document.getElementById('param-list');
    const row = document.createElement('div');
    row.className = 'param-row flex space-x-2 items-start bg-gray-800/50 p-2 rounded border border-gray-700';

    row.innerHTML = `
        <div class="flex-1">
            <input type="text" class="param-name w-full bg-gray-900 border border-gray-600 rounded text-xs p-1 text-white placeholder-gray-500 mb-1" placeholder="Param Name" value="${name}">
            <select class="param-type w-full bg-gray-900 border border-gray-600 rounded text-xs p-1 text-gray-300">
                <option value="string" ${def.type === 'string' ? 'selected' : ''}>String</option>
                <option value="number" ${def.type === 'number' ? 'selected' : ''}>Number</option>
                <option value="boolean" ${def.type === 'boolean' ? 'selected' : ''}>Boolean</option>
            </select>
        </div>
        <div class="flex-[2]">
            <input type="text" class="param-desc w-full bg-gray-900 border border-gray-600 rounded text-xs p-1 text-white placeholder-gray-500 mb-1" placeholder="Description" value="${def.description || ''}">
            <label class="flex items-center text-xs text-gray-400">
                <input type="checkbox" class="param-required mr-1" ${isRequired ? 'checked' : ''}> Required
            </label>
        </div>
        <button class="remove-param-text text-red-500 hover:text-red-300 p-1">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
        </button>
    `;

    row.querySelector('.remove-param-text').addEventListener('click', () => row.remove());
    list.appendChild(row);
}

function syncVisualToJson() {
    const rows = document.querySelectorAll('.param-row');
    const properties = {};
    const required = [];

    rows.forEach(row => {
        const name = row.querySelector('.param-name').value.trim();
        if (!name) return; // skip empty names

        const type = row.querySelector('.param-type').value;
        const description = row.querySelector('.param-desc').value;
        const isReq = row.querySelector('.param-required').checked;

        properties[name] = {
            type: type,
            description: description
        };

        if (isReq) {
            required.push(name);
        }
    });

    const schema = {
        type: "object",
        properties: properties,
        required: required
    };

    document.getElementById('tool-schema').value = JSON.stringify(schema, null, 2);
}

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `fixed bottom-4 right-4 px-4 py-2 rounded shadow-lg text-white ${type === 'error' ? 'bg-red-600' : 'bg-green-600'} transition-opacity duration-300`;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}
