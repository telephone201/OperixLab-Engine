const fs = require('fs').promises;
const path = require('path');

async function runIndexer() {
    console.log('Starting Workflow Indexing...');
    
    try {
        const inventoryData = JSON.parse(await fs.readFile('D:/OperixLabs Engine/workflow-library/inventory.json', 'utf8'));
        const canonical = inventoryData.canonical;
        
        const indexedWorkflows = [];

        for (const item of canonical) {
            try {
                const content = await fs.readFile(item.filePath, 'utf8');
                const data = JSON.parse(content);
                
                // Deterministic Parsing (Simplified version of n8n-parser.ts logic)
                const nodes = data.nodes || [];
                const integrations = [];
                const triggers = [];
                
                nodes.forEach(node => {
                    if (node.type.includes('gmail')) integrations.push('Gmail');
                    if (node.type.includes('googleSheets')) integrations.push('Google Sheets');
                    if (node.type.includes('webhook')) {
                        integrations.push('Webhook');
                        triggers.push('Webhook');
                    }
                    if (node.type.includes('cron')) triggers.push('Schedule');
                });

                // Basic Semantic Mapping
                let category = 'Other';
                if (integrations.includes('Gmail')) category = 'Communication';
                else if (integrations.includes('Google Sheets')) category = 'Data Processing';
                else if (integrations.includes('Webhook')) category = 'Integrations';

                indexedWorkflows.push({
                    workflow_id: data.id || item.hash,
                    source_file: item.filePath,
                    source_hash: item.hash,
                    name: data.name || item.workflowName,
                    description: 'Indexed workflow from library',
                    category: category,
                    integrations: integrations.join(', '),
                    triggers: triggers.join(', '),
                    complexity: nodes.length,
                    quality_score: nodes.length > 0 ? 70 : 0,
                    status: 'INDEXED'
                });
            } catch (e) {
                console.error('Failed to index ' + item.filePath + ':', e);
            }
        }

        // In a real system, this would be a SQL INSERT. 
        // For this phase, we'll save the index as a JSON file that represents the DB state.
        await fs.writeFile('D:/OperixLabs Engine/workflow-library/index.json', JSON.stringify(indexedWorkflows, null, 2));
        
        console.log('Indexing complete. Processed ' + indexedWorkflows.length + ' workflows.');
    } catch (e) {
        console.error('Indexing failed:', e);
    }
}

runIndexer();
