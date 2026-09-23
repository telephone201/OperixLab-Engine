import dotenv from 'dotenv';
dotenv.config({ path: 'D:/OperixLabs Engine/config/.env' });

import crypto from 'crypto';
import { Client } from 'pg';

async function main() {
    const { scopeManager } = await import('../src/services/projects/scope-manager');

    const admin = new Client({ connectionString: process.env.DATABASE_URL });
    await admin.connect();

    const suffix = Date.now().toString();
    let projectId = '';
    let confirmationId = '';

    try {
        projectId = crypto.randomUUID();
        confirmationId = crypto.randomUUID();

        const solutionVersionId = crypto.randomUUID();
        const deliveryPlanVersionId = crypto.randomUUID();
        const solutionArchitectureId = crypto.randomUUID();
        const requirementsVersionId = crypto.randomUUID();
        const userId = crypto.randomUUID();
        const requirementId = crypto.randomUUID();

        await admin.query(
            `INSERT INTO projects
                (id, name, status, payment_status, created_at)
             VALUES ($1, $2, 'ACCEPTED', 'VERIFIED', NOW())`,
            [projectId, `Scope Snapshot Confirm Test ${suffix}`]
        );

        await admin.query(
            `INSERT INTO requirements_confirmations
                (id, project_id, solution_architecture_id,
                 solution_version_id, requirements_version_id,
                 delivery_plan_version_id, confirmation_version,
                 status, created_by, created_at, updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,1,'DRAFT',$7,NOW(),NOW())`,
            [
                confirmationId,
                projectId,
                solutionArchitectureId,
                solutionVersionId,
                requirementsVersionId,
                deliveryPlanVersionId,
                userId
            ]
        );

        const snapshotItems = [{
            requirementId,
            classification: 'INCLUDED' as any,
            priority: 'HIGH',
            reason: 'Snapshot concurrency test'
        }];

        const results = await Promise.allSettled([
            scopeManager.snapshotRequirements(
                confirmationId,
                userId,
                snapshotItems
            ),
            scopeManager.confirmScope(
                confirmationId,
                userId
            )
        ]);

        const fulfilled = results.filter(
            r => r.status === 'fulfilled'
        ).length;

        const rejected = results.filter(
            r => r.status === 'rejected'
        ).length;

        const rejectionMessages = results
            .filter(
                (r): r is PromiseRejectedResult =>
                    r.status === 'rejected'
            )
            .map(
                r => String(
                    r.reason?.message || r.reason
                )
            );

        const baselineResult = await admin.query(
            `SELECT COUNT(*)::int AS count
             FROM scope_baselines
             WHERE confirmation_id = $1`,
            [confirmationId]
        );

        const confirmationItemsResult = await admin.query(
            `SELECT COUNT(*)::int AS count
             FROM requirements_confirmation_items
             WHERE confirmation_id = $1`,
            [confirmationId]
        );

        const scopeItemsResult = await admin.query(
            `SELECT COUNT(*)::int AS count
             FROM scope_items
             WHERE scope_baseline_id IN (
                 SELECT id
                 FROM scope_baselines
                 WHERE confirmation_id = $1
             )`,
            [confirmationId]
        );

        const confirmationResult = await admin.query(
            `SELECT status
             FROM requirements_confirmations
             WHERE id = $1`,
            [confirmationId]
        );

        const baselineCount =
            baselineResult.rows[0]?.count ?? 0;

        const confirmationItemCount =
            confirmationItemsResult.rows[0]?.count ?? 0;

        const scopeItemCount =
            scopeItemsResult.rows[0]?.count ?? 0;

        const finalStatus =
            confirmationResult.rows[0]?.status;

        const validRejection =
            rejectionMessages.length === 0 ||
            rejectionMessages.every(
                message =>
                    message ===
                    'INVALID_CONFIRMATION_STATUS_FOR_SNAPSHOT'
            );

        console.log(JSON.stringify({
            fulfilled,
            rejected,
            rejectionMessages,
            baselineCount,
            confirmationItemCount,
            scopeItemCount,
            finalStatus
        }, null, 2));

            const validOutcome =
                (fulfilled === 2 && rejected === 0) ||
                (fulfilled === 1 && rejected === 1 && validRejection);

            if (
                !validOutcome ||
                baselineCount !== 1 ||
                confirmationItemCount !== 1 ||
                scopeItemCount !== 1 ||
                finalStatus !== 'CONFIRMED'
            ) {
                throw new Error(
                    'SCOPE_SNAPSHOT_CONFIRM_CONCURRENCY_FAILED'
                );
            }
        console.log(
            'SCOPE_SNAPSHOT_CONFIRM_CONCURRENCY=PASSED'
        );
    } finally {
        await admin.query(
            `DELETE FROM projects WHERE id = $1`,
            [projectId]
        ).catch(() => {});

        await admin.end();
    }
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
