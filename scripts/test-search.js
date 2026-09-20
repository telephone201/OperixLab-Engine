const fs = require('fs').promises;

async function search(query) {
    const index = JSON.parse(await fs.readFile('D:/OperixLabs Engine/workflow-library/index.json', 'utf8'));
    const results = index.filter(wf => {
        const searchStr = (wf.name + ' ' + wf.description + ' ' + wf.integrations + ' ' + wf.triggers).toLowerCase();
        return searchStr.includes(query.toLowerCase());
    });
    return results;
}

async function runTests() {
    const testQueries = [
        'Lead qualification CRM',
        'Webhook CRM',
        'Email automation',
        'Marketing automation',
        'Customer support',
        'AI content'
    ];

    for (const query of testQueries) {
        const res = await search(query);
        console.log('Query: ' + query);
        console.log('Results: ' + res.length);
        if (res.length > 0) {
            console.log('Top Result: ' + res[0].name + ' | Integrations: ' + res[0].integrations);
        }
        console.log('---');
    }
}

runTests();
