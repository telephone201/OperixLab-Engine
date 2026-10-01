/**
 * Tests: Mapping Review Session layer (A-J).
 *
 * Exercises the real service against the real development database
 * (postgresql://...operix_labs) using SYNTHETIC preview fixtures built
 * in-memory. Creates and cleans up only mapping_review_* rows.
 *
 * NO-IMPORT GUARD: the suite counts companies/contacts/leads/
 * raw_lead_staging rows before and after ALL operations and proves the
 * counts are unchanged. Purchased source files are never touched.
 */

import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";

import { db, closeDbPool } from "../src/lib/db";
import {
    mappingReviewSessionService,
    ReviewSessionError,
    REVIEWABLE_CANONICAL_FIELDS,
} from "../src/services/acquisition/external-lead-ingestion/mapping-review-session-service";
import type {
    MappingPreview,
} from "../src/services/acquisition/external-lead-ingestion/mapping-preview-service";
import { rawSourceSchemaProfiler } from "../src/services/acquisition/external-lead-ingestion/raw-source-schema-profiler";
import {
    splitRawSourceSections,
} from "../src/services/acquisition/external-lead-ingestion/raw-source-section-splitter";

let failures = 0;
let passed = 0;

// Entry point wrapper (CommonJS target: no top-level await).
async function main(): Promise<number> {

function check(
    name: string,
    condition: boolean,
    detail?: string,
) {
    if (condition) {
        passed++;
        console.log(`PASS | ${name}`);
    } else {
        failures++;
        console.log(
            `FAIL | ${name}${detail ? ` | ${detail}` : ""}`,
        );
    }
}

async function counts(): Promise<{
    companies: number;
    contacts: number;
    leads: number;
    rawLeadStaging: number;
}> {
    const result = await db.query(`
        SELECT
            (SELECT COUNT(*) FROM companies)::int AS companies,
            (SELECT COUNT(*) FROM contacts)::int AS contacts,
            (SELECT COUNT(*) FROM leads)::int AS leads,
            (SELECT COUNT(*) FROM raw_lead_staging)::int AS raw_lead_staging
    `);

    return {
        companies: result.rows[0].companies,
        contacts: result.rows[0].contacts,
        leads: result.rows[0].leads,
        rawLeadStaging: result.rows[0].raw_lead_staging,
    };
}

// ---------------------------------------------------------------------------
// Synthetic preview fixtures (no purchased data involved)
// ---------------------------------------------------------------------------

function column(
    sourceColumn: string,
    proposedField: string | null,
    confidenceLevel: "HIGH" | "MEDIUM" | "LOW" | "UNMAPPED",
    extras: {
        confidence?: number | null;
        mappingConflict?: string | null;
        reviewRequired?: boolean;
    } = {},
) {
    return {
        sourceColumn,
        proposedField,
        profilerField: null,
        confidence:
            extras.confidence ??
            (confidenceLevel === "HIGH"
                ? 0.95
                : confidenceLevel === "MEDIUM"
                    ? 0.85
                    : confidenceLevel === "LOW"
                        ? 0.6
                        : null),
        confidenceLevel,
        sampleValues: [`sample of ${sourceColumn}`],
        mappingReason: proposedField
            ? "Test fixture: profiler-proven mapping."
            : "Test fixture: no proven mapping.",
        mappingConflict: extras.mappingConflict ?? null,
        reviewRequired: extras.reviewRequired ?? false,
        reviewStatus: (extras.reviewRequired ?? false)
            ? "REVIEW_REQUIRED"
            : "SAFE",
    } as any;
}

const cleanPreview: MappingPreview = {
    fileName: "clean-source.xlsx",
    overallSourceType: "BUSINESS_DATABASE",
    overallRequiresReview: false,
    isMixed: false,
    rowCount: 10,
    truncatedToRows: null,
    sections: [
        {
            sectionIndex: 0,
            startRowIndex: 1,
            endRowIndex: 10,
            structuralPattern: "SINGLE_SECTION",
            sectionType: "BUSINESS_DATABASE",
            nonEmptyRowCount: 10,
            malformedRecordCount: 0,
            sectionTitleRowCount: 0,
            sectionReviewRequired: false,
            mappedColumnCount: 3,
            unmappedColumnCount: 1,
            columns: [
                column("Business Name", "company_name", "HIGH"),
                column("Business Address", "address", "HIGH"),
                column("Business Phone", "phone", "HIGH"),
                column("Date Extracted", null, "HIGH"),
            ],
            notes: [],
        },
    ],
} as any;

const headerlessPreview: MappingPreview = {
    fileName: "headerless-source.xlsx",
    overallSourceType: "HEADERLESS_OR_MALFORMED",
    overallRequiresReview: true,
    isMixed: false,
    rowCount: 10,
    truncatedToRows: null,
    sections: [
        {
            sectionIndex: 0,
            startRowIndex: 1,
            endRowIndex: 10,
            structuralPattern: "SINGLE_SECTION",
            sectionType: "HEADERLESS_OR_MALFORMED",
            nonEmptyRowCount: 10,
            malformedRecordCount: 0,
            sectionTitleRowCount: 0,
            sectionReviewRequired: true,
            mappedColumnCount: 4,
            unmappedColumnCount: 0,
            columns: [
                column("column_1", "phone", "HIGH", { reviewRequired: true }),
                column("column_2", "source_url", "HIGH", { reviewRequired: true }),
                column("column_3", "contact_name", "HIGH", { reviewRequired: true }),
                column("column_4", "company_name", "HIGH", { reviewRequired: true }),
            ],
            notes: [],
        },
    ],
} as any;

const conflictPreview: MappingPreview = {
    fileName: "conflict-source.xlsx",
    overallSourceType: "BUSINESS_DATABASE",
    overallRequiresReview: true,
    isMixed: false,
    rowCount: 10,
    truncatedToRows: null,
    sections: [
        {
            sectionIndex: 0,
            startRowIndex: 1,
            endRowIndex: 10,
            structuralPattern: "SINGLE_SECTION",
            sectionType: "BUSINESS_DATABASE",
            nonEmptyRowCount: 10,
            malformedRecordCount: 0,
            sectionTitleRowCount: 0,
            sectionReviewRequired: false,
            mappedColumnCount: 2,
            unmappedColumnCount: 0,
            columns: [
                column("الايميل", "email", "HIGH", {
                    mappingConflict:
                        "Header/data conflict: header asserts email but only 0/123 values are email-like (0%); possible column swap or mislabeled header. Human review required before use.",
                }),
                column("اسم الشركة", "company_name", "HIGH", {
                    mappingConflict:
                        "Header/data conflict: header asserts company name but 123/123 values look like emails (100%); possible column swap or mislabeled header. Human review required before use.",
                }),
            ],
            notes: [],
        },
    ],
} as any;

const mixedPreview: MappingPreview = {
    fileName: "mixed-source.xlsx",
    overallSourceType: "MIXED_OR_MULTI_SECTION",
    overallRequiresReview: true,
    isMixed: true,
    rowCount: 20,
    truncatedToRows: null,
    sections: [
        {
            sectionIndex: 0,
            startRowIndex: 1,
            endRowIndex: 10,
            structuralPattern: "TABULAR_MULTI_COLUMN",
            sectionType: "BUSINESS_DATABASE",
            nonEmptyRowCount: 10,
            malformedRecordCount: 0,
            sectionTitleRowCount: 0,
            sectionReviewRequired: false,
            mappedColumnCount: 1,
            unmappedColumnCount: 0,
            columns: [
                column("Company", "company_name", "HIGH"),
            ],
            notes: [],
        },
        {
            sectionIndex: 1,
            startRowIndex: 11,
            endRowIndex: 20,
            structuralPattern: "ALTERNATING_SINGLE_VALUE",
            sectionType: "EMAIL_LIST",
            nonEmptyRowCount: 10,
            malformedRecordCount: 60,
            sectionTitleRowCount: 2,
            sectionReviewRequired: true,
            mappedColumnCount: 0,
            unmappedColumnCount: 1,
            columns: [
                column("column_1", null, "UNMAPPED", {
                    reviewRequired: true,
                }),
            ],
            notes: [
                "60 malformed/incomplete record(s) in this section remain review-required regardless of column mappings.",
            ],
        },
    ],
} as any;

// Real temp files for checksum computation (cleaned up afterwards).
const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "review-session-test-"),
);

