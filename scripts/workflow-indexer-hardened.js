const fs = require('fs').promises;
const path = require('path');

async function runIndexer() {
    console.log('Hardening Workflow Indexing...');
    
    try {
        const inventoryData = JSON.parse(await fs.readFile('D:/OperixLabs Engine/workflow-library/inventory.json', 'utf8'));
        const canonical = inventoryData.canonical;
        
        const indexedWorkflows = [];

        for (const item of canonical) {
            try {
                const content = await fs.readFile(item.filePath, 'utf8');
                const data = JSON.parse(content);
                
                const nodes = data.nodes || [];
                const integrations = [];
                const triggers = [];
                
                // Improved Integration Mapping
                nodes.forEach(node => {
                    const type = node.type || '';
                    if (type.includes('gmail')) integrations.push('Gmail');
                    if (type.includes('googleSheets')) integrations.push('Google Sheets');
                    if (type.includes('googleDrive')) integrations.push('Google Drive');
                    if (type.includes('webhook')) {
                        integrations.push('Webhook');
                        triggers.push('Webhook');
                    }
                    if (type.includes('cron')) triggers.push('Schedule');
                    if (type.includes('hubspot')) integrations.push('HubSpot');
                    if (type.includes('slack')) integrations.push('Slack');
                    if (type.includes('openai')) integrations.push('AI');
                });

                // Better Description Extraction
                let description = 'Indexed workflow from library';
                if (data.description) {
                    description = data.description;
                } else if (data.name) {
                    description = 'Automation for ' + data.name;
                }

                let category = 'Other';
                if (integrations.includes('Gmail') || integrations.includes('Slack')) category = 'Communication';
                else if (integrations.includes('HubSpot')) category = 'CRM';
                else if (integrations.includes('Webhook')) category = 'Integrations';

                indexedWorkflows.push({
                    workflow_id: data.id || item.hash,
                    source_file: item.filePath,
                    source_hash: item.hash,
                    name: data.name || item.workflowName,
                    description: description,
                    category: category,
                    integrations: [...new Set(integrations)].join(', '),
                    triggers: [...new Set(triggers)].join(', '),
                    complexity: nodes.length,
                    quality_score: nodes.length > 0 ? 70 : 0,
                    status: 'INDEXED'
                });
            } catch (e) {
                console.error('Failed to index ' + item.filePath + ':', e);
            }
        }

        await fs.writeFile('D:/OperixLabs Engine/workflow-library/index.json', JSON.stringify(indexedWorkflows, null, 2));
        console.log('Hardened Indexing complete. Processed ' + indexedWorkflows.length + ' workflows.');
    } catch (e) {
        console.error('Indexing failed:', e);
    }
}

runIndexer();
