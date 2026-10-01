/**
 * @file workflow-structure-inspector.ts
 * @description Read-only utility to analyze n8n workflow JSON structures.
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
    inspect(workflowJson: any): WorkflowStructure {
        if (!workflowJson || typeof workflowJson !== 'object') {
            throw new Error('Invalid workflow JSON provided for inspection');
        }

        const nodes: WorkflowNode[] = [];
        const connections: WorkflowConnection[] = [];
        const triggerNodes: string[] = [];
        const outputNodes: string[] = [];

        // n8n stores nodes as an array.
        const nodesData = Array.isArray(workflowJson.nodes)
            ? workflowJson.nodes
            : [];

        for (const nodeData of nodesData) {
            if (!nodeData || typeof nodeData !== 'object') continue;

            const node: WorkflowNode = {
                id: String(nodeData.id || nodeData.name || `node_${nodes.length}`),
                type: String(nodeData.type || 'unknown'),
                name: String(nodeData.name || nodeData.id || `node_${nodes.length}`),
                position: nodeData.position || { x: 0, y: 0 },
                parameters: nodeData.parameters || {}
            };

            nodes.push(node);
        }

        // n8n stores connections as:
        // {
        //   "Source Node": {
        //     "main": [
        //       [{ "node": "Target Node", "type": "main", "index": 0 }]
        //     ]
        //   }
        // }
        const connectionsData = workflowJson.connections;

        if (connectionsData && typeof connectionsData === 'object' && !Array.isArray(connectionsData)) {
            for (const [sourceNode, sourceConnections] of Object.entries(connectionsData as Record<string, any>)) {
                if (!sourceConnections || typeof sourceConnections !== 'object') continue;

                for (const [outputType, outputBranches] of Object.entries(sourceConnections as Record<string, any>)) {
                    if (!Array.isArray(outputBranches)) continue;

                    outputBranches.forEach((branch: any, branchIndex: number) => {
                        if (!Array.isArray(branch)) return;

                        branch.forEach((connection: any) => {
                            if (!connection || typeof connection !== 'object') return;
                            if (!connection.node) return;

                            connections.push({
                                sourceNode,
                                targetNode: String(connection.node),
                                sourceOutput: `${outputType}:${branchIndex}`,
                                targetInput: String(connection.type || outputType)
                            });
                        });
                    });
                }
            }
        }

        // Identify nodes that receive no incoming connections.
        const targetNodeNames = new Set(connections.map(c => c.targetNode));

        nodes.forEach(node => {
            if (!targetNodeNames.has(node.name)) {
                triggerNodes.push(node.id);
            }
        });

        // Identify nodes that produce no outgoing connections.
        const sourceNodeNames = new Set(connections.map(c => c.sourceNode));

        nodes.forEach(node => {
            if (!sourceNodeNames.has(node.name)) {
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

    findPrimaryTrigger(structure: WorkflowStructure): string | null {
        if (structure.triggerNodes.length === 0) return null;
        return structure.triggerNodes[0];
    }

    findNode(structure: WorkflowStructure, identifier: string): WorkflowNode | null {
        return structure.nodes.find(
            n => n.id === identifier || n.name === identifier
        ) || null;
    }
}

export const workflowStructureInspector = new WorkflowStructureInspector();