function tempRootPattern(): string {
    return tempDir;
}

function writeTempFile(
    name: string,
    content: string,
): { filePath: string; checksum: string } {
    const filePath = path.join(tempDir, name);

    // Unique-per-run content token: identical synthetic content across
    // runs would collide with old sessions via checksum idempotency.
    const uniqueContent = `${content} [run ${crypto.randomUUID()}]`;

    fs.writeFileSync(filePath, uniqueContent);

    const checksum = crypto
        .createHash("sha256")
        .update(fs.readFileSync(filePath))
        .digest("hex");

    return { filePath, checksum };
}

const cleanFile = writeTempFile(
    "clean-source.xlsx",
    "synthetic clean source bytes v1",
);

const conflictFile = writeTempFile(
    "conflict-source.xlsx",
    "synthetic conflict source bytes v1",
);

const mixedFile = writeTempFile(
    "mixed-source.xlsx",
    "synthetic mixed source bytes v1",
);

async function expectError(
    name: string,
    code: ReviewSessionError["code"],
    promise: Promise<unknown>,
) {
    try {
        await promise;

        check(name, false, "expected an error, got none");
    } catch (error) {
        if (
            error instanceof ReviewSessionError &&
            error.code === code
        ) {
            check(name, true);
        } else {
            check(
                name,
                false,
                `wrong error: ${(error as Error).message}`,
            );
        }
    }
}

