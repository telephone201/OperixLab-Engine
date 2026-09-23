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

    const testDbName = "operix_agreement_acceptance_test_" + Date.now();
    let testPool: Pool | undefined;
    let closeDbPool: (() => Promise<void>) | undefined;

    try {
        console.log(`[TEST] Creating isolated database: ${testDbName}...`);
        await adminPool.query(`CREATE DATABASE ${testDbName}`);

        const testDbUrl = originalDatabaseUrl.replace(/\/([^\/]+)$/, "/" + testDbName);
        testPool = new Pool({ connectionString: testDbUrl });

        const migrationsDir = path.resolve("D:/OperixLabs Engine/apps/api/migrations");
        const files = fs.readdirSync(migrationsDir)
            .filter(f => f.endsWith(".sql"))
            .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));

        for (const file of files) {
            const migration = fs.readFileSync(path.join(migrationsDir, file), "utf8");

            await testPool.query("BEGIN");
            try {
                await testPool.query(migration);
                await testPool.query("COMMIT");
            } catch (error) {
                await testPool.query("ROLLBACK");
                throw new Error(
                    `Migration ${file} failed: ${
                        error instanceof Error ? error.message : String(error)
                    }`
                );
            }
        }

        console.log(`[TEST] Applied ${files.length} migrations.`);

        process.env.DATABASE_URL = testDbUrl;

        const { agreementService } =
            await import("../src/services/projects/agreement-service");
        ({ closeDbPool } = await import("../src/lib/db"));

        const agreementId = "11111111-1111-1111-1111-111111111111";
        const actorA = "22222222-2222-2222-2222-222222222222";
        const actorB = "33333333-3333-3333-3333-333333333333";

        await testPool.query(
            `INSERT INTO commercial_agreements
                (id, commercial_package_id, offer_id, proposal_version_id,
                 solution_version_id, company_id, status, fingerprint)
             VALUES ($1, $2, $3, $4, $5, $6, 'READY_FOR_ACCEPTANCE', 'test-fingerprint')`,
            [
                agreementId,
                "44444444-4444-4444-4444-444444444444",
                "55555555-5555-5555-5555-555555555555",
                "66666666-6666-6666-6666-666666666666",
                "77777777-7777-7777-7777-777777777777",
                "88888888-8888-8888-8888-888888888888"
            ]
        );

        console.log("[TEST] Starting two concurrent acceptance requests...");

        const results = await Promise.allSettled([
            agreementService.recordAcceptance({
                agreementId,
                actorId: actorA,
                actorType: "CLIENT",
                evidence: "concurrent-test-A"
            }),
            agreementService.recordAcceptance({
                agreementId,
                actorId: actorB,
                actorType: "CLIENT",
                evidence: "concurrent-test-B"
            })
        ]);

        const fulfilled = results.filter(r => r.status === "fulfilled").length;
        const rejected = results.filter(r => r.status === "rejected").length;

        const rejectionMessages = results
            .filter((r): r is PromiseRejectedResult => r.status === "rejected")
            .map(r =>
                r.reason instanceof Error
                    ? r.reason.message
                    : String(r.reason)
            );

        const agreementResult = await testPool.query(
            `SELECT status, accepted_by
             FROM commercial_agreements
             WHERE id = $1`,
            [agreementId]
        );

        const acceptanceResult = await testPool.query(
            `SELECT COUNT(*)::int AS count
             FROM commercial_agreement_acceptances
             WHERE agreement_id = $1`,
            [agreementId]
        );

        console.log(JSON.stringify({
            fulfilled,
            rejected,
            rejectionMessages,
            agreement: agreementResult.rows[0],
            acceptanceCount: acceptanceResult.rows[0].count
        }, null, 2));

        if (
            fulfilled !== 1 ||
            rejected !== 1 ||
            rejectionMessages[0] !== "AGREEMENT_ALREADY_ACCEPTED" ||
            agreementResult.rows[0]?.status !== "ACCEPTED" ||
            acceptanceResult.rows[0]?.count !== 1
        ) {
            throw new Error("AGREEMENT_ACCEPTANCE_CONCURRENCY_TEST_FAILED");
        }

        console.log("AGREEMENT_ACCEPTANCE_CONCURRENCY=PASSED");
    } finally {
        if (testPool) {
            await testPool.end();
        }

        try {
            if (closeDbPool) await closeDbPool();
            await adminPool.query(`DROP DATABASE IF EXISTS ${testDbName}`);
            console.log(`[TEST] Dropped isolated database: ${testDbName}`);
        } finally {
            await adminPool.end();
        }
    }
}

run().catch(error => {
    console.error(
        `[FAIL] ${error instanceof Error ? error.message : String(error)}`
    );
    process.exit(1);
});
