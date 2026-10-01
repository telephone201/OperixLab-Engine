/**
 * @file workflow-evidence-extractor.ts
 * @description Extracts deterministic, observed evidence from n8n workflow JSON.
 * This layer does not infer business meaning.
 */

export interface WorkflowNodeEvidence {
    nodeId: string;
    nodeName: string;
    nodeType: string;
    parameters: Record<string, unknown>;
    credentials: string[];
    expressions: string[];
}

export interface WorkflowTriggerEvidence {
    nodeId: string;
    nodeName: string;
    nodeType: string;
    triggerType: string;
    parameters: Record<string, unknown>;
    httpMethod?: string;
    path?: string;
}

export interface WorkflowOutputEvidence {
    nodeId: string;
    nodeName: string;
    nodeType: string;
    parameters: Record<string, unknown>;
    expressions: string[];
}

export interface WorkflowEvidence {
    workflowName: string;
    workflowId: string | null;
    nodeCount: number;
    nodes: WorkflowNodeEvidence[];
    triggers: WorkflowTriggerEvidence[];
    outputs: WorkflowOutputEvidence[];
    integrations: string[];
    expressions: string[];
    credentialNames: string[];
}

export class WorkflowEvidenceExtractor {
    extract(workflowJson: unknown): WorkflowEvidence {
        if (!workflowJson || typeof workflowJson !== 'object') {
            throw new Error('Invalid workflow JSON provided for evidence extraction');
        }

        const data = workflowJson as Record<string, unknown>;
        const rawNodes = Array.isArray(data.nodes) ? data.nodes : [];

        const nodes: WorkflowNodeEvidence[] = [];
        const triggers: WorkflowTriggerEvidence[] = [];
        const integrations = new Set<string>();
        const allExpressions = new Set<string>();
        const credentialNames = new Set<string>();

        for (const rawNode of rawNodes) {
            if (!rawNode || typeof rawNode !== 'object') {
                continue;
            }

            const node = rawNode as Record<string, unknown>;
            const nodeId = String(node.id ?? '');
            const nodeName = String(node.name ?? '');
            const nodeType = String(node.type ?? '');

            const parameters =
                node.parameters && typeof node.parameters === 'object'
                    ? node.parameters as Record<string, unknown>
                    : {};

            const credentials = this.extractCredentials(node.credentials);
            const expressions = this.extractExpressions(parameters);

            credentials.forEach(name => credentialNames.add(name));
            expressions.forEach(expression => allExpressions.add(expression));

            const integration = this.mapIntegration(nodeType);
            if (integration) {
                integrations.add(integration);
            }

            nodes.push({
                nodeId,
                nodeName,
                nodeType,
                parameters,
                credentials,
                expressions
            });

            const trigger = this.extractTrigger(
                nodeId,
                nodeName,
                nodeType,
                parameters
            );

            if (trigger) {
                triggers.push(trigger);
            }
        }

        const nodesWithOutgoingConnections = this.extractNodesWithOutgoingConnections(data.connections);

        const outputs: WorkflowOutputEvidence[] = nodes
            .filter(node => !nodesWithOutgoingConnections.has(node.nodeName))
            .map(node => ({
                nodeId: node.nodeId,
                nodeName: node.nodeName,
                nodeType: node.nodeType,
                parameters: node.parameters,
                expressions: node.expressions
            }));

        return {
            workflowName: String(data.name ?? ''),
            workflowId: data.id == null ? null : String(data.id),
            nodeCount: nodes.length,
            nodes,
            triggers,
            outputs,
            integrations: [...integrations],
            expressions: [...allExpressions],
            credentialNames: [...credentialNames]
        };
    }

    private extractNodesWithOutgoingConnections(value: unknown): Set<string> {
        const sources = new Set<string>();

        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            return sources;
        }

        for (const [sourceNode, sourceConnections] of Object.entries(
            value as Record<string, unknown>
        )) {
            if (!sourceConnections || typeof sourceConnections !== 'object') {
                continue;
            }

            let hasConnection = false;

            for (const outputBranches of Object.values(
                sourceConnections as Record<string, unknown>
            )) {
                if (!Array.isArray(outputBranches)) {
                    continue;
                }

                for (const branch of outputBranches) {
                    if (Array.isArray(branch) && branch.length > 0) {
                        hasConnection = true;
                        break;
                    }
                }

                if (hasConnection) {
                    break;
                }
            }

            if (hasConnection) {
                sources.add(sourceNode);
            }
        }

