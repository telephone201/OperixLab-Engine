/**
 * @file semantic-analyzer.ts
 * @description Generates semantic metadata for workflows.
 * In Zero Cost Mode, this uses a local LLM (Ollama) or deterministic keywords.
 */

import { ParsedWorkflow } from './n8n-parser';
import { config } from '../../config/config-manager';

export interface WorkflowMetadata {
    purpose: string;
    summary: string;
    category: string;
    subcategory: string;
    industries: string[];
    useCases: string[];
    confidence: 'HIGH' | 'MEDIUM' | 'LOW';
    status: 'OBSERVED' | 'INFERRED' | 'UNKNOWN';
}

export class SemanticAnalyzer {
    // Simple keyword-based taxonomy for Zero Cost Mode
    private taxonomyMap: Record<string, { category: string; subcategory: string }> = {
        'Gmail': { category: 'Communication', subcategory: 'Email' },
        'HubSpot': { category: 'CRM', subcategory: 'Lead Management' },
        'OpenAI': { category: 'AI Automation', subcategory: 'Content Generation' },
        'Google Sheets': { category: 'Data Processing', subcategory: 'Spreadsheets' },
        'Webhook': { category: 'Integrations', subcategory: 'API' },
    };

    async analyze(workflow: ParsedWorkflow): Promise<WorkflowMetadata> {
        // In a real implementation, this would call Ollama via LLMProvider.
        // For now, we implement the deterministic fallback.

        const integrations = workflow.integrations;
        let detectedCategory = 'Other';
        let detectedSubcategory = 'General';

        for (const integration of integrations) {
            if (this.taxonomyMap[integration]) {
                detectedCategory = this.taxonomyMap[integration].category;
                detectedSubcategory = this.taxonomyMap[integration].subcategory;
                break;
            }
        }

        return {
            purpose: `Workflow using ${workflow.integrations.join(', ') || 'generic nodes'}`,
            summary: `Automates process with ${workflow.nodeCount} nodes.`,
            category: detectedCategory,
            subcategory: detectedSubcategory,
            industries: ['General'],
            useCases: ['Automation'],
            confidence: 'MEDIUM',
            status: 'INFERRED'
        };
    }
}
