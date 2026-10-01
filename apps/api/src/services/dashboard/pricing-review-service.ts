import { db } from '../../lib/db';

export interface PricingReviewItem {
    id: string;
    packageId: string;
    recommendedPrice: number;
    costFloor: number;
    targetPrice: number;
    currency: string;
    status: string;
    reasoning?: string;
    assumptions?: string;
    createdAt?: Date;
}

export class PricingReviewService {
    async getPendingReviews(): Promise<PricingReviewItem[]> {
        const recommendations = await db.pricing_recommendations.findMany({
            where: {
                status: 'GENERATED'
            },
            orderBy: {
                created_at: 'desc'
            }
        });

        return recommendations.map((item: any) => ({
            id: item.id,
            packageId: item.package_id,
            recommendedPrice: Number(item.recommended_price),
            costFloor: Number(item.cost_floor),
            targetPrice: Number(item.target_price),
            currency: item.currency,
            status: item.status,
            reasoning: item.reasoning,
            assumptions: item.assumptions,
            createdAt: item.created_at
        }));
    }
}

export const pricingReviewService = new PricingReviewService();