// ---------------------------------------------------------------------------
// NO-IMPORT GUARD baseline
// ---------------------------------------------------------------------------

// Re-runnability: clear any sessions left by previously interrupted runs
// of THIS suite (mapping_review_* only; purchased/lead data is never
// touched). Each run uses its own mkdtemp dir, hence the broad pattern.
await db.query(`DELETE FROM mapping_review_sessions
     WHERE source_file_path LIKE $1`,
    [`%${path.basename(tempRootPattern())}%`]);

const before = await counts();

check(
    "guard baseline captured",
    typeof before.companies === "number" &&
        typeof before.rawLeadStaging === "number",
    JSON.stringify(before),
);

// ---------------------------------------------------------------------------
// A. Clean SAFE source: accept all -> approve section -> approve session
// ---------------------------------------------------------------------------
{
    const session = await mappingReviewSessionService.createReviewSession(
        {
            preview: cleanPreview,
            filePath: cleanFile.filePath,
        },
    );

    check(
        "A: session created with DRAFT status and stored checksum",
        session.status === "DRAFT" &&
            session.sourceChecksum === cleanFile.checksum,
    );

    // Idempotent re-create: same checksum returns the same session.
    const recreated =
        await mappingReviewSessionService.createReviewSession({
            preview: cleanPreview,
            filePath: cleanFile.filePath,
        });

    check(
        "A: re-create for same checksum returns existing session",
        recreated.id === session.id,
    );

    const detail = await mappingReviewSessionService.getReviewSession(
        session.id,
    );

    check(
        "A: detail has one section with four UNRESOLVED decisions",
        detail?.sections.length === 1 &&
            detail.sections[0].decisions.length === 4 &&
            detail.sections[0].decisions.every(
                decision =>
                    decision.decision === "UNRESOLVED" &&
                    decision.approvedField === null,
            ),
    );

    const sectionId = detail!.sections[0].id;

    /*
     * A clean all-SAFE section has NO columns that require a decision,
     * so section approval is legitimate without any decisions (task
     * example 5: "Section can be accepted without human review").
     * The section is approved FIRST here to prove that path, then the
     * workflow continues by explicit ACCEPT/REJECT being refused (the
     * section is finalized) — gating is exercised in B/D/H instead.
     */
    const earlyApproved =
        await mappingReviewSessionService.approveSection({
            sessionId: session.id,
            sectionId,
        });

    check(
        "A: all-SAFE section approvable without decisions (no required ones)",
        earlyApproved.status === "APPROVED",
    );

    await expectError(
        "A: decision mutation after section approval fails",
        "SESSION_IMMUTABLE",
        mappingReviewSessionService.updateMappingDecision({
            sessionId: session.id,
            sectionId,
            sourceColumn: "Business Name",
            decision: "ACCEPT",
        }),
    );

    const approvedSession =
        await mappingReviewSessionService.approveReviewSession({
            sessionId: session.id,
        });

    check(
        "A: session approved (no required decisions were pending)",
        approvedSession.status === "APPROVED",
    );

    // Immutable after approval.
    await expectError(
        "A: decision mutation after APPROVED fails",
        "SESSION_IMMUTABLE",
        mappingReviewSessionService.updateMappingDecision({
            sessionId: session.id,
            sectionId,
            sourceColumn: "Business Name",
            decision: "REJECT",
        }),
    );

    // A2: same fixture, forced decisions on SAFE columns (ACCEPT + REJECT),
    // proving both decision semantics on a clean section.
    const session2 =
        await mappingReviewSessionService.createReviewSession({
            preview: cleanPreview,
            filePath: path.join(tempDir, "clean-source-a2.xlsx"),
            sourceChecksum: crypto
                .createHash("sha256")
                .update("clean fixture A2")
                .digest("hex"),
        });

    const detail2 = (await mappingReviewSessionService.getReviewSession(
        session2.id,
    ))!;

    for (const decision of detail2.sections[0].decisions) {
        if (decision.proposedField !== null) {
            await mappingReviewSessionService.updateMappingDecision({
                sessionId: session2.id,
                sectionId: detail2.sections[0].id,
                sourceColumn: decision.sourceColumn,
                decision: "ACCEPT",
            });
        } else {
            // Date Extracted: no proposal -> REJECT (drop) is the decision.
            await mappingReviewSessionService.updateMappingDecision({
                sessionId: session2.id,
                sectionId: detail2.sections[0].id,
                sourceColumn: decision.sourceColumn,
                decision: "REJECT",
                reviewNote: "Metadata column, safe to drop.",
            });
        }
    }

    const approvedSection2 =
        await mappingReviewSessionService.approveSection({
            sessionId: session2.id,
            sectionId: detail2.sections[0].id,
        });

    check(
        "A2: section approved after all decisions resolved",
        approvedSection2.status === "APPROVED",
    );

    const approvedSession2 =
        await mappingReviewSessionService.approveReviewSession({
            sessionId: session2.id,
        });

    check(
        "A2: session approved after section approval",
        approvedSession2.status === "APPROVED",
    );

}

