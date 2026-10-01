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
    async calculateFingerprint(entity: any): Promise<string> {
        const fingerprint = {
            solutionVersionId: entity.solutionVersionId,
            requirementsVersionId: entity.requirementsVersionId,
            painAnalysisVersionId: entity.painAnalysisVersionId,
            qualificationVersionId: entity.qualificationVersionId,
            intentVersionId: entity.intentVersionId,
            demoId: entity.demoId,
            pricingVersionId: entity.pricingRecommendationId,
            offerVersionId: entity.offerOptionId,
        };

        return require('crypto')
            .createHash('sha256')
            .update(JSON.stringify(fingerprint))
            .digest('hex');
    }

    async evaluatePackageStaleness(packageId: string): Promise<StalenessResult> {
        const pkg = await db.commercial_packages.findUnique({
            where: { id: packageId }
        });

        if (!pkg) {
            throw new Error('COMMERCIAL_PACKAGE_NOT_FOUND');
        }

        const reasons: string[] = [];
        const changedDeps: string[] = [];

        const currentVersion = await db.workflow_versions.findUnique({
            where: { id: pkg.solution_version_id }
        });

        if (!currentVersion) {
            reasons.push('SOLUTION_VERSION_NOT_FOUND');
            changedDeps.push(`WorkflowVersion:${pkg.solution_version_id}`);
        } else {
            const latestFinalized = await db.workflow_versions.findFirst({
                where: {
                    solution_id: currentVersion.solution_id,
                    status: 'FINALIZED'
                },
                orderBy: {
                    version_number: 'desc'
                }
            });

            if (
                latestFinalized &&
                latestFinalized.id !== currentVersion.id
            ) {
                reasons.push('SOLUTION_VERSION_SUPERSEDED');
                changedDeps.push(`WorkflowVersion:${latestFinalized.id}`);
            }
        }

        const isStale = reasons.length > 0;

        return {
            isStale,
            checkedAt: new Date(),
            reasons,
            changedDependencies: changedDeps,
            severity: isStale ? 'HIGH' : 'LOW',
            recommendedAction: isStale
                ? 'REGENERATE_COMMERCIAL_PACKAGE'
                : 'NO_ACTION'
        };
    }

    async evaluateProposalStaleness(proposalVersionId: string): Promise<StalenessResult> {
        const version = await db.proposal_versions.findUnique({
            where: { id: proposalVersionId }
        });

        if (!version) {
            throw new Error('PROPOSAL_VERSION_NOT_FOUND');
        }

        const reasons: string[] = [];
        const changedDeps: string[] = [];

        const currentVersion = await db.workflow_versions.findUnique({
            where: { id: version.solution_version_id }
        });

        if (!currentVersion) {
            reasons.push('SOLUTION_VERSION_NOT_FOUND');
            changedDeps.push(`WorkflowVersion:${version.solution_version_id}`);
        } else {
            const latestFinalized = await db.workflow_versions.findFirst({
                where: {
                    solution_id: currentVersion.solution_id,
                    status: 'FINALIZED'
                },
                orderBy: {
                    version_number: 'desc'
                }
            });

            if (
                latestFinalized &&
                latestFinalized.id !== currentVersion.id
            ) {
                reasons.push('SOLUTION_VERSION_SUPERSEDED');
                changedDeps.push(`WorkflowVersion:${latestFinalized.id}`);
            }
        }

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
            recommendedAction: isStale
                ? 'REGENERATE_PROPOSAL'
                : 'NO_ACTION'
        };
    }
}

export const commercialStalenessService = new CommercialStalenessService();
