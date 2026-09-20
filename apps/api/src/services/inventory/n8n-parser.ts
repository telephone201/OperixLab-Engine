/**
 * @file n8n-parser.ts
 * @description Deterministic parser for n8n workflow JSONs.
 * Extracts structural intelligence for the Workflow Library.
 */

export interface ParsedWorkflow {
    id: string;
    name: string;
    sourceFile: string;
    hash: string;
    nodeCount: number;
    triggers: string[];
    inputs: string[];
    outputs: string[];
    integrations: string[];
    structure: {
        nodes: any[];
        connections: any[];
    };
    quality: {
        hasErrorHandling: boolean;
        hasLoops: boolean;
        isComplex: boolean;
    };
}

export class N8NParser {
    // Integration Mapping: Node Type -> Human Readable Name
    private integrationMap: Record<string, string> = {
        'n8n-nodes-base.webhook': 'Webhook',
        'n8n-nodes-base.googleSheets': 'Google Sheets',
        'n8n-nodes-base.googleDrive': 'Google Drive',
        'n8n-nodes-base.gmail': 'Gmail',
        'n8n-nodes-base.slack': 'Slack',
        'n8n-nodes-base.httpRequest': 'HTTP Request',
        'n8n-nodes-base.cron': 'Cron/Schedule',
        'n8n-nodes-base.openai': 'OpenAI',
        'n8n-nodes-base.httpRequest': 'API/Webhook',
        'n8n-nodes-base.postgres': 'PostgreSQL',
        'n8n-nodes-base.mysql': 'MySQL',
        'n8n-nodes-base.mongoDb': 'MongoDB',
        'n8n-nodes-base.hubspot': 'HubSpot',
        'n8n-nodes-base.notion': 'Notion',
        'n8n-nodes-base.airtable': 'Airtable',
    };

    parse(jsonContent: string, filePath: string, hash: string): ParsedWorkflow {
        const data = JSON.parse(jsonContent);
        const nodes = data.nodes || [];

        const triggers: string[] = [];
        const integrations: string[] = [];
        const inputs: string[] = [];
        const outputs: string[] = [];

        nodes.forEach((node: any) => {
            const type = node.type;
            const name = node.name;

            // Detect Integrations
            if (this.integrationMap[type]) {
                integrations.push(this.integrationMap[type]);
            }

            // Detect Triggers
            if (type === 'n8n-nodes-base.webhook' || type === 'n8n-nodes-base.cron' || type === 'n8n-nodes-base.interval') {
                triggers.push(type === 'n8n-nodes-base.webhook' ? 'Webhook' : 'Schedule');
            }

            // Heuristic for Inputs (nodes that receive data from outside)
            if (type === 'n8n-nodes-base.webhook' || type === 'n8n-nodes-base.form') {
                inputs.push('External Payload');
            }

            // Heuristic for Outputs (nodes that send data outside)
            if (type === 'n8n-nodes-base.gmail' || type === 'n8n-nodes-base.httpRequest' || type === 'n8n-nodes-base.slack') {
                outputs.push(this.integrationMap[type] || 'External API');
            }
        });

        return {
            id: data.id || crypto.randomUUID(),
            name: data.name || path.basename(filePath, '.json'),
            sourceFile: filePath,
            hash: hash,
            nodeCount: nodes.length,
            triggers: [...new Set(triggers)],
            inputs: [...new Set(inputs)],
            outputs: [...new Set(outputs)],
            integrations: [...new Set(integrations)],
            structure: {
                nodes: nodes,
                connections: data.connections || {}
            },
            quality: {
                hasErrorHandling: nodes.some((n: any) => n.onError === 'continue'),
                hasLoops: this.detectLoops(data.connections || {}),
                isComplex: nodes.length > 15
            }
        };
    }

    private detectLoops(connections: any): boolean {
        // Simplified loop detection for this phase
        return false; // Placeholder for full graph analysis
    }
}
