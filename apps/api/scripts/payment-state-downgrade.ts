import { Pool } from "pg";

async function run() {
    const dotenv = await import("dotenv");
    dotenv.config({ path: "D:/OperixLabs Engine/config/.env" });

    const originalDatabaseUrl = process.env.DATABASE_URL;
    if (!originalDatabaseUrl) throw new Error("DATABASE_URL is not configured");

    const adminPool = new Pool({
        connectionString: originalDatabaseUrl.replace(/\/([^\/]+)$/, "/postgres"),
    });

    const testDbName = "operix_payment_state_test_" + Date.now();
    let testPool: Pool | undefined;

    try {
        console.log(`[TEST] Creating isolated database: ${testDbName}...`);
        await adminPool.query(`CREATE DATABASE ${testDbName}`);

        const testDbUrl = originalDatabaseUrl.replace(
            /\/([^\/]+)$/,
            "/" + testDbName
        );

        testPool = new Pool({ connectionString: testDbUrl });

        const migrationsDir = "D:/OperixLabs Engine/apps/api/migrations";
        const fs = await import("fs");
        const path = await import("path");

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
                "PAYMENT_STATE_TEST",
                JSON.stringify({ test: true })
            ]
        );

        await testPool.query(
            `INSERT INTO workflow_versions
                (id, solution_id, version_number, content_hash, origin_type)
             VALUES ($1, $2, $3, $4, $5)`,
            [
                workflowVersionId,
                solutionArchitectureId,
                1,
                "payment-state-test",
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
                (id, commercial_package_id, status, version, created_by)
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
             VALUES ($1, $2, $3, $4, $5, $6, 'ACCEPTED', 'payment-state-test')`,
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
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
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

        console.log("[TEST] Step 1: verify payment completely...");

        await paymentVerificationService.verifyPayment({
            paymentId,
            verifiedAmount: 5000,
            verifiedBy: verifierA,
            decision: "VERIFY",
            reason: "Initial full verification"
        });

        const verifiedState = await testPool.query(
            `SELECT status, verified_amount, verified_by
             FROM payments
             WHERE id = $1`,
            [paymentId]
        );

        console.log("[TEST] State after VERIFY:");
        console.log(JSON.stringify(verifiedState.rows[0], null, 2));

        console.log("[TEST] Step 2: attempt downgrade to PARTIAL...");

        let rejected = false;
        let rejectionMessage = "";

        try {
            await paymentVerificationService.verifyPayment({
                paymentId,
                verifiedAmount: 2500,
                verifiedBy: verifierB,
                decision: "PARTIALLY_VERIFY",
                reason: "Attempted downgrade"
            });
        } catch (error) {
            rejected = true;
            rejectionMessage =
                error instanceof Error
                    ? error.message
                    : String(error);
        }

        const finalState = await testPool.query(
            `SELECT status, verified_amount, verified_by, rejection_reason
             FROM payments
             WHERE id = $1`,
            [paymentId]
        );

        console.log(JSON.stringify({
            rejected,
            rejectionMessage,
            finalPayment: finalState.rows[0]
        }, null, 2));

        if (!rejected) {
            throw new Error("PAYMENT_VERIFIED_DOWNGRADE_WAS_NOT_BLOCKED");
        }

        if (!rejectionMessage.includes("PAYMENT_STATE_CONFLICT")) {
            throw new Error(
                "PAYMENT_DOWNGRADE_WRONG_ERROR"
            );
        }

        if (
            finalState.rows[0]?.status !== "VERIFIED" ||
            Number(finalState.rows[0]?.verified_amount) !== 5000
        ) {
            throw new Error(
                "PAYMENT_VERIFIED_STATE_WAS_CHANGED"
            );
        }

        console.log("PAYMENT_VERIFIED_DOWNGRADE_GUARD=PASSED");
    } finally {
        if (testPool) {
            await testPool.end();
        }

        try {
            await adminPool.query(
                `SELECT pg_terminate_backend(pid)
                 FROM pg_stat_activity
                 WHERE datname = $1
                   AND pid <> pg_backend_pid()`,
                [testDbName]
            );

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