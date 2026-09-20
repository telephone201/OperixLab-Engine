/**
 * @file phase-11-step-1-verify.ts
 * @description Verification suite for Phase 11 Step 1: Commercial Foundation.
 */

import { commercialFoundationService } from './commercial-foundation-service';
import { CommercialPackageStatus, PricingStatus, OfferStatus, BillingCycle } from './commercial-types';
import { db } from '../../lib/db';

export class Phase11Step1Verify {
    async runTests() {
        console.log('[VERIFY] Starting Phase 11 Step 1 Commercial Foundation Verification...');
        const results = [];

        try {
            const userId = 'user_admin_123';
            const leadId = 'lead_test_123';
            const companyId = 'comp_test_123';
            const contactId = 'cont_test_123';
            const solArchId = 'solarch_123';
            const solVerId = 'solver_123';

            // --- TEST 1: Commercial Package Creation & Idempotency ---
            const pkg1 = await commercialFoundationService.createCommercialPackage({
                leadId, companyId, contactId, solutionArchitectureId: solArchId, solutionVersionId: solVerId, userId
            });

            const pkg2 = await commercialFoundationService.createCommercialPackage({
                leadId, companyId, contactId, solutionArchitectureId: solArchId, solutionVersionId: solVerId, userId
            });

            if (pkg1.commercialPackageId === pkg2.commercialPackageId) {
                results.push({ test: 'Package Idempotency', status: 'PASS' });
            } else {
                results.push({ test: 'Package Idempotency', status: 'FAIL' });
            }

            // --- TEST 2: Pricing Recommendation Creation ---
            const pricing = await commercialFoundationService.createPricingRecommendation({
                commercialPackageId: pkg1.commercialPackageId,
                solutionArchitectureId: solArchId,
                solutionVersionId: solVerId,
                recommendedPrice: 5000,
                costFloor: 3000,
                targetPrice: 4500,
                userId
            });

            if (pricing.recommendedPrice === 5000 && pricing.status === PricingStatus.GENERATED) {
                results.push({ test: 'Pricing Recommendation Creation', status: 'PASS' });
            } else {
                results.push({ test: 'Pricing Recommendation Creation', status: 'FAIL' });
            }

            // --- TEST 3: Offer Option Creation ---
            const offer = await commercialFoundationService.createOfferOption({
                commercialPackageId: pkg1.commercialPackageId,
                name: 'Premium Offer',
                setupFee: 2000,
                recurringFee: 500,
                userId,
                billingCycle: BillingCycle.MONTHLY,
                includedScope: ['req_1', 'req_2'],
                optionalScope: ['req_3'],
                outOfScope: ['req_4']
            });

            if (offer.name === 'Premium Offer' && offer.setupFee === 2000) {
                results.push({ test: 'Offer Option Creation', status: 'PASS' });
            } else {
                results.push({ test: 'Offer Option Creation', status: 'FAIL' });
            }

            // --- TEST 4: Source Version Traceability ---
            if (pkg1.solutionVersionId === solVerId && pkg1.solutionArchitectureId === solArchId) {
                results.push({ test: 'Source Version Traceability', status: 'PASS' });
            } else {
                results.push({ test: 'Source Version Traceability', status: 'FAIL' });
            }

            // --- TEST 5: Database Integrity ---
            const dbPkg = await db.commercial_packages.findUnique({ where: { id: pkg1.commercialPackageId } });
            if (dbPkg && dbPkg.status === CommercialPackageStatus.DRAFT) {
                results.push({ test: 'Database Persistence', status: 'PASS' });
            } else {
                results.push({ test: 'Database Persistence', status: 'FAIL' });
            }

        } catch (e) {
            console.error('[VERIFY] Suite failed:', e);
        }

        return results;
    }
}

export const phase11Step1Verify = new Phase11Step1Verify();
