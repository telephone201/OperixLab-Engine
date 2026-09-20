/**
 * @file workflow-structure-inspector.ts
 * @description Read-only utility to analyze workflow JSON structures.
 * It extracts structural metadata without modifying the original content.
 */

export interface WorkflowNode {
    id: string;
    type: string;
    name: string;
    position: { x: number; y: number };
    parameters: any;
}

export interface WorkflowConnection {
    sourceNode: string;
    targetNode: string;
    sourceOutput: string;
    targetInput: string;
}

export interface WorkflowStructure {
    nodes: WorkflowNode[];
    connections: WorkflowConnection[];
    triggerNodes: string[];
    outputNodes: string[];
}

export class WorkflowStructureInspector {
    /**
     * Analyzes a workflow JSON object and extracts its structural components.
     */
    inspect(workflowJson: any): WorkflowStructure {
        if (!workflowJson || typeof workflowJson !== 'object') {
            throw new Error('Invalid workflow JSON provided for inspection');
        }

        const nodes: WorkflowNode[] = [];
        const connections: WorkflowConnection[] = [];
        const triggerNodes: string[] = [];
        const outputNodes: string[] = [];

        // 1. Extract Nodes
        // n8n workflows typically store nodes as an object where keys are node IDs
        const nodesData = workflowJson.nodes || {};
        for (const [id, nodeData] of Object.entries(nodesData)) {
            const node: WorkflowNode = {
                id,
                type: nodeData.type || 'unknown',
                name: nodeData.name || id,
                position: nodeData.position || { x: 0, y: 0 },
                parameters: nodeData.parameters || {}
            };
            nodes.push(node);

            // Identify triggers (simplified: nodes with no incoming connections are usually triggers)
            // This is refined later by checking actual node types
        }

        // 2. Extract Connections
        const connectionsData = workflowJson.connections || [];
        connectionsData.forEach((conn: any) => {
            connections.push({
                sourceNode: conn.source || 'unknown',
                targetNode: conn.target || 'unknown',
                sourceOutput: conn.main || 'main',
                targetInput: conn.main || 'main'
            });
        });

        // 3. Identify Trigger Nodes (Nodes that are not targets of any connection)
        const targetNodeIds = new Set(connections.map(c => c.targetNode));
        nodes.forEach(node => {
            if (!targetNodeIds.has(node.id)) {
                triggerNodes.push(node.id);
            }
        });

        // 4. Identify Output Nodes (Nodes that are not sources of any connection)
        const sourceNodeIds = new Set(connections.map(c => c.sourceNode));
        nodes.forEach(node => {
            if (!sourceNodeIds.has(node.id)) {
                outputNodes.push(node.id);
            }
        });

        return {
            nodes,
            connections,
            triggerNodes,
            outputNodes
        };
    }

    /**
     * Specifically identifies the trigger node for a workflow.
     */
    findPrimaryTrigger(structure: WorkflowStructure): string | null {
        if (structure.triggerNodes.length === 0) return null;
        // In most cases, the first trigger node is the primary one
        return structure.triggerNodes[0];
    }

    /**
     * Finds a node by its name or ID.
     */
    findNode(structure: WorkflowStructure, identifier: string): WorkflowNode | null {
        return structure.nodes.find(n => n.id === identifier || n.name === identifier) || null;
    }
}

export const workflowStructureInspector = new WorkflowStructureInspector();