// ---------------------------------------------------------------------------
// B. Headerless source: all review-required, explicit ACCEPT resolves,
//    no automatic approval
// ---------------------------------------------------------------------------
{
    const session = await mappingReviewSessionService.createReviewSession(
        {
            preview: headerlessPreview,
            filePath: path.join(tempDir, "headerless-source.xlsx"),
            sourceChecksum: crypto
                .createHash("sha256")
                .update("headerless synthetic bytes")
                .digest("hex"),
        },
    );

    const detail = await mappingReviewSessionService.getReviewSession(
        session.id,
    )!;

    const section = detail!.sections[0];

    check(
        "B: every headerless column starts UNRESOLVED and review-required",
        section.decisions.every(
            decision => decision.decision === "UNRESOLVED",
        ) &&
            (section.snapshot?.columns.every(
                column => column.reviewRequired,
            ) ?? false),
    );

    check(
        "B: session cannot be approved while unresolved",
        await mappingReviewSessionService
            .approveReviewSession({ sessionId: session.id })
            .then(
                () => false,
                error =>
                    error instanceof ReviewSessionError &&
                    error.code === "SESSION_HAS_UNRESOLVED",
            ),
    );

    await mappingReviewSessionService.approveReviewSession({
        sessionId: session.id,
    }).then(
        () => void 0,
        () => void 0,
    );

    for (const decision of section.decisions) {
        const updated =
            await mappingReviewSessionService.updateMappingDecision({
                sessionId: session.id,
                sectionId: section.id,
                sourceColumn: decision.sourceColumn,
                decision: "ACCEPT",
            });

        check(
            `B: ACCEPT of ${decision.sourceColumn} sets approvedField = proposedField`,
            updated.decision === "ACCEPT" &&
                updated.approvedField ===
                    decision.proposedField &&
                updated.proposedField === decision.proposedField,
        );
    }

    const stillSession =
        await mappingReviewSessionService.getReviewSession(session.id);

    check(
        "B: no automatic approval occurred (section still IN_REVIEW)",
        stillSession?.sections[0].status === "IN_REVIEW",
    );

    const approvedSection =
        await mappingReviewSessionService.approveSection({
            sessionId: session.id,
            sectionId: section.id,
        });

    check(
        "B: explicit section approval works after explicit ACCEPTs",
        approvedSection.status === "APPROVED",
    );

    const approvedSession =
        await mappingReviewSessionService.approveReviewSession({
            sessionId: session.id,
        });

    check(
        "B: session approved after explicit human resolution",
        approvedSession.status === "APPROVED",
    );
}

