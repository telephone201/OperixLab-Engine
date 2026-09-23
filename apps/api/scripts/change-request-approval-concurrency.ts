import crypto from 'crypto';
import { db } from '../src/lib/db';
import { scopeManager } from '../src/services/projects/scope-manager';
import { humanApprovalService } from '../src/services/governance/approval-service';
import { ApprovalType, ApprovalDecision } from '../src/services/governance/types';

async function main() {
    const ids = {
        contractId: crypto.randomUUID(),
        projectId: crypto.randomUUID(),
        confirmationId: crypto.randomUUID(),
        baselineId: crypto.randomUUID(),
        changeRequestId: crypto.randomUUID(),
        userId: crypto.randomUUID()
    };

    try {
        await db.query(`
            INSERT INTO contracts
                (id, commercial_model, payment_terms, minimum_commitment,
                 scope, support_terms, status, created_at)
            VALUES ($1, 'FIXED_FEE', 'TEST', 1,
                    'Concurrency test', 'TEST', 'ACCEPTED', NOW())
        `, [ids.contractId]);

        await db.query(`
            INSERT INTO projects
                (id, contract_id, status, payment_status, created_at)
            VALUES ($1, $2, 'READY_TO_START', 'VERIFIED', NOW())
        `, [ids.projectId, ids.contractId]);

        await db.query(`
            INSERT INTO requirements_confirmations
                (id, project_id, solution_architecture_id,
                 solution_version_id, requirements_version_id,
                 delivery_plan_version_id, confirmation_version,
                 status, created_by, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, 1,
                    'CONFIRMED', $7, NOW(), NOW())
        `, [
            ids.confirmationId,
            ids.projectId,
            crypto.randomUUID(),
            crypto.randomUUID(),
            crypto.randomUUID(),
            crypto.randomUUID(),
            ids.userId
        ]);

        await db.query(`
            INSERT INTO scope_baselines
                (id, project_id, confirmation_id,
                 solution_version_id, delivery_plan_version_id,
                 version, status, created_by, confirmed_by,
                 confirmed_at, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, 1,
                    'CONFIRMED', $6, $6, NOW(), NOW(), NOW())
        `, [
            ids.baselineId,
            ids.projectId,
            ids.confirmationId,
            crypto.randomUUID(),
            crypto.randomUUID(),
            ids.userId
        ]);

        await db.query(`
            INSERT INTO change_requests
                (id, project_id, scope_baseline_id, requested_by,
                 requested_at, title, description, reason,
                 classification, status, impact_status,
                 technical_impact, commercial_impact,
                 schedule_impact, risk_level, created_at, updated_at)
            VALUES ($1, $2, $3, $4, NOW(),
                    'Concurrency Test',
                    'Approval concurrency test',
                    'Test',
                    'SCOPE_ADDITION',
                    'IMPACT_ANALYZED',
                    'ANALYZED',
                    'LOW',
                    'LOW',
                    'LOW',
                    'LOW',
                    NOW(), NOW())
        `, [
            ids.changeRequestId,
            ids.projectId,
            ids.baselineId,
            ids.userId
        ]);

        const requestResults = await Promise.allSettled([
            scopeManager.requestChangeRequestApproval(
                ids.changeRequestId,
                ids.userId
            ),
            scopeManager.requestChangeRequestApproval(
                ids.changeRequestId,
                ids.userId
            )
        ]);

        const requestFulfilled = requestResults.filter(
            r => r.status === 'fulfilled'
        );

        const requestRejected = requestResults.filter(
            r => r.status === 'rejected'
        );

        const requestRejectionMessages = requestRejected.map(
            r => r.status === 'rejected'
                ? String(r.reason?.message ?? r.reason)
                : ''
        );

        const approvalResult = await db.query(`
            SELECT id, status, approval_type
            FROM governance_approvals
            WHERE entity_id = $1
              AND approval_type = $2
        `, [ids.changeRequestId, ApprovalType.CHANGE_REQUEST]);

        const crAfterRequest = await db.query(`
            SELECT status
            FROM change_requests
            WHERE id = $1
        `, [ids.changeRequestId]);

        const pendingCount = approvalResult.rows.filter(
            (row: { status: string }) =>
                row.status === ApprovalDecision.PENDING
        ).length;

        const requestOutput = {
            fulfilled: requestFulfilled.length,
            rejected: requestRejected.length,
            rejectionMessages: requestRejectionMessages,
            approvalCount: approvalResult.rowCount,
            pendingCount,
            finalStatus: crAfterRequest.rows[0]?.status ?? null
        };

        console.log('REQUEST_APPROVAL_CONCURRENCY');
        console.log(JSON.stringify(requestOutput, null, 2));

        if (
            requestFulfilled.length !== 1 ||
            requestRejected.length !== 1 ||
            pendingCount !== 1 ||
            approvalResult.rowCount !== 1 ||
            crAfterRequest.rows[0]?.status !== 'PENDING_APPROVAL'
        ) {
            throw new Error(
                `CHANGE_REQUEST_APPROVAL_CONCURRENCY_FAILED: ${JSON.stringify(requestOutput)}`
            );
        }

        const approvalId = requestFulfilled[0].status === 'fulfilled'
            ? requestFulfilled[0].value
            : null;

        if (!approvalId) {
            throw new Error('APPROVAL_ID_NOT_CREATED');
        }

        await humanApprovalService.submitDecision(
            approvalId,
            ApprovalDecision.APPROVED,
            ids.userId,
            'Approved for concurrency verification'
        );

        const approvedResults = await Promise.allSettled([
            scopeManager.approveChangeRequest(
                ids.changeRequestId,
                ids.userId,
                'Concurrency approval test'
            ),
            scopeManager.approveChangeRequest(
                ids.changeRequestId,
                ids.userId,
                'Concurrency approval test'
            )
        ]);

        const approvedFulfilled = approvedResults.filter(
            r => r.status === 'fulfilled'
        );

        const approvedRejected = approvedResults.filter(
            r => r.status === 'rejected'
        );

        const approvedRejectionMessages = approvedRejected.map(
            r => r.status === 'rejected'
                ? String(r.reason?.message ?? r.reason)
                : ''
        );

        const crAfterApproval = await db.query(`
            SELECT status, approved_by, approved_at
            FROM change_requests
            WHERE id = $1
        `, [ids.changeRequestId]);

        const finalApprovalResult = await db.query(`
            SELECT id, status, approval_type
            FROM governance_approvals
            WHERE entity_id = $1
              AND approval_type = $2
        `, [ids.changeRequestId, ApprovalType.CHANGE_REQUEST]);

        const approvedOutput = {
            fulfilled: approvedFulfilled.length,
            rejected: approvedRejected.length,
            rejectionMessages: approvedRejectionMessages,
            approvalCount: finalApprovalResult.rowCount,
            approvalStatus: finalApprovalResult.rows[0]?.status ?? null,
            finalStatus: crAfterApproval.rows[0]?.status ?? null,
            approvedByPresent: !!crAfterApproval.rows[0]?.approved_by,
            approvedAtPresent: !!crAfterApproval.rows[0]?.approved_at
        };

        console.log('CHANGE_REQUEST_APPROVE_CONCURRENCY');
        console.log(JSON.stringify(approvedOutput, null, 2));

        if (
            approvedFulfilled.length !== 1 ||
            approvedRejected.length !== 1 ||
            finalApprovalResult.rowCount !== 1 ||
            finalApprovalResult.rows[0]?.status !== ApprovalDecision.APPROVED ||
            crAfterApproval.rows[0]?.status !== 'APPROVED' ||
            !crAfterApproval.rows[0]?.approved_by ||
            !crAfterApproval.rows[0]?.approved_at
        ) {
            throw new Error(
                `CHANGE_REQUEST_APPROVE_CONCURRENCY_FAILED: ${JSON.stringify(approvedOutput)}`
            );
        }

        console.log('CHANGE_REQUEST_APPROVAL_CONCURRENCY=PASSED');
        console.log('CHANGE_REQUEST_APPROVE_CONCURRENCY=PASSED');
    } finally {
        await db.query(`
            DELETE FROM governance_approvals
            WHERE entity_id = $1
              AND approval_type = $2
        `, [ids.changeRequestId, ApprovalType.CHANGE_REQUEST]);

        await db.query(
            'DELETE FROM change_requests WHERE id = $1',
            [ids.changeRequestId]
        );

        await db.query(
            'DELETE FROM scope_baselines WHERE id = $1',
            [ids.baselineId]
        );

        await db.query(
            'DELETE FROM requirements_confirmations WHERE id = $1',
            [ids.confirmationId]
        );

        await db.query(
            'DELETE FROM projects WHERE id = $1',
            [ids.projectId]
        );

        await db.query(
            'DELETE FROM contracts WHERE id = $1',
            [ids.contractId]
        );
    }
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});