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

            const proposal = await tx.proposals.create({
                data: {
                    id: proposalId,
                    commercial_package_id: params.commercialPackageId,
                    status: ProposalStatus.GENERATED,
                    version: 1,
                    created_by: 'system', // In real impl, use userId
                    created_at: new Date()
                }
            });

            const contentString = JSON.stringify(content);
            const contentHash = crypto.createHash('sha256').update(contentString).digest('hex');

            const version = await tx.proposal_versions.create({
                data: {
                    id: `pv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    proposal_id: proposalId,
                    version_number: 1,
                    commercial_package_id: params.commercialPackageId,
                    pricing_recommendation_id: params.pricingRecommendationId,
                    offer_option_id: params.offerOptionId,
                    solution_version_id: params.solutionVersionId,
                    requirements_version_id: params.requirementsVersionId,
                    pain_analysis_version_id: params.painVersionId,
                    qualification_version_id: params.qualificationVersionId,
                    content: content,
                    content_hash: contentHash,
                    status: ProposalStatus.GENERATED,
                    created_by: 'system',
                    created_at: new Date()
                }
            });

            await auditLogger.log({
                action: 'PROPOSAL_GENERATED',
                entityType: 'Proposal',
                entityId: proposalId,
                details: { version: 1, hash: contentHash }
            });

            return {
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