// ---------------------------------------------------------------------------
// C. Kuwait-style conflict: preserved, gates section approval, CHANGE resolves
// ---------------------------------------------------------------------------
{
    const session = await mappingReviewSessionService.createReviewSession(
        {
            preview: conflictPreview,
            filePath: conflictFile.filePath,
        },
    );

    const detail = await mappingReviewSessionService.getReviewSession(
        session.id,
    )!;

    const section = detail!.sections[0];

    const emailDecision = section.decisions.find(
        decision => decision.sourceColumn === "الايميل",
    )!;
    const companyDecision = section.decisions.find(
        decision => decision.sourceColumn === "اسم الشركة",
    )!;

    check(
        "C: original conflict evidence preserved in decisions",
        emailDecision.mappingConflict !== null &&
            companyDecision.mappingConflict !== null &&
            emailDecision.proposedField === "email" &&
            companyDecision.proposedField === "company_name",
    );

    check(
        "C: snapshot evidence still carries original proposal + conflict",
        section.snapshot?.columns.find(
            column => column.sourceColumn === "الايميل",
        )?.mappingConflict !== null,
    );

    await expectError(
        "C: section approval blocked while conflict unresolved",
        "SECTION_HAS_UNRESOLVED",
        mappingReviewSessionService.approveSection({
            sessionId: session.id,
            sectionId: section.id,
        }),
    );

    // Human resolves the swap explicitly: swap the two columns.
    await mappingReviewSessionService.updateMappingDecision({
        sessionId: session.id,
        sectionId: section.id,
        sourceColumn: "الايميل",
        decision: "CHANGE",
        approvedField: "company_name",
        reviewNote: "Values are company names despite header.",
    });

    await mappingReviewSessionService.updateMappingDecision({
        sessionId: session.id,
        sectionId: section.id,
        sourceColumn: "اسم الشركة",
        decision: "CHANGE",
        approvedField: "email",
        reviewNote: "Values are emails despite header.",
    });

    const swapped = (await mappingReviewSessionService.getReviewSession(
        session.id,
    ))!;

    const swappedEmail = swapped.sections[0].decisions.find(
        decision => decision.sourceColumn === "الايميل",
    )!;

    check(
        "C: CHANGE stores human-approved field while proposal stays original",
        swappedEmail.approvedField === "company_name" &&
            swappedEmail.proposedField === "email",
    );

    const approvedSection =
        await mappingReviewSessionService.approveSection({
            sessionId: session.id,
            sectionId: section.id,
        });

    check(
        "C: section approvable after explicit conflict resolution",
        approvedSection.status === "APPROVED",
    );
}

// ---------------------------------------------------------------------------
// D. Mixed source: malformed + unmapped columns gate approval until resolved
// ---------------------------------------------------------------------------
{
    const session = await mappingReviewSessionService.createReviewSession(
        {
            preview: mixedPreview,
            filePath: mixedFile.filePath,
        },
    );

    const detail = await mappingReviewSessionService.getReviewSession(
        session.id,
    )!;

    const tabular = detail!.sections[0];
    const alternating = detail!.sections[1];

    check(
        "D: malformed count preserved in section snapshot",
        alternating.snapshot?.malformedRecordCount === 60 &&
            (alternating.snapshot?.notes ?? []).some(note =>
                /60 malformed/.test(note),
            ),
    );

    check(
        "D: unmapped alternating column starts unresolved",
        alternating.decisions[0].decision === "UNRESOLVED" &&
            alternating.decisions[0].proposedField === null,
    );

    await expectError(
        "D: alternating section approval blocked while unresolved",
        "SECTION_HAS_UNRESOLVED",
        mappingReviewSessionService.approveSection({
            sessionId: session.id,
            sectionId: alternating.id,
        }),
    );

    // ACCEPT the clean tabular section.
    await mappingReviewSessionService.updateMappingDecision({
        sessionId: session.id,
        sectionId: tabular.id,
        sourceColumn: "Company",
        decision: "ACCEPT",
    });

    await mappingReviewSessionService.approveSection({
        sessionId: session.id,
        sectionId: tabular.id,
    });

    // REJECT the unusable alternating column (explicit human decision).
    await mappingReviewSessionService.updateMappingDecision({
        sessionId: session.id,
        sectionId: alternating.id,
        sourceColumn: "column_1",
        decision: "REJECT",
        reviewNote: "Mixed value classes; section unusable without splitting.",
    });

    const rejectedDecision = (
        await mappingReviewSessionService.getReviewSession(session.id)
    )!.sections[1].decisions[0];

    check(
        "D: REJECT leaves approvedField null",
        rejectedDecision.decision === "REJECT" &&
            rejectedDecision.approvedField === null,
    );

    await mappingReviewSessionService.approveSection({
        sessionId: session.id,
        sectionId: alternating.id,
    });

    const approvedSession =
        await mappingReviewSessionService.approveReviewSession({
            sessionId: session.id,
        });

    check(
        "D: session approves after both sections resolved",
        approvedSession.status === "APPROVED",
    );
}

// ---------------------------------------------------------------------------
// E/F. REJECT + CHANGE semantics with proposal preservation
// ---------------------------------------------------------------------------
{
    // Covered inline in A (REJECT of Date Extracted), C (CHANGE swap),
    // and D (REJECT with approvedField null).
    check(
        "E/F: REJECT and CHANGE semantics verified in A/C/D blocks",
        REVIEWABLE_CANONICAL_FIELDS.has("company_name") &&
            !REVIEWABLE_CANONICAL_FIELDS.has("made_up_field"),
    );
}

// ---------------------------------------------------------------------------
// G. Idempotency: repeated identical decision does not duplicate
// ---------------------------------------------------------------------------
{
    const session = await mappingReviewSessionService.createReviewSession(
        {
            preview: cleanPreview,
            filePath: path.join(tempDir, "clean-source-2.xlsx"),
            sourceChecksum: crypto
                .createHash("sha256")
                .update("idempotency fixture")
                .digest("hex"),
        },
    );

    const detail = await mappingReviewSessionService.getReviewSession(
        session.id,
    )!;

    const sectionId = detail!.sections[0].id;

    for (let index = 0; index < 3; index++) {
        await mappingReviewSessionService.updateMappingDecision({
            sessionId: session.id,
            sectionId,
            sourceColumn: "Business Name",
            decision: "ACCEPT",
        });
    }

    const count = await db.query(
        `SELECT COUNT(*)::int AS count
         FROM mapping_review_decisions
         WHERE section_id = $1 AND source_column = 'Business Name'`,
        [sectionId],
    );

    check(
        "G: repeated identical decision keeps a single row",
        count.rows[0].count === 1,
        `count=${count.rows[0].count}`,
    );

    // Conflicting decision on the same column upserts (still one row).
    await mappingReviewSessionService.updateMappingDecision({
        sessionId: session.id,
        sectionId,
        sourceColumn: "Business Name",
        decision: "REJECT",
    });

    const after = await db.query(
        `SELECT decision, approved_field
         FROM mapping_review_decisions
         WHERE section_id = $1 AND source_column = 'Business Name'`,
        [sectionId],
    );

    check(
        "G: changed decision upserts same row with REJECT semantics",
        after.rows.length === 1 &&
            after.rows[0].decision === "REJECT" &&
            after.rows[0].approved_field === null,
    );

    await mappingReviewSessionService.rejectReviewSession({
        sessionId: session.id,
    });
}

