import dotenv from 'dotenv';
dotenv.config({ path: 'D:/OperixLabs Engine/config/.env' });

import crypto from 'crypto';
import { Client } from 'pg';

async function main() {
    const { scopeManager } = await import('../src/services/projects/scope-manager');
    const { ChangeRequestType } = await import('../src/services/projects/scope-types');

    const admin = new Client({ connectionString: process.env.DATABASE_URL });
    await admin.connect();

    const suffix = Date.now().toString();

    const projectA = crypto.randomUUID();
    const projectB = crypto.randomUUID();
    const confirmationId = crypto.randomUUID();
    const draftConfirmationId = crypto.randomUUID();
    const confirmedBaselineId = crypto.randomUUID();
    const draftBaselineId = crypto.randomUUID();
    const userId = crypto.randomUUID();

    try {
        const solutionVersionId = crypto.randomUUID();
        const deliveryPlanVersionId = crypto.randomUUID();
        const solutionArchitectureId = crypto.randomUUID();
        const requirementsVersionId = crypto.randomUUID();

        await admin.query(
            `INSERT INTO projects
                (id, name, status, payment_status, created_at)
             VALUES
                ($1, $2, 'ACCEPTED', 'VERIFIED', NOW()),
                ($3, $4, 'ACCEPTED', 'VERIFIED', NOW())`,
            [
                projectA,
                `CR Baseline Validation A ${suffix}`,
                projectB,
                `CR Baseline Validation B ${suffix}`
            ]
        );

        await admin.query(
            `INSERT INTO requirements_confirmations
                (id, project_id, solution_architecture_id,
                 solution_version_id, requirements_version_id,
                 delivery_plan_version_id, confirmation_version,
                 status, created_by, created_at, updated_at)
             VALUES
                ($1,$2,$3,$4,$5,$6,1,'CONFIRMED',$7,NOW(),NOW())`,
            [
                confirmationId,
                projectA,
                solutionArchitectureId,
                solutionVersionId,
                requirementsVersionId,
                deliveryPlanVersionId,
                userId
            ]
        );

        await admin.query(
            `INSERT INTO requirements_confirmations
                (id, project_id, solution_architecture_id,
                 solution_version_id, requirements_version_id,
                 delivery_plan_version_id, confirmation_version,
                 status, created_by, created_at, updated_at)
             VALUES
                ($1,$2,$3,$4,$5,$6,1,'DRAFT',$7,NOW(),NOW())`,
            [
                draftConfirmationId,
                projectA,
                solutionArchitectureId,
                solutionVersionId,
                requirementsVersionId,
                deliveryPlanVersionId,
                userId
            ]
        );

        await admin.query(
            `INSERT INTO scope_baselines
                (id, project_id, confirmation_id,
                 solution_version_id, delivery_plan_version_id,
                 version, status, created_by,
                 confirmed_by, confirmed_at, created_at, updated_at)
             VALUES
                ($1,$2,$3,$4,$5,1,'CONFIRMED',$6,$6,NOW(),NOW(),NOW()),
                ($7,$2,$8,$4,$5,2,'DRAFT',$6,NULL,NULL,NOW(),NOW())`,
            [
                confirmedBaselineId,
                projectA,
                confirmationId,
                solutionVersionId,
                deliveryPlanVersionId,
                userId,
                draftBaselineId,
                draftConfirmationId
            ]
        );

        const baseParams = {
            requestedBy: userId,
            title: 'Baseline validation test',
            description: 'Test change request',
            reason: 'Validation',
            classification: ChangeRequestType.REQUIREMENT_CHANGE
        };

        const success = await scopeManager.createChangeRequest({
            ...baseParams,
            projectId: projectA,
            scopeBaselineId: confirmedBaselineId
        });

        console.log(
            'VALID_CONFIRMED_BASELINE=PASSED',
            success.changeRequestId
        );

        let mismatchMessage = '';

        try {
            await scopeManager.createChangeRequest({
                ...baseParams,
                projectId: projectB,
                scopeBaselineId: confirmedBaselineId
            });
        } catch (error) {
            mismatchMessage = String((error as Error)?.message || error);
        }

        console.log('MISMATCH_RESULT=', mismatchMessage);

        if (mismatchMessage !== 'SCOPE_BASELINE_PROJECT_MISMATCH') {
            throw new Error('SCOPE_BASELINE_PROJECT_VALIDATION_FAILED');
        }

        let draftMessage = '';

        try {
            await scopeManager.createChangeRequest({
                ...baseParams,
                projectId: projectA,
                scopeBaselineId: draftBaselineId
            });
        } catch (error) {
            draftMessage = String((error as Error)?.message || error);
        }

        console.log('DRAFT_RESULT=', draftMessage);

        if (draftMessage !== 'SCOPE_BASELINE_NOT_CONFIRMED') {
            throw new Error('SCOPE_BASELINE_STATUS_VALIDATION_FAILED');
        }

        console.log('CHANGE_REQUEST_BASELINE_VALIDATION=PASSED');
    } finally {
        await admin.query(
            `DELETE FROM projects
             WHERE id IN ($1, $2)`,
            [projectA, projectB]
        ).catch(() => {});

        await admin.end();
    }
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});