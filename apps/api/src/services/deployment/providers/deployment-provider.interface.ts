/**
 * @file deployment-provider.interface.ts
 * @description Interface for workflow deployment providers.
 */

import { DeploymentEnvironment } from '../types';

export interface IDeploymentProvider {
    /**
     * Retrieves a workflow from the target execution engine.
     */
    getWorkflow(id: string): Promise<{ id: string, name: string, nodes: any[], connections: any[], active: boolean }>;

    /**
     * Creates a new workflow in the target execution engine.
     */
    createWorkflow(name: string, content: any): Promise<{ id: string }>;

    /**
     * Updates an existing workflow in the target execution engine.
     */
    updateWorkflow(id: string, content: any): Promise<{ id: string }>;

    /**
     * Activates the workflow (enables triggers).
     */
    activateWorkflow(id: string): Promise<void>;

    /**
     * Deactivates the workflow.
     */
    deactivateWorkflow(id: string): Promise<void>;

    /**
     * Checks the current status/health of the workflow.
     */
    getWorkflowStatus(id: string): Promise<{ status: string, active: boolean }>;
}