// ---------------------------------------------------------------------------
// H. Session integrity: unresolved sections block session approval
// ---------------------------------------------------------------------------
{
    const session = await mappingReviewSessionService.createReviewSession(
        {
            preview: mixedPreview,
            filePath: path.join(tempDir, "mixed-source-2.xlsx"),
            sourceChecksum: crypto
                .createHash("sha256")
                .update("integrity fixture")
                .digest("hex"),
        },
    );

    const detail = await mappingReviewSessionService.getReviewSession(
        session.id,
    )!;

    // Approve only the first section; leave the second unresolved.
    await mappingReviewSessionService.updateMappingDecision({
        sessionId: session.id,
        sectionId: detail!.sections[0].id,
        sourceColumn: "Company",
        decision: "ACCEPT",
    });

    await mappingReviewSessionService.approveSection({
        sessionId: session.id,
        sectionId: detail!.sections[0].id,
    });

    await expectError(
        "H: session approval blocked with unresolved second section",
        "SESSION_HAS_UNRESOLVED",
        mappingReviewSessionService.approveReviewSession({
            sessionId: session.id,
        }),
    );

    await mappingReviewSessionService.rejectSection({
        sessionId: session.id,
        sectionId: detail!.sections[1].id,
    });

    const approvedSession =
        await mappingReviewSessionService.approveReviewSession({
            sessionId: session.id,
        });

    check(
        "H: rejected section counts as resolved for session approval",
        approvedSession.status === "APPROVED",
    );
}

// ---------------------------------------------------------------------------
// I. Source checksum: changed source cannot silently reuse old session
// ---------------------------------------------------------------------------
{
    const session = await mappingReviewSessionService.createReviewSession(
        {
            preview: cleanPreview,
            filePath: cleanFile.filePath,
        },
    );

    const integrity =
        await mappingReviewSessionService.verifySourceIntegrity(
            session.id,
        );

    check(
        "I: unchanged source passes integrity check",
        integrity.matches === true &&
            integrity.currentChecksum === cleanFile.checksum,
    );

    // Mutate the temp file (synthetic; purchased data untouched).
    const changedPath = path.join(tempDir, "changed-source.xlsx");

    fs.writeFileSync(changedPath, "changed bytes v2");

    const changedSession =
        await mappingReviewSessionService.createReviewSession({
            preview: cleanPreview,
            filePath: changedPath,
        });

    check(
        "I: changed source gets a NEW session (different identity)",
        changedSession.id !== session.id &&
            changedSession.sourceChecksum !==
                session.sourceChecksum,
    );

    // Missing file -> currentChecksum null, matches false (no silent reuse).
    const vanishingPath = path.join(tempDir, "vanishing.xlsx");

    fs.writeFileSync(vanishingPath, "vanishing fixture");

    const vanishedSession =
        await mappingReviewSessionService.createReviewSession({
            preview: cleanPreview,
            filePath: vanishingPath,
        });

    fs.rmSync(vanishingPath);

    const vanishedIntegrity =
        await mappingReviewSessionService.verifySourceIntegrity(
            vanishedSession.id,
        );

    check(
        "I: missing source file reports non-matching integrity",
        vanishedIntegrity.matches === false,
    );
}

