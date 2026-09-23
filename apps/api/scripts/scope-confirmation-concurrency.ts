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
            [projectId, `Scope Concurrency Test ${suffix}`]
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

        await admin.query(
            `INSERT INTO requirements_confirmation_items
                (id, confirmation_id, requirement_id,
                 classification, priority, reason, created_at)
             VALUES ($1,$2,$3,'INCLUDED','HIGH','Concurrency test',NOW())`,
            [crypto.randomUUID(), confirmationId, requirementId]
        );

        const results = await Promise.allSettled([
            scopeManager.confirmScope(confirmationId, userId),
            scopeManager.confirmScope(confirmationId, userId)
        ]);

        const fulfilled = results.filter(r => r.status === 'fulfilled').length;
        const rejected = results.filter(r => r.status === 'rejected').length;
        const rejectionMessages = results
            .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
            .map(r => String(r.reason?.message || r.reason));

        const baselineResult = await admin.query(
            `SELECT COUNT(*)::int AS count
             FROM scope_baselines
             WHERE confirmation_id = $1`,
            [confirmationId]
        );

        const itemResult = await admin.query(
            `SELECT COUNT(*)::int AS count
             FROM scope_items
             WHERE scope_baseline_id IN (
                 SELECT id FROM scope_baselines WHERE confirmation_id = $1
             )`,
            [confirmationId]
        );

        const confirmationResult = await admin.query(
            `SELECT status FROM requirements_confirmations WHERE id = $1`,
            [confirmationId]
        );

        const baselineCount = baselineResult.rows[0].count;
        const itemCount = itemResult.rows[0].count;
        const finalStatus = confirmationResult.rows[0]?.status;

        console.log(JSON.stringify({
            fulfilled,
            rejected,
            rejectionMessages,
            baselineCount,
            itemCount,
            finalStatus
        }, null, 2));

        if (
            fulfilled !== 1 ||
            rejected !== 1 ||
            baselineCount !== 1 ||
            itemCount !== 1 ||
            finalStatus !== 'CONFIRMED'
        ) {
            throw new Error('SCOPE_CONFIRMATION_CONCURRENCY_FAILED');
        }

        console.log('SCOPE_CONFIRMATION_CONCURRENCY=PASSED');
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