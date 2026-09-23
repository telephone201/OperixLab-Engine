import { Pool } from "pg";
import fs from "fs";
import path from "path";

async function run() {
    const dotenv = await import("dotenv");
    dotenv.config({ path: "D:/OperixLabs Engine/config/.env" });

    const originalDatabaseUrl = process.env.DATABASE_URL;
    if (!originalDatabaseUrl) throw new Error("DATABASE_URL is not configured");

    const adminPool = new Pool({
        connectionString: originalDatabaseUrl.replace(/\/([^\/]+)$/, "/postgres"),
    });

    const testDbName = "operix_payment_verification_test_" + Date.now();
    let testPool: Pool | undefined;
    let closeDbPool: (() => Promise<void>) | undefined;

    try {
        console.log(`[TEST] Creating isolated database: ${testDbName}...`);
        await adminPool.query(`CREATE DATABASE ${testDbName}`);

        const testDbUrl = originalDatabaseUrl.replace(
            /\/([^\/]+)$/,
            "/" + testDbName
        );

        testPool = new Pool({ connectionString: testDbUrl });

        const migrationsDir = path.resolve(
            "D:/OperixLabs Engine/apps/api/migrations"
        );

        const files = fs.readdirSync(migrationsDir)
            .filter(f => f.endsWith(".sql"))
            .sort((a, b) =>
                a.localeCompare(b, undefined, {
                    numeric: true,
                    sensitivity: "base"
                })
            );

        for (const file of files) {
            const migration = fs.readFileSync(
                path.join(migrationsDir, file),
                "utf8"
            );

            await testPool.query("BEGIN");

            try {
                await testPool.query(migration);
                await testPool.query("COMMIT");
            } catch (error) {
                await testPool.query("ROLLBACK");
                throw new Error(
                    `Migration ${file} failed: ${
                        error instanceof Error
                            ? error.message
                            : String(error)
                    }`
                );
            }
        }

        console.log(`[TEST] Applied ${files.length} migrations.`);

        process.env.DATABASE_URL = testDbUrl;

        const { paymentVerificationService } =
            await import("../src/services/projects/payment-verification-service");

        ({ closeDbPool } = await import("../src/lib/db"));

        const commercialPackageId = "77777777-7777-7777-7777-777777777777";
        const solutionArchitectureId = "88888888-8888-8888-8888-888888888888";
        const workflowVersionId = "99999999-9999-9999-9999-999999999999";
        const proposalId = "33333333-3333-3333-3333-333333333333";
        const agreementId = "11111111-1111-1111-1111-111111111111";
        const paymentId = "22222222-2222-2222-2222-222222222222";
        const offerId = "44444444-4444-4444-4444-444444444444";

        const verifierA = "55555555-5555-5555-5555-555555555555";
        const verifierB = "66666666-6666-6666-6666-666666666666";

        const companyId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
        const contactId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
        const leadId = "cccccccc-cccc-cccc-cccc-cccccccccccc";
        const actorId = "dddddddd-dddd-dddd-dddd-dddddddddddd";

        await testPool.query(
            `INSERT INTO solution_architectures
                (id, lead_id, strategy, blueprint)
             VALUES ($1, $2, $3, $4)`,
            [
                solutionArchitectureId,
                leadId,
                "CONCURRENCY_TEST",
                JSON.stringify({ test: true })
            ]
        );

        await testPool.query(
            `INSERT INTO workflow_versions
                (
                    id,
                    solution_id,
                    version_number,
                    content_hash,
                    origin_type
                )
             VALUES ($1, $2, $3, $4, $5)`,
            [
                workflowVersionId,
                solutionArchitectureId,
                1,
                "payment-verification-test",
                "TEST"
            ]
        );

        await testPool.query(
            `INSERT INTO commercial_packages
                (
                    id,
                    lead_id,
                    company_id,
                    contact_id,
                    solution_architecture_id,
                    solution_version_id,
                    status,
                    currency,
                    created_by
                )
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [
                commercialPackageId,
                leadId,
                companyId,
                contactId,
                solutionArchitectureId,
                workflowVersionId,
                "READY_FOR_PRICING",
                "EGP",
                actorId
            ]
        );

        await testPool.query(
            `INSERT INTO proposals
                (
                    id,
                    commercial_package_id,
                    status,
                    version,
                    created_by
                )
             VALUES ($1, $2, $3, $4, $5)`,
            [
                proposalId,
                commercialPackageId,
                "ACCEPTED",
                1,
                actorId
            ]
        );

        await testPool.query(
            `INSERT INTO commercial_agreements
                (
                    id,
                    commercial_package_id,
                    offer_id,
                    proposal_version_id,
                    solution_version_id,
                    company_id,
                    status,
                    fingerprint
                )
             VALUES
                ($1, $2, $3, $4, $5, $6, 'ACCEPTED', 'payment-test')`,
            [
                agreementId,
                commercialPackageId,
                offerId,
                "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee",
                workflowVersionId,
                companyId
            ]
        );

        await testPool.query(
            `INSERT INTO payments
                (
                    id,
                    agreement_id,
                    proposal_id,
                    offer_id,
                    expected_amount,
                    verified_amount,
                    currency,
                    purpose,
                    status
                )
             VALUES
                ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [
                paymentId,
                agreementId,
                proposalId,
                offerId,
                5000,
                0,
                "EGP",
                "SETUP_FEE",
                "REQUIRED"
            ]
        );

        console.log("[TEST] Starting two concurrent verification requests...");

        const results = await Promise.allSettled([
            paymentVerificationService.verifyPayment({
                paymentId,
                verifiedAmount: 2500,
                verifiedBy: verifierA,
                decision: "PARTIALLY_VERIFY",
                reason: "Concurrent test A"
            }),
            paymentVerificationService.verifyPayment({
                paymentId,
                verifiedAmount: 5000,
                verifiedBy: verifierB,
                decision: "VERIFY",
                reason: "Concurrent test B"
            })
        ]);

        const fulfilled = results.filter(
            r => r.status === "fulfilled"
        ).length;

        const rejected = results.filter(
            r => r.status === "rejected"
        ).length;

        const rejectionMessages = results
            .filter(
                (r): r is PromiseRejectedResult =>
                    r.status === "rejected"
            )
            .map(r =>
                r.reason instanceof Error
                    ? r.reason.message
                    : String(r.reason)
            );

        const paymentResult = await testPool.query(
            `SELECT
                id,
                status,
                verified_amount,
                verified_by,
                rejection_reason
             FROM payments
             WHERE id = $1`,
            [paymentId]
        );

        console.log(JSON.stringify({
            fulfilled,
            rejected,
            rejectionMessages,
            payment: paymentResult.rows[0]
        }, null, 2));

        if (fulfilled !== 2 || rejected !== 0) {
            throw new Error(
                "PAYMENT_VERIFICATION_CONCURRENCY_EXECUTION_FAILED"
            );
        }

        if (
            paymentResult.rows[0]?.status !== "VERIFIED" ||
            Number(paymentResult.rows[0]?.verified_amount) !== 5000
        ) {
            throw new Error(
                "PAYMENT_VERIFICATION_FINAL_STATE_UNEXPECTED"
            );
        }

        console.log("PAYMENT_VERIFICATION_CONCURRENCY=PASSED");
    } finally {
        if (testPool) {
            await testPool.end();
        }
        if (closeDbPool) {
            await closeDbPool();
        }

        try {
await adminPool.query(
                `DROP DATABASE IF EXISTS "${testDbName}"`
            );

            console.log(`[TEST] Dropped isolated database: ${testDbName}`);
        } finally {
            await adminPool.end();
        }
    }
}

run().catch(error => {
    console.error(
        `[FAIL] ${
            error instanceof Error
                ? error.message
                : String(error)
        }`
    );
    process.exit(1);
});