// ---------------------------------------------------------------------------
// J. Regression: preview/splitter/profiler behavior unchanged
// ---------------------------------------------------------------------------
{
    const businessRows = [
        ["Business Name", "Business Address", "Business Phone"],
        ["Acme Ltd", "1 Main St", "0501234567"],
        ["Globex", "2 Main St", "0501234568"],
        ["Initech", "3 Main St", "0501234569"],
        ["Umbrella", "4 Main St", "0501234570"],
        ["Wayne Foods", "5 Main St", "0501234571"],
    ].map((values, index) => ({
        rowIndex: index + 1,
        values,
    }));

    const profile = rawSourceSchemaProfiler.profile(businessRows);

    check(
        "J: profiler classification unchanged",
        [
            "BUSINESS_DATABASE",
            "POSSIBLE_BUSINESS_DATABASE",
        ].includes(profile.sourceType),
    );

    const mixedRows = [
        ["Company", "Email", "Serial"],
        ["Acme Ltd", "a@acme.com", "1"],
        ["Globex", "b@globex.com", "2"],
        ["Initech", "c@initech.com", "3"],
        ["Umbrella", "d@umbrella.com", "4"],
        ["Wayne", "e@wayne.com", "5"],
        ["Alpha Company"],
        ["alpha@alpha.com"],
        ["Beta Company"],
        ["beta@beta.com"],
        ["Gamma Company"],
        ["gamma@gamma.com"],
    ].map((values, index) => ({
        rowIndex: index + 1,
        values,
    }));

    const split = splitRawSourceSections(mixedRows);

    check(
        "J: splitter behavior unchanged (tabular + alternating)",
        !split.isSingleSection &&
            split.sections.length === 2,
    );
}

// ---------------------------------------------------------------------------
// NO-IMPORT GUARD: counts must be unchanged
// ---------------------------------------------------------------------------

const after = await counts();

check(
    "NO-IMPORT GUARD: companies count unchanged",
    after.companies === before.companies,
    `before=${before.companies}, after=${after.companies}`,
);

check(
    "NO-IMPORT GUARD: contacts count unchanged",
    after.contacts === before.contacts,
    `before=${before.contacts}, after=${after.contacts}`,
);

check(
    "NO-IMPORT GUARD: leads count unchanged",
    after.leads === before.leads,
    `before=${before.leads}, after=${after.leads}`,
);

check(
    "NO-IMPORT GUARD: raw_lead_staging count unchanged",
    after.rawLeadStaging === before.rawLeadStaging,
    `before=${before.rawLeadStaging}, after=${after.rawLeadStaging}`,
);

// Cleanup: remove the rows created by this test suite (mapping_review_*
// only) so the suite is re-runnable, then close the pool.
{
    try {
        const cleanup = await db.query(
            `DELETE FROM mapping_review_sessions
             WHERE source_file_path LIKE $1`,
            [`%${path.basename(tempDir)}%`],
        );

        console.log(
            `CLEANUP | removed ${cleanup.rowCount} test session(s)`,
        );
    } catch (cleanupError) {
        console.log(
            `CLEANUP | skipped after failure: ${(cleanupError as Error).message}`,
        );
    }
}

fs.rmSync(tempDir, { recursive: true, force: true });

console.log("");
console.log(
    failures === 0
        ? `MAPPING_REVIEW_SESSION_TEST_PASS (${passed} checks)`
        : `MAPPING_REVIEW_SESSION_TEST_FAIL (${failures} failures, ${passed} passed)`,
);

    await closeDbPool();

    return failures === 0 ? 0 : 1;
}

main()
    .then(code => {
        process.exitCode = code;
    })
    .catch(async (error: unknown) => {
        console.error(
            "FATAL:",
            error instanceof Error
                ? error.message
                : String(error),
        );

        process.exitCode = 1;

        try {
            await closeDbPool();
        } catch {
            // Pool already closed; nothing to do.
        }
    });
