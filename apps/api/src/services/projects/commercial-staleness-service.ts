/**
 * @file commercial-staleness-service.ts
 * @description Detects if a commercial artifact has become stale due to upstream dependency changes.
 */

import { db } from '../../lib/db';


export interface StalenessResult {
    isStale: boolean;
    checkedAt: Date;
    reasons: string[];
    changedDependencies: string[];
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    recommendedAction: string;
}

export class CommercialStalenessService {
    /**
     * Generates a deterministic dependency fingerprint for a commercial artifact.
     */
    async calculateFingerprint(entity: any): Promise<string> {
        const fingerprint = {
            solutionVersionId: entity.solutionVersionId,
            requirementsVersionId: entity.requirementsVersionId,
            painAnalysisVersionId: entity.painAnalysisVersionId,
            qualificationVersionId: entity.qualificationVersionId,
            intentVersionId: entity.intentVersionId,
            demoId: entity.demoId,
            // For proposals, we also track pricing and offer versions
            pricingVersionId: (entity as any).pricingRecommendationId,
            offerVersionId: (entity as any).offerOptionId,
        };

        return require('crypto').createHash('sha256').update(JSON.stringify(fingerprint)).digest('hex');
    }

    /**
     * Evaluates if a commercial package is stale relative to the latest approved upstream versions.
     */
    async evaluatePackageStaleness(packageId: string): Promise<StalenessResult> {
        const pkg = await db.commercial_packages.findUnique({ where: { id: packageId } });
        if (!pkg) throw new Error('COMMERCIAL_PACKAGE_NOT_FOUND');

        const reasons: string[] = [];
        const changedDeps: string[] = [];

        // In a real implementation, we would compare pkg.solution_version_id against
        // the latest finalized version in the workflow_versions table.

        // Mocking a check for this foundation step
        const isStale = false;

        return {
            isStale,
            checkedAt: new Date(),
            reasons,
            changedDependencies: changedDeps,
            severity: 'LOW',
            recommendedAction: isStale ? 'REGENERATE_COMMERCIAL_PACKAGE' : 'NO_ACTION'
        };
    }

    /**
     * Evaluates if a proposal version is stale.
     */
    async evaluateProposalStaleness(proposalVersionId: string): Promise<StalenessResult> {
        const version = await db.proposal_versions.findUnique({ where: { id: proposalVersionId } });
        if (!version) throw new Error('PROPOSAL_VERSION_NOT_FOUND');

        const reasons: string[] = [];
        const changedDeps: string[] = [];

        // Check if the referenced PricingRecommendation has been superseded
        const pricing = await db.pricing_recommendations.findUnique({
            where: { id: version.pricing_recommendation_id }
        });

        if (pricing && pricing.status === 'SUPERSEDED') {
            reasons.push('PRICING_SUPERSEDED');
            changedDeps.push(`PricingRecommendation:${pricing.id}`);
        }

        const isStale = reasons.length > 0;

        return {
            isStale,
            checkedAt: new Date(),
            reasons,
            changedDependencies: changedDeps,
            severity: isStale ? 'HIGH' : 'LOW',
            recommendedAction: isStale ? 'REGENERATE_PROPOSAL' : 'NO_ACTION'
        };
    }
}

export const commercialStalenessService = new CommercialStalenessService();

