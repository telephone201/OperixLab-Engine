const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

async function getFilesRecursive(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const files = await Promise.all(entries.map(async (entry) => {
        const res = path.resolve(dir, entry.name);
        return entry.isDirectory() ? getFilesRecursive(res) : (entry.name.endsWith('.json') ? res : []);
    }));
    return files.flat();
}

async function runInventory() {
    const sourcePath = 'D:/OperixLabs Engine/workflow-library/source';
    console.log('Scanning path:', sourcePath);
    
    try {
        const files = await getFilesRecursive(sourcePath);
        console.log('Total JSON files found:', files.length);
        
        const inventory = [];
        for (const file of files) {
            try {
                const content = await fs.readFile(file, 'utf8');
                const hash = crypto.createHash('sha256').update(content).digest('hex');
                const stats = await fs.stat(file);
                
                let isValidJson = false;
                let nodeCount = 0;
                let workflowName = '';

                try {
                    const json = JSON.parse(content);
                    isValidJson = true;
                    nodeCount = json.nodes?.length || 0;
                    workflowName = json.name || path.basename(file, '.json');
                } catch (e) {
                    isValidJson = false;
                }

                inventory.push({
                    filePath: file,
                    fileName: path.basename(file),
                    hash,
                    size: stats.size,
                    isValidJson,
                    nodeCount,
                    workflowName
                });
            } catch (e) {
                console.error('Error processing file ' + file + ':', e);
            }
        }

        const canonical = new Map();
        const duplicates = [];

        for (const item of inventory) {
            if (!canonical.has(item.hash)) {
                canonical.set(item.hash, item);
            } else {
                duplicates.push({
                    file: item.filePath,
                    duplicateOf: canonical.get(item.hash).filePath,
                    hash: item.hash
                });
            }
        }

        const finalInventory = Array.from(canonical.values());
        
        let report = '# WORKFLOW LIBRARY INVENTORY REPORT\n\n';
        report += '## Summary\n';
        report += '- Total Files Discovered: ' + files.length + '\n';
        report += '- Valid Workflows: ' + finalInventory.filter(i => i.isValidJson).length + '\n';
        report += '- Invalid JSONs: ' + inventory.filter(i => !i.isValidJson).length + '\n';
        report += '- Unique Workflows (Canonical): ' + finalInventory.length + '\n';
        report += '- Duplicates Detected: ' + duplicates.length + '\n\n';

        report += '## Canonical Inventory\n\n';
        report += '| Name | Hash | Nodes | Size | Status |\n';
        report += '| :--- | :--- | :--- | :--- | :--- |\n';
        
        finalInventory.forEach(i => {
            report += '| ' + i.workflowName + ' | ' + i.hash.substring(0,8) + '... | ' + i.nodeCount + ' | ' + i.size + ' | ' + (i.isValidJson ? 'VALID' : 'INVALID') + ' |\n';
        });

        report += '\n## Duplicate Analysis\n\n';
        report += '| File | Duplicate Of | Hash |\n';
        report += '| :--- | :--- | :--- |\n';
        duplicates.forEach(d => {
            report += '| ' + d.file + ' | ' + d.duplicateOf + ' | ' + d.hash.substring(0,8) + '... |\n';
        });

        await fs.writeFile('D:/OperixLabs Engine/docs/WORKFLOW_LIBRARY_INVENTORY_REPORT.md', report);
        await fs.writeFile('D:/OperixLabs Engine/workflow-library/inventory.json', JSON.stringify({
            canonical: finalInventory,
            duplicates: duplicates
        }, null, 2));

        console.log('Inventory complete. Report generated at D:/OperixLabs Engine/docs/WORKFLOW_LIBRARY_INVENTORY_REPORT.md');
    } catch (e) {
        console.error('Inventory failed:', e);
    }
}

runInventory();
