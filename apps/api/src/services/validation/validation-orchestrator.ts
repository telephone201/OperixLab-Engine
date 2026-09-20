/**
 * @file validation-orchestrator.ts
 * @description Orchestrates the six-layer validation process for workflow artifacts.
 */

import { db } from '../../lib/db';
import {
    ValidationStatus,
    ValidationLayer,
    ValidationReport,
    ValidationFinding,
    ValidationLayerResult,
    FindingSeverity
} from './validation-types';
import { structuralValidator } from './structural-validator';
import { dependencyValidator } from './dependency-validator';
import { dataValidator } from './data-validator';
import { securityValidator } from './security-validator';
import { businessValidator } from './business-validator';
import { operationalValidator } from './operational-validator';
import { workflowStructureInspector } from '../workflows/workflow-structure-inspector';
import { artifactService } from '../versioning/artifact-service';
import { auditLogger } from '../../core/logging/audit-logger';

export class ValidationOrchestrator {
    /**
     * Executes the full 6-layer validation suite for a specific workflow version.
     */
    async validateVersion(
        versionId: string,
        requirements: any[],
        solutionArchitecture: any,
        mappings: any[]
    ): Promise<ValidationReport> {
        console.log(`[VALIDATION] Starting orchestrator for version ${versionId}...`);

        // 1. Resolve Version and Artifact
        const version = await db.workflow_versions.findUnique({ where: { id: versionId } });
        if (!version) throw new Error(`Workflow version ${versionId} not found`);

        const contentBuffer = await artifactService.getArtifactContent(version.artifact_id);
        const workflowJson = JSON.parse(contentBuffer.toString());
        const structure = workflowStructureInspector.inspect(workflowJson);

        const validationId = `val_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const allFindings: ValidationFinding[] = [];
        const layerResults: Record<ValidationLayer, ValidationLayerResult> = {};

        // 2. Execute Layers in Order
        try {
            // Layer 1: Structural
            const structFindings = await structuralValidator.validate(workflowJson);
            layerResults[ValidationLayer.STRUCTURAL] = this.aggregateLayer(ValidationLayer.STRUCTURAL, structFindings);
            allFindings.push(...structFindings);

            if (this.hasCriticalBlocker(structFindings)) {
                return this.finalizeReport(validationId, version, ValidationStatus.BLOCKED, layerResults, allFindings, 'Structural failure blocked further analysis.');
            }

            // Layer 2: Dependency
            const depFindings = await dependencyValidator.validate(workflowJson, structure);
            layerResults[ValidationLayer.DEPENDENCY] = this.aggregateLayer(ValidationLayer.DEPENDENCY, depFindings);
            allFindings.push(...depFindings);

            // Layer 3: Data
            const dataFindings = await dataValidator.validate(workflowJson, structure, mappings);
            layerResults[ValidationLayer.DATA] = this.aggregateLayer(ValidationLayer.DATA, dataFindings);
            allFindings.push(...dataFindings);

            // Layer 4: Security
            const secFindings = await securityValidator.validate(workflowJson);
            layerResults[ValidationLayer.SECURITY] = this.aggregateLayer(ValidationLayer.SECURITY, secFindings);
            allFindings.push(...secFindings);

            // Layer 5: Business
            const busFindings = await businessValidator.validate(workflowJson, requirements, solutionArchitecture);
            layerResults[ValidationLayer.BUSINESS] = this.aggregateLayer(ValidationLayer.BUSINESS, busFindings);
            allFindings.push(...busFindings);

            // Layer 6: Operational
            const opsFindings = await operationalValidator.validate(workflowJson, structure);
            layerResults[ValidationLayer.OPERATIONAL] = this.aggregateLayer(ValidationLayer.OPERATIONAL, opsFindings);
            allFindings.push(...opsFindings);

        } catch (e: any) {
            return this.finalizeReport(validationId, version, ValidationStatus.BLOCKED, layerResults, allFindings, `Orchestration error: ${e.message}`);
        }

        // 3. Determine Global Status
        const status = this.determineOverallStatus(allFindings);
        return this.finalizeReport(validationId, version, status, layerResults, allFindings, 'Validation suite completed.');
    }

    private aggregateLayer(layer: ValidationLayer, findings: ValidationFinding[]): ValidationLayerResult {
        const hasFail = findings.some(f => f.severity === FindingSeverity.CRITICAL);
        const hasWarn = findings.some(f => f.severity === FindingSeverity.HIGH || f.severity === FindingSeverity.MEDIUM);

        return {
            layer,
            result: hasFail ? 'FAIL' : (hasWarn ? 'WARN' : 'PASS'),
            findings,
            logs: `Found ${findings.length} issues in ${layer} layer.`
        };
    }

    private hasCriticalBlocker(findings: ValidationFinding[]): boolean {
        return findings.some(f => f.severity === FindingSeverity.CRITICAL && f.blocking);
    }

    private determineOverallStatus(findings: ValidationFinding[]): ValidationStatus {
        if (findings.some(f => f.severity === FindingSeverity.CRITICAL)) {
            return ValidationStatus.FAILED;
        }
        if (findings.some(f => f.severity === FindingSeverity.HIGH || f.requiresReview)) {
            return ValidationStatus.REQUIRES_REVIEW;
        }
        return ValidationStatus.PASSED;
    }

    private async finalizeReport(
        valId: string,
        version: any,
        status: ValidationStatus,
        layerResults: any,
        findings: ValidationFinding[],
        summary: string
    ): Promise<ValidationReport> {
        const report: ValidationReport = {
            validationId: valId,
            workflowVersionId: version.id,
            artifactHash: version.content_hash,
            overallStatus: status,
            layerResults,
            allFindings: findings,
            blockingFindings: findings.filter(f => f.blocking),
            reviewRequiredFindings: findings.filter(f => f.requiresReview),
            summary
        };

        // Persist to Database
        await db.workflow_validations.create({
            data: {
                id: valId,
                workflow_version_id: version.id,
                artifact_hash: version.content_hash,
                status,
                overall_result: summary
            }
        });

        for (const finding of findings) {
            await db.validation_findings.create({
                data: {
                    validation_id: valId,
                    layer: finding.layer,
                    rule_id: finding.ruleId,
                    severity: finding.severity,
                    status: finding.status,
                    title: finding.title,
                    description: finding.description,
                    evidence: finding.evidence,
                    workflow_node_id: finding.workflowNodeId,
                    workflow_path: finding.workflowPath,
                    expected: finding.expected,
                    actual: finding.actual,
                    reasoning: finding.reasoning,
                    blocking: finding.blocking,
                    requires_review: finding.requiresReview
                }
            });
        }

        await auditLogger.log({
            action: `VALIDATION_${status}`,
            entityType: 'WorkflowVersion',
            entityId: version.id,
            details: { validationId: valId, summary }
        });

        return report;
    }
}

export const validationOrchestrator = new ValidationOrchestrator();

