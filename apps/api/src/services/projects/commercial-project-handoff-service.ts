/**
 * @file commercial-project-handoff-service.ts
 * @description Bridges the Phase 11 commercial flow into the Phase 10 project execution model.
 *
 * The handoff creates the Phase 10 execution Contract and Project only after
 * payment readiness has reached VERIFIED.
 */

import { db } from '../../lib/db';
import { PaymentReadinessStatus } from './payment-types';
import { PaymentStatus, ProjectStatus } from './types';
import { auditLogger } from '../../core/logging/audit-logger';

export interface CommercialProjectHandoffResult {
    contractId: string;
    projectId: string;
    proposalId: string;
    status: 'CREATED' | 'ALREADY_EXISTS';
}

export class CommercialProjectHandoffService {
    /**
     * Creates the Phase 10 execution contract/project after payment readiness
     * has reached VERIFIED.
     *
     * The operation is idempotent:
     * - An existing Contract for the Proposal is reused.
     * - An existing Project for the Contract is reused.
     */
    async handoff(params: {
        proposalId: string;
        readinessStatus: PaymentReadinessStatus;
        actorId: string;
    }): Promise<CommercialProjectHandoffResult> {
        if (params.readinessStatus !== PaymentReadinessStatus.VERIFIED) {
            throw new Error(
                `PROJECT_HANDOFF_BLOCKED: Payment readiness is ${params.readinessStatus}, must be VERIFIED.`
            );
        }

        const proposalResult = await db.query(
            `SELECT *
             FROM "proposals"
             WHERE "id" = $1
             LIMIT 1`,
            [params.proposalId]
        );

        const proposal = proposalResult.rows[0];

        if (!proposal) {
            throw new Error('PROJECT_HANDOFF_BLOCKED: Proposal not found.');
        }

        const proposalVersionResult = await db.query(
            `SELECT *
             FROM "proposal_versions"
             WHERE "proposal_id" = $1
             ORDER BY "version_number" DESC
             LIMIT 1`,
            [params.proposalId]
        );

        const proposalVersion = proposalVersionResult.rows[0];

        if (!proposalVersion) {
            throw new Error(
                'PROJECT_HANDOFF_BLOCKED: Proposal version not found.'
            );
        }

        const agreementResult = await db.query(
            `SELECT *
             FROM "commercial_agreements"
             WHERE "proposal_version_id" = $1
             ORDER BY "created_at" DESC
             LIMIT 1`,
            [proposalVersion.id]
        );

        const agreement = agreementResult.rows[0];

        if (!agreement) {
            throw new Error(
                'PROJECT_HANDOFF_BLOCKED: Commercial agreement not found.'
            );
        }

        if (agreement.status !== 'ACCEPTED') {
            throw new Error(
                `PROJECT_HANDOFF_BLOCKED: Commercial agreement status is ${agreement.status}, must be ACCEPTED.`
            );
        }

        const offerResult = await db.query(
            `SELECT *
             FROM "offer_options"
             WHERE "id" = $1
             LIMIT 1`,
            [agreement.offer_id]
        );

        const offer = offerResult.rows[0];
        if (!offer) {
            throw new Error(
                'PROJECT_HANDOFF_BLOCKED: Accepted offer option not found.'
            );
        }

        return await db.$transaction(async (tx) => {
            const existingContractResult = await tx.query(
                `SELECT *
                 FROM "contracts"
                 WHERE "proposal_id" = $1
                 ORDER BY "created_at" DESC
                 LIMIT 1`,
                [params.proposalId]
            );

            let contract = existingContractResult.rows[0];
            let contractCreated = false;
            let projectCreated = false;

            if (!contract) {
                const scope = [
                    ...(offer.included_scope || []),
                    ...(offer.optional_scope || [])
                ].join('\n');

                const contractResult = await tx.query(
                    `INSERT INTO "contracts"
                        ("proposal_id",
                         "commercial_model",
                         "payment_terms",
                         "minimum_commitment",
                         "scope",
                         "support_terms",
                         "status",
                         "created_at")
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                     RETURNING *`,
                    [
                        params.proposalId,
                        offer.billing_cycle,
                        offer.payment_terms,
                        offer.minimum_commitment_months,
                        scope,
                        offer.support_terms,
                        'ACTIVE',
                        new Date()
                    ]
                );

                contract = contractResult.rows[0];
                contractCreated = true;
            }

            const existingProjectResult = await tx.query(
                `SELECT *
                 FROM "projects"
                 WHERE "contract_id" = $1
                 ORDER BY "created_at" DESC
                 LIMIT 1`,
                [contract.id]
            );

            let project = existingProjectResult.rows[0];

            if (!project) {
                const projectResult = await tx.query(
                    `INSERT INTO "projects"
                        ("contract_id",
                         "name",
                         "status",
                         "payment_status",
                         "payment_verified_at",
                         "created_at")
                     VALUES ($1, $2, $3, $4, $5, $6)
                     RETURNING *`,
                    [
                        contract.id,
                        offer.name || 'Operix Project',
                        ProjectStatus.PENDING,
                        PaymentStatus.VERIFIED,
                        new Date(),
                        new Date()
                    ]
                );

                project = projectResult.rows[0];
                projectCreated = true;
            } else if (project.payment_status !== PaymentStatus.VERIFIED) {
                const projectResult = await tx.query(
                    `UPDATE "projects"
                     SET "payment_status" = $1,
                         "payment_verified_at" = $2
                     WHERE "id" = $3
                     RETURNING *`,
                    [
                        PaymentStatus.VERIFIED,
                        new Date(),
                        project.id
                    ]
                );

                project = projectResult.rows[0];
            }

            return {
                contractId: contract.id,
                projectId: project.id,
                proposalId: params.proposalId,
                status: contractCreated || projectCreated ? 'CREATED' : 'ALREADY_EXISTS'
            };
        });
    }
}


export const commercialProjectHandoffService =
    new CommercialProjectHandoffService();




