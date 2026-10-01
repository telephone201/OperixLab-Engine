import { db } from '../../lib/db';

export interface ProposalReviewItem {
    id: string;
    packageId: string;
    version: number;
    status: string;
    createdAt?: Date;
    updatedAt?: Date;
}

export class ProposalReviewService {
    async getPendingReviews(): Promise<ProposalReviewItem[]> {
        const proposals = await db.proposals.findMany({
            where: {
                status: 'GENERATED'
            },
            orderBy: {
                created_at: 'desc'
            }
        });

        return proposals.map((item: any) => ({
            id: item.id,
            packageId: item.package_id,
            version: Number(item.version),
            status: item.status,
            createdAt: item.created_at,
            updatedAt: item.updated_at
        }));
    }
}

export const proposalReviewService = new ProposalReviewService();
