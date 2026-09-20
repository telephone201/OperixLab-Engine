/**
 * @file proposal-service.ts
 * @description Orchestrates proposal creation, versioning, and validation.
 */

import { db } from '../../lib/db';
import {
    Proposal,
    ProposalVersion,
    ProposalStatus,
    ProposalContent,
    ProposalGenerationInput,
    ProposalGenerationResult
} from './proposal-types';
import { proposalGenerator } from './proposal-generator';
import { commercialFoundationService } from './commercial-foundation-service';
import { auditLogger } from '../../core/logging/audit-logger';
import crypto from 'crypto';

export class ProposalService {
    /**
     * Initiates the proposal generation process.
     */
    async generateProposal(params: ProposalGenerationInput): Promise<ProposalGenerationResult> {
        // 1. Source Traceability Check
        const pkg = await commercialFoundationService.getCommercialPackage(params.commercialPackageId);

        // 2. Generate Structured Content
        const content = await proposalGenerator.generateProposalContent(params);

        // 3. Deterministic Validation
        this.validateProposalContent(content);

        // 4. Persist Proposal and Version
        return await db.$transaction(async (tx) => {
            const proposalId = `prop_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

            const proposalResult = await tx.query(
                `INSERT INTO "proposals"
                ("id", "commercial_package_id", "status", "version", "created_by", "created_at")
                VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING *`,
                [
                    proposalId,
                    params.commercialPackageId,
                    ProposalStatus.GENERATED,
                    1,
                    'system',
                    new Date()
                ]
            );

            const proposal = proposalResult.rows[0];

            const contentString = JSON.stringify(content);
            const contentHash = crypto.createHash('sha256').update(contentString).digest('hex');

            const proposalVersionId = `pv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

            const versionResult = await tx.query(
                `INSERT INTO "proposal_versions"
                ("id", "proposal_id", "version_number", "commercial_package_id",
                 "pricing_recommendation_id", "offer_option_id", "solution_version_id",
                 "requirements_version_id", "pain_analysis_version_id",
                 "qualification_version_id", "content", "content_hash",
                 "status", "created_by", "created_at")
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
                RETURNING *`,
                [
                    proposalVersionId,
                    proposalId,
                    1,
                    params.commercialPackageId,
                    params.pricingRecommendationId,
                    params.offerOptionId,
                    params.solutionVersionId,
                    params.requirementsVersionId,
                    params.painVersionId,
                    params.qualificationVersionId,
                    content,
                    contentHash,
                    ProposalStatus.GENERATED,
                    'system',
                    new Date()
                ]
            );

            const version = versionResult.rows[0];

            await auditLogger.log({
                action: 'PROPOSAL_GENERATED',
                entityType: 'Proposal',
                entityId: proposalId,
                details: { version: 1, hash: contentHash }
            });

            return {
                proposalId,
                proposalVersionId: version.id,
                status: ProposalStatus.GENERATED,
                content: content
            };
        });
    }

    /**
     * Validates that the proposal does not contain forbidden internal data.
     */
    private validateProposalContent(content: ProposalContent): void {
        const forbiddenPatterns = [
            /n8n/i,
            /workflow_id/i,
            /api_key/i,
            /secret/i,
            /internal_score/i,
            /database_id/i
        ];

        const contentString = JSON.stringify(content);
        for (const pattern of forbiddenPatterns) {
            if (pattern.test(contentString)) {
                throw new Error(`PROPOSAL_VALIDATION_FAILED: Forbidden content detected: ${pattern}`);
            }
        }
    }

    async getProposal(id: string): Promise<Proposal> {
        const prop = await db.proposals.findUnique({ where: { id } });
        if (!prop) throw new Error('PROPOSAL_NOT_FOUND');
        return this.mapToDomain(prop);
    }

    private mapToDomain(prop: any): Proposal {
        return {
            proposalId: prop.id,
            commercialPackageId: prop.commercial_package_id,
            status: prop.status as ProposalStatus,
            version: prop.version,
            createdAt: prop.created_at,
            updatedAt: prop.updated_at,
            createdBy: prop.created_by,
            validUntil: prop.valid_until
        };
    }
}

export const proposalService = new ProposalService();