        return sources;
    }

    private extractCredentials(value: unknown): string[] {
        if (!value || typeof value !== 'object') {
            return [];
        }

        const credentials = value as Record<string, unknown>;
        const names: string[] = [];

        for (const credential of Object.values(credentials)) {
            if (!credential || typeof credential !== 'object') {
                continue;
            }

            const item = credential as Record<string, unknown>;

            if (typeof item.name === 'string' && item.name.trim()) {
                names.push(item.name.trim());
            }
        }

        return [...new Set(names)];
    }

    private extractExpressions(value: unknown): string[] {
        const expressions = new Set<string>();

        const visit = (current: unknown): void => {
            if (typeof current === 'string') {
                const templatedMatches = current.match(/\{\{[\s\S]*?\}\}/g) ?? [];

                for (const template of templatedMatches) {
                    const innerReferences =
                        template.match(
                            /\$(?:json|binary)(?:\.[A-Za-z_][A-Za-z0-9_]*|\[[^\]]+\])+/g
                        ) ?? [];

                    if (innerReferences.length > 0) {
                        innerReferences.forEach(reference => expressions.add(reference));
                    } else {
                        expressions.add(template);
                    }
                }

                const directReferences =
                    current.match(
                        /\$(?:json|binary)(?:\.[A-Za-z_][A-Za-z0-9_]*|\[[^\]]+\])+/g
                    ) ?? [];

                directReferences.forEach(reference => expressions.add(reference));

                return;
            }

            if (Array.isArray(current)) {
                current.forEach(visit);
                return;
            }

            if (current && typeof current === 'object') {
                Object.values(current as Record<string, unknown>).forEach(visit);
            }
        };

        visit(value);

        return [...expressions];
    }

    private extractTrigger(
        nodeId: string,
        nodeName: string,
        nodeType: string,
        parameters: Record<string, unknown>
    ): WorkflowTriggerEvidence | null {
        const normalizedType = nodeType.toLowerCase();

        if (
            normalizedType === 'n8n-nodes-base.webhook' ||
            normalizedType === 'n8n-nodes-base.cron' ||
            normalizedType === 'n8n-nodes-base.interval' ||
            normalizedType.includes('schedule') ||
            normalizedType.endsWith('trigger') ||
            normalizedType.includes('.trigger')
        ) {
            return {
                nodeId,
                nodeName,
                nodeType,
                triggerType: this.classifyTriggerType(nodeType),
                parameters,
                httpMethod: typeof parameters.httpMethod === 'string'
                    ? parameters.httpMethod
                    : undefined,
                path: typeof parameters.path === 'string'
                    ? parameters.path
                    : undefined
            };
        }

        return null;
    }

    private classifyTriggerType(nodeType: string): string {
        const normalizedType = nodeType.toLowerCase();

        if (
            normalizedType === 'n8n-nodes-base.webhook' ||
            normalizedType.includes('webhook')
        ) {
            return 'Webhook';
        }

        if (normalizedType.includes('googledrivetrigger')) {
            return 'Google Drive';
        }

        if (
            normalizedType.includes('schedule') ||
            normalizedType.includes('cron') ||
            normalizedType.includes('interval')
        ) {
            return 'Schedule';
        }

        if (normalizedType.includes('manual')) {
            return 'Manual';
        }

        if (normalizedType.includes('error')) {
            return 'Error';
        }

        return 'Event';
    }

    private mapIntegration(nodeType: string): string | null {
        const integrationMap: Record<string, string> = {
            'n8n-nodes-base.webhook': 'Webhook',
            'n8n-nodes-base.googleSheets': 'Google Sheets',
            'n8n-nodes-base.googleDrive': 'Google Drive',
            'n8n-nodes-base.gmail': 'Gmail',
            'n8n-nodes-base.slack': 'Slack',
            'n8n-nodes-base.httpRequest': 'HTTP Request',
            'n8n-nodes-base.cron': 'Cron/Schedule',
            'n8n-nodes-base.scheduleTrigger': 'Schedule',
            'n8n-nodes-base.openai': 'OpenAI',
            'n8n-nodes-base.openAIApi': 'OpenAI',
            'n8n-nodes-base.postgres': 'PostgreSQL',
            'n8n-nodes-base.mysql': 'MySQL',
            'n8n-nodes-base.mongoDb': 'MongoDB',
            'n8n-nodes-base.hubspot': 'HubSpot',
            'n8n-nodes-base.notion': 'Notion',
            'n8n-nodes-base.airtable': 'Airtable',
            'n8n-nodes-base.elasticSearch': 'Elasticsearch',
            'n8n-nodes-base.smtp': 'SMTP'
        };

        return integrationMap[nodeType] ?? null;
    }
}

export const workflowEvidenceExtractor = new WorkflowEvidenceExtractor();






