# GATES_HANDOVER — Operix Labs Engine (Hardening Phase)

**Audience:** a completely new coding agent (referred to below as "the next agent") that has **never** seen this project.
**Author:** prior agent session (2026-09-26) that executed STEP 9 Gates G1–G2 and the G3 reconnaissance.
**Evidence basis:** every fact below was verified by direct inspection (git, live PostgreSQL catalog queries, source reads, and executed verification commands) during the session that produced this document. Anything not directly verified is explicitly labeled.

---

## SECTION 1 — PROJECT IDENTITY

| Item | Value |
|---|---|
| Project name | **Operix Labs Engine** (Operix Acquisition & Sales Operating System) |
| Repository path | `D:\OperixLabs Engine` |
| Branch | `main` |
| HEAD at handover | `b0096f6` — "Fix secondary InstaPay payment URL" (2026-09-23) |

### What the system does
An end-to-end B2B automation-agency operating system that walks a sales **Lead** through:

```
Lead → Research → Qualification → Pain Analysis → Requirements
     → Workflow Matching (against a large n8n workflow library)
     → Human Matching Review (approve/reject)
     → Matching→Commercial Handoff (Step 7 bridge)
     → Commercial Package → Pricing → Offer → Proposal → Governance Approval
     → Engagement → Agreement → Acceptance
     → Payment Submission → HUMAN Payment Verification → Payment Readiness
     → Commercial→Project Handoff (contract + project creation)
     → Project Start Eligibility Gate → Phase 10 delivery (plan/scope/review/handover/completion)
```

The core commercial invariant (verified at runtime by the Step 8 suite): a payment **submission never verifies itself**; a separate human verification step moves `REQUIRED → VERIFIED`; readiness and project handoff are deterministic downstream gates.

### Architecture (verified)

- **`apps/api`** — Express 5 + `pg` (node-postgres) API, TypeScript strict, run via `ts-node` (there is **no production build/start script** — see G8 in the roadmap). 17 controllers wired in `src/routes/api-router.ts`. Entry point `src/index.ts`. **No authentication or RBAC exists anywhere** (STEP 9 Phase 1 blockers B-01/B-02).
  - **Database adapter:** `src/lib/db.ts` — a custom Prisma-like proxy over `pg` (`db.table.findMany/create/update/…`, `db.query`, `db.transaction`). SQL is parameterized; identifiers pass through a strict `quoteIdentifier`. Known gap **R1**: `buildWhere` silently drops `contains`/`hasSome` operators (used by `workflow-candidate-search.ts`) — scheduled for **G9**, do not "fix" early. **RESOLVED in G9 (verified): `contains`/`hasSome` implemented in `buildWhere`, persistent verification PASS � see Section 3.**
- **`apps/web`** — Next.js 14 dashboard (`dev/build/start/lint` scripts exist). Frontend auth is currently a **mock** (`apps/web/src/hooks/use-auth.tsx`, localStorage token `operix_auth_token`, mock ADMIN user). API base default `http://localhost:3000/api` in `src/lib/api-client.ts`.
- **Database** — PostgreSQL, SQL-file migrations in `apps/api/migrations/` applied by `apps/api/src/services/database/migration-runner.ts` (each migration runs inside ONE transaction via `db.transaction`; checksum-enforced: modifying an applied migration aborts `migrate.ts up`). History table: `migrations_history`. Current state: **38 files, 37 applied rows** (001–037 minus historically-missing 003, plus 038), **no pending**.
- **`workflow_library`** — 6,953 rows of imported n8n workflow definitions. **READ-ONLY FOREVER** (see Section 2). Consumed by the matching engines; never written by any verification suite.
- **`packages/`** — `n8n-integration`, `provider-abstractions`, `shared`, `workflow-intelligence` (present; not deeply audited in the hardening session — *uncertain, treat as context only*).
- **`workflow-library/`, `N8N.zip`** — source material for the library import; read-only artifacts.
- **`docs/`** — phase 9/10 audit reports (historical; not re-validated in this session).
- **`HANDOVER_2026-09-25*.md`** (v1–v6 at repo root) and this file — the handover series.

### Major business domains (verified directory structure of `apps/api/src/services/`)
`acquisition`, `analysis`, `dashboard`, `database`, `deployment`, `governance`, `intent`, `inventory`, `matching`, `manual-ai`, `orchestration`, `pain`, `projects` (the commercial + delivery core), `qualification`, `requirements`, `research`, `validation`, `versioning`, `workflows`.

### How the pieces relate (verified relationships)
- Controllers (`apps/api/src/controllers/*`) → services → `db.ts` → PostgreSQL. No service-to-service HTTP.
- The **matching chain** (Steps 3–7 deliverables): `matching-orchestrator` (advisory `pg_advisory_xact_lock` per session) → `matching-persistence-service` (writes `solution_architectures`) → `matching-review-service` (approve/reject) → `matching-commercial-handoff-service` (Step 7 bridge: creates a DRAFT `workflow_versions` anchor + DRAFT `commercial_packages` atomically; idempotent via advisory lock + pre-check, now ALSO DB-enforced by migration 038's unique index).
- The **commercial chain** (Phase 11): `commercial-foundation-service` (package/pricing/offer) → `proposal-service` → `commercial-governance-service` (approvals) → `engagement-service` + intent adapter → `agreement-service` → `payment-service` → `payment-verification-service` (FOR UPDATE, human-only) → `payment-readiness-service` → `commercial-project-handoff-service` (`$transaction`, partial unique indexes `ux_contracts_proposal_id`, `ux_projects_contract_id`, `ON CONFLICT DO NOTHING`, idempotent CREATED/ALREADY_EXISTS) → `eligibility-gate.ts` (deterministic 4-gate check).
- **Runtime-verified suites** (Steps 1–8) live in `apps/api/src/services/matching/*verify*.ts` and `apps/api/src/services/projects/phase-11-commercial-verify.ts`, runners in `apps/api/scripts/run-*.ts`. All are **frozen** — see Section 2.

**Uncertain / not audited:** internal quality of `apps/web` pages, `packages/*` contents, `docs/*` accuracy, deployment services internals. The next agent must not rely on this document for those.

---

## SECTION 2 — SOURCE OF TRUTH / SAFETY RULES (HARD RULES)

1. **`workflow_library` is READ-ONLY. Currently 6,953 rows. Never delete, mutate, import into, or lock it.** Every cleanup mechanism in this repo explicitly excludes it; keep that invariant.
2. **The 5 remaining contracts + their 5 projects are PROTECTED** (IDs in Section 5). They survived the authorized cleanup as the only contract/project rows; do not delete, modify, or "clean" them without explicit user authorization.
3. **Migration `038_db_contract_repair.sql` must NEVER be modified** — it is applied (checksum-enforced by the runner). Any new schema change = a NEW migration `039+`, created only when explicitly authorized.
4. **`apps/api/scripts/verify-g2-db-contract.ts` must not be casually modified.** It is the permanent G2 proof. (It received two documented adjustments during G2 — recorded in Section 5 — but now must stay stable.)
5. **Step 8 assertions (`apps/api/src/services/projects/phase-11-commercial-verify.ts`) must not change without explicit authorization** — same for all Step 1–7 suites and their runners.
6. **No broad cleanup predicates:** no `TRUNCATE`, no `DELETE … WHERE created_at/status/…`, no whole-database assumptions. Deletion is **target-ID based only**, inside one transaction, with a logical backup first — and only when explicitly authorized.
7. **No `git add` / `git commit` / `git push` / reset / checkout unless the user explicitly authorizes it.** Staging has been 0 throughout the entire effort.
8. **No production implementation unless the currently-authorized gate defines it.** The gates are executed one at a time under explicit user authorization (see Section 3).
9. **Never log or print secret values** (DATABASE_URL, APP_SECRET, InstaPay identifiers, credentials). Errors name variables, never values (G1 contract).
10. **Never restart/apply someone else's server or leave background processes running** (a prior probe killed its server via `taskkill //F //PID` after `kill` alone missed the ts-node child).

### Epistemic vocabulary used in this document
- **VERIFIED FACT** — proven by executed command / live query / direct file read in this session.
- **PLANNED WORK** — agreed roadmap item (Phase 2 plan) not yet authorized for execution.
- **OPEN DESIGN DECISION** — a decision the human must make before implementation (e.g., Section 10). The next agent must NOT resolve these silently.
- **ASSUMPTION / UNCERTAIN** — context that was not directly verified; labeled where used.

---

## SECTION 3 — GATE HISTORY

Preceding the hardening gates, the project completed **STEPS 1–8 (all FINAL PASS)**: matching chain, review, read-path, Step 7 handoff, and the Step 8 E2E commercial-to-project-start suite (30 assertions, 17 PASS results incl. cleanup, exit 0).

STEP 9 **PHASE 1** (production-readiness audit, read-only) = **BLOCKERS FOUND** (B-01…B-11 register). STEP 9 **PHASE 2** (hardening plan + auth architecture, design-only) = **PLAN READY — IMPLEMENTATION AUTHORIZATION REQUIRED**. Then the gate sequence:

| Gate | Scope (one line) | Status |
|---|---|---|
| **G1** | Production configuration foundation | **PASS** |
| **G2** | Database contract repair (+ authorized residue cleanup) | **PASS** |
| **G3** | Permanent audit logging (`auditLogger → audit_logs` + correlation) | **RECON COMPLETE — IMPLEMENTATION NOT AUTHORIZED** |
| G4 | Workflow matching + identity integration | PASS |
| G5 | Authentication enforcement + authenticated identity | PASS |
| G6 | RBAC authorization + AUTHZ_DENIED audit | PASS |
| G7 | Payment verification amount rule | NOT STARTED |
| G8 | Runtime/operational hardening (build/start, health, shutdown, CORS, error sanitization, request logs) | NOT STARTED |
| G9 | R1 (buildWhere contains/hasSome) + R3 (SECURITY=UNKNOWN) matching hardening | **PASS** |

Dependency graph (from the approved Phase 2 plan): **G3 independent** (ready to run) · **G4 → G5 → G6 → G7** · **G8 needs only G1** · **G9 last**.

### What G1 accomplished (summary; details Section 4)
Portable `.env` resolution (`CONFIG_ENV_PATH` override → repo-relative `config/.env`), fail-fast validation of `DATABASE_URL` (required/non-empty/postgres-scheme/has host), removal of the `'dev-secret'` fallback, production strength check for `APP_SECRET` (≥32 chars when set in production), InstaPay payment destinations moved out of source into env vars with fail-at-invocation semantics, quiet dotenv (no path printing), secret-free error messages. TypeScript exit 0; live boot probe and 9-scenario failure battery passed.

### What G2 accomplished (summary; details Section 5)
Read-only audit proved 210 orphan `workflow_versions` + 14 `commercial_packages` were 100% verification residue (no real business data). After explicit user authorization: logical backup outside the repo → ONE transaction → 32 ID-based DELETE statements (622 rows across 32 tables) → 38 in-transaction assertions → COMMIT → independent fresh-connection verification. Then **migration 038 applied exactly once** (unmodified): `solution_versions` normalized to the intended contract, FK `workflow_versions.solution_id → solution_architectures(id) ON DELETE CASCADE` (NOT VALID → VALID), unique index `ux_commercial_packages_lead_id_solution_version_id`. G2 verifier FULL PASS (including negative DB proofs), tsc 0, Step 8 regression 17/17 unchanged.

### What G9 accomplished (summary)
**R1 (VERIFIED):** `db.buildWhere` (`apps/api/src/lib/db.ts`) now supports `contains` (LIKE, or ILIKE with `mode: 'insensitive'`) and `hasSome` (EXISTS over `unnest(string_to_array(...))`, matching the TEXT `integrations` column; an empty array yields FALSE). `WorkflowCandidateSearch` consumes both (`category {in}`, `integrations {hasSome}`, `name/description {contains}`); in persistent verification the borrowed read-only `workflow_library` row is discovered through `integrations hasSome`.

**R3 (VERIFIED):** `hard-gate-evaluator.ts` uses FAIL-only eligibility � `isEligible = !results.some(r => r.status === GateStatus.FAIL)` � so SECURITY=UNKNOWN does not disqualify a candidate. `strategy-decision-engine.ts evaluateReuse()` converts SECURITY=UNKNOWN into `reviewRequired = true` with a review reason containing `SECURITY:UNKNOWN (<workflowLibraryId>)`. CUSTOMIZE semantics (SECURITY/LICENSE must PASS) untouched. `reviewReason` is **NOT persisted** (no column, absent from the blueprint JSON) � the engine result is the record.

**Coverage normalization (VERIFIED):** `matching-orchestrator.normalizeLibraryCandidate` converts the TEXT `integrations` column into a string array (comma-split/trim/filter, `hasSome` semantics, case preserved) and normalizes JSONB/string `triggers` into the array shape `RequirementCoverageAnalyzer` expects; already-array values pass through untouched. This fixed the live orchestrator coverage divergence: the happy path now reaches `strategy = REUSE`, `status = REVIEW_REQUIRED` (previously BUILD caused by degraded coverage input), and MUST coverage can reach FULL/PASS when the requirement's integration and trigger actually match. Known and NOT fixed: the analyzer's integration comparison remains case-sensitive (SQL `hasSome` lowercases both sides; the analyzer does not).

**Persistent verification (executed 2026-09-28):** `npx tsc --noEmit` ? exit 0, zero errors. `npx tsx ./scripts/run-matching-verify.ts` ? exit 0, **11/11 steps PASS**: fixture borrow (library 6,953) + seed; R1 hasSome discovery; happy path (strategy=REUSE, status=REVIEW_REQUIRED, persisted contract consistent); idempotency (REUSED, sessions=1); ownership mismatch (SKIPPED, no session); DRAFT status guard (SKIPPED, no session); bridge: REUSE REVIEW_REQUIRED ? APPROVED ? commercial handoff (REUSED) ? idempotent replay, plus its zero-residue cleanup (see next paragraph); R3 (SECURITY=UNKNOWN; isEligible=true; strategy=REUSE; reviewRequired=true; reviewReason contains `SECURITY:UNKNOWN`; primaryCandidateId preserved; persisted session status=REVIEW_REQUIRED; primary candidate status=SELECTED); cleanup PASS. `workflow_library` read-only throughout: COUNT before = after = **6,953**; no writes occurred. The verifier (`apps/api/src/services/matching/matching-integration-verify.ts`) remains **UNTRACKED by design � do not git-add it**.

**Matching ? Review ? Commercial Handoff Bridge E2E (executed 2026-09-28):** the scenario `runReviewToCommercialHandoffBridge` (same verifier) closes the previously identified REUSE ? REVIEW ? COMMERCIAL HANDOFF bridge verification gap. Proven path, entirely real code (no mocks, no recomputation): the genuine orchestrator REUSE session (REVIEW_REQUIRED; exactly one SELECTED candidate whose `workflow_id` equals `blueprint.primaryCandidateId`) ? real `matchingReviewService.approveMatch()` ? session APPROVED + architecture APPROVED with `approved_by`/`approved_at` persisted ? real `matchingCommercialHandoffService.handoffApprovedSession()` ? anchor `origin_type='REUSED'` and a DRAFT package bound to the lead/architecture/anchor ? identical handoff replay ? `reusedPackage=true`, same package id, no duplicate. Asserted throughout: approval metadata persisted; strategy remains REUSE; handoff remains blocked before approval by the existing contract (separately guard-verified); package identity stays bound to lead/architecture/anchor; persisted blueprint/candidate linkage unchanged after approval and after handoff (persisted rows only � no transient StrategyDecision). The bridge seeds only the minimum synthetic upstream identity the handoff contract requires (research/qualification/pain version rows linked onto the fixture analysis) and deletes them, the package and the anchor in FK-safe order with **zero residue** asserted; `workflow_library` untouched. Result: **11/11 steps PASS**, `npx tsc --noEmit` 0 errors, COUNT before = after = **6,953**, no production source changes. **This is verification evidence only** � it does not change the reviewReason persistence non-goal, the SHOULD-semantics product decision, CUSTOMIZE's production reachability (the bridge proves REUSE only), or the `overall_confidence` design.

**PRODUCT DECISION � Requirement priority semantics: Informational only (Option A) (finalized 2026-09-28):** SHOULD is contextual information and does not affect ranking, hard-gate eligibility, REVIEW_REQUIRED, or strategy selection. MUST semantics remain authoritative where already implemented. Boundary of this decision: (1) SHOULD must not influence candidate ranking (the WorkflowMatchRanker's coverage dimension remains zero-valued for all candidates � unchanged); (2) SHOULD must not become a hard compatibility gate (MUST_REQUIREMENT_COVERAGE continues to inspect `priority === 'MUST'` only); (3) SHOULD must not independently cause REVIEW_REQUIRED (driven only by SECURITY UNKNOWN / BUILD / NO_MATCH rules); (4) SHOULD must not alter the selected strategy (REUSE / CUSTOMIZE / COMPOSE / BUILD ladder unchanged); (5) existing MUST semantics are unchanged everywhere; (6) COULD and UNKNOWN priorities receive NO new behavior from this decision (in persisted coverage rows they remain indistinguishable from SHOULD via the `is_must_requirement` boolean � exposure/grouping of that remains a separate future surface decision); (7) no new priority semantics are introduced beyond documenting this decision. This is a **product decision and a current contract/non-goal boundary**, recorded to close the previously open SHOULD-semantics question � it is **not a request for implementation**, and no matching behavior changes with it.

**PRODUCT DECISION � Matching Review Surface: MINIMUM REVIEW SURFACE CONTRACT adopted (finalized 2026-09-28):** for a REUSE + REVIEW_REQUIRED session, the intended reviewer-facing read contract exposes, using existing persisted data only: (1) **candidate workflow metadata** joined read-only from `workflow_library` by `candidates[].workflowId` � name, description, integrations, triggers, quality_score, category; (2) **requirement context** � requirement title, description, priority (available via the existing requirements read path); (3) **per-candidate requirement coverage** from `workflow_requirement_matches` � requirement_id, coverage_level, evidence, confidence, is_must_requirement; (4) **per-candidate compatibility gates** from `workflow_compatibility_checks` � gate_type, result, details; (5) all currently exposed matching detail information is preserved � session decision/status, strategy, overallConfidence, architecture and approval metadata, blueprint, recommendation, primaryCandidateId, reasoning, evidence, candidate matchScore/rank/status/reasoning, review outcome/decision metadata. Purpose: expose existing persisted evidence so a human reviewer can make an informed approve/reject decision; the audit found the prior surface PARTIALLY SUFFICIENT (decision outcome and engine narrative exposed, operational substance � which workflow, which requirements, MUST coverage, gate verdicts � persisted but unexposed). Semantic boundaries: SHOULD remains Informational only (Option A, above) and must not affect ranking, hard gates, REVIEW_REQUIRED, or strategy selection; MUST semantics remain authoritative; no separate COULD/UNKNOWN semantics are invented; reviewReason is NOT added as a persisted or required review field (it remains a documented non-goal � the SECURITY/LICENSE gate details, once exposed, carry the equivalent explanation); overallConfidence remains NULL-by-design unless changed by a separate future authorized decision. Architectural boundaries: **no database migration is implied**, **no `workflow_library` mutation is implied** (all review data already exists in current persistence; every addition is a read-only SELECT/join), and this is a read-surface/product-contract decision only. **Implementation is NOT authorized by this documentation decision** � it defines the target contract for a future authorized implementation task.

#### Matching Review Surface � Implementation + Full Verification (executed 2026-09-28)
**Implementation:** the contract above is now implemented � `matching-read-service.ts` (`GET /leads/:id/matching/sessions/:sessionId` detail path, the only production file modified) additively exposes the approved surface through batched SELECT-only queries (`id = ANY($1::uuid[])` � one query per data source: `workflow_library` metadata by distinct candidate workflowIds, `workflow_requirement_matches` and `workflow_compatibility_checks` by candidate ids, `requirements` by the session's `requirements_version_id`), grouped in memory per candidate � **no N+1**, no duplicated candidate rows, empty results as `[]` (never null), `workflow` null only for a genuinely missing library row, and the list endpoint left lean/unchanged. Existing detail fields are byte-identical. The approved DTO fields: candidate `workflow{name, description, integrations, triggers, qualityScore, category}` � `coverage[]{requirementId, coverageLevel, evidence, confidence, isMustRequirement}` � `gates[]{gateType, result, details}` � session `requirements[]{id, title, description, priority}`.

**Verification (41 review-surface assertions PASS):** (a) **26 standalone DTO runtime assertions** against a real persistent BUILD/REVIEW_REQUIRED session � field shapes, library-metadata mapping, per-candidate coverage/gate grouping counts matching the DB exactly, SECURITY/LICENSE exposure, requirements mapping, ordering preservation, empty-array semantics via an isolated self-cleaning fixture, ownership/scoping untouched; (b) **15 genuine bridge DTO assertions** � the existing real bridge (REUSE ? REVIEW_REQUIRED ? real MatchingReadService review surface ? `approveMatch` ? APPROVED session + architecture ? commercial handoff ? package ? replay) now reads the review surface through the real read service **before approval** and asserts the surface **unchanged after handoff** (strategy, primaryCandidateId, workflow/coverage/gates/requirements arrays byte-identical; only decision status and review metadata change). The bridge's genuine happy-path session carries **50 candidates (47 eligible)** � the DTO is verified to correctly expose the SELECTED candidate among the full set via `candidate.workflowId === blueprint.primaryCandidateId` (not a one-candidate fixture). Full matching suite: **11/11 steps PASS**; `npx tsc --noEmit` 0 errors; `workflow_library` COUNT before = after = **6,953** (read-only, SELECT-only access); zero fixture residue; verifier remains UNTRACKED by design.

**Verification correction (resolved, no ongoing issue):** during DTO verification a runtime defect was caught and fixed pre-suite � `workflow_requirement_matches` has no `created_at` column, so the coverage query's ordering was corrected to `requirement_id ASC` (tsc cannot catch SQL-level errors; the runtime probe did).

**Boundaries unchanged:** no matching behavior, ranking, gate, strategy-selection, or REVIEW_REQUIRED semantics changed; reviewReason persistence remains a non-goal (the exposed SECURITY/LICENSE gate details carry the equivalent explanation); `overallConfidence` remains NULL-by-design; SHOULD remains informational only (Option A); CUSTOMIZE reachability remains outside this scope; no UI/dashboard exists or was implemented � **the review surface is API/read-path only at this stage**.

---

## SECTION 4 — G1 DETAILS (all VERIFIED)

**Files (exact):**
- `apps/api/src/config/config-validation.ts` — **NEW** (147 lines). `resolveEnvFile()`, `ConfigValidationError`, `validateDatabaseUrl()`, `validateAppSecret()`, `validatePort()`, `requireNonEmptyConfig()`.
- `apps/api/src/config/config-manager.ts` — modified **+68/−18**: consumes the validation module; adds `instapayPrimaryIdentifier/Url`, `instapaySecondaryIdentifier/Url` to `AppConfig`; `dotenv.config({ path: envFile, quiet: true })`; no `path` import; constructor calls `validateConfiguration()`.
- `apps/api/src/services/projects/manual-instapay-provider.ts` — modified **+35/−8**: reads destinations from config; throws `INSTAPAY_DESTINATION_MISSING` **at invocation time** (not startup); secondary destination optional; values never logged.

**Environment-file resolution order (documented in code):**
1. `CONFIG_ENV_PATH` (explicit override; missing file → `CONFIG_VALIDATION_ERROR`).
2. `<repo root>/config/.env` resolved from the module location via `__dirname` (portable; verified working from a different cwd via `migrate.ts status` run from repo root).
3. No file → process env used as-is (dotenv not invoked; no unexpected file loads).

**Fail-fast rules (verified by 9-scenario battery with fake values in /tmp):**
- `DATABASE_URL` missing/empty → `DATABASE_URL is required and must not be empty.` (B & C cases).
- Malformed (no scheme / wrong scheme / missing host) → `DATABASE_URL is malformed …` (D/D2/D3).
- `APP_SECRET` set but <32 chars in `NODE_ENV=production` → `APP_SECRET is set but too weak for production …` (E). The `'dev-secret'` fallback is **gone** (grep-verified; only doc-comments mention its removal).
- `PORT`: unset/empty/`0` → 3000 (legacy semantics preserved — this machine's shell exports `PORT=0`; the old code's `|| 3000` treated 0 as unset; other invalid values now fail fast). Override-file PORT is shadowed by an already-exported env PORT (dotenv never overrides) — same behavior as before G1, documented.
- Optional integrations (N8N, Gmail, OLLAMA) remain optional; OLLAMA keeps its localhost default.
- **Secret logging protections:** dotenv `quiet: true` (no "injected env from <path>" line), resolved env path never printed, validation errors contain variable NAMES only, no `process.env` dumps. Live server probe on port 3113 confirmed clean startup log; process fully terminated afterwards.

**G1 findings intentionally NOT fixed (out of scope, still open, unfunded):**
- Hardcoded absolute paths remain in `apps/api/src/services/database/migration-runner.ts:18`, `apps/api/src/services/inventory/inventory-manager.ts:16`, `apps/api/src/services/deployment/phase-9-step-4-verify.ts` (a verify file). A small future gate could port them to the G1 pattern.
- `apps/api/scripts/debug-config.ts` prints the full DATABASE_URL (baseline diagnostic script).

---

## SECTION 5 — G2 DETAILS (all VERIFIED)

### Authorized cleanup (executed 2026-09-26)
- **Targets reconfirmed live before any DELETE:** 210 orphan `workflow_versions` (solution_id unresolved in `solution_architectures`), 14 `commercial_packages` chains, 5 deferred contracts (stop-conditions armed; never fired except on script bugs, which always rolled back).
- **Classification basis (read-only audit, two runs):** all 210 = verification residue — 196 `DRAFT/REUSED` Step-7 anchor rows from suite runs + 14 `APPROVED/E2E_TEST` legacy fixture rows (`origin_type='E2E_TEST'` is produced by NO production code; `change_summary='Phase 11 E2E fixture workflow version'`; companies named `Operix Phase 11 Test Company <id>` on `phase11-*.test` domains; architectures with `session_id = NULL`). All 14 packages classified `VERIFIED_TEST_RESIDUE` with multi-independent evidence. **Zero real business data.**
- **Deletion:** ONE transaction; **622 rows across 32 tables**; every statement ID-based (the only non-PK predicates, both audited: `governance_approvals.entity_type='Proposal' AND entity_id=ANY(...)`, `engagement_events.proposal_id=ANY(...)`). Order (FK-catalog-verified): payments → agreements → approvals → engagements → projects → contracts → proposal_versions → proposals → offers → pricing → **commercial_packages** → workflow_validations → **workflow_versions** → artifacts → architectures → sessions → solutions → pain/research/qualification subtree → leads → contacts → companies. No TRUNCATE, no date/status deletes.
- **In-transaction assertions: 38/38 PASS** (every target table zero, zero remaining orphans, deferred contracts intact incl. per-contract project counts, `workflow_library` unchanged, `solution_versions` = 0, 038 absent, unrelated tables unchanged). **COMMIT** then **independent fresh-connection verification** (all true). Total deleted: 622.
- **Backup (path only — NEVER restore/read into chat, contains no secrets but contains business-shape data):** `D:\OperixLabs Engine\config\backups\g2-bresidue-backup-2026-09-26T02-29-45-193Z.json` (the successful run; two earlier files from aborted attempts also exist). Outside the repo source tree; not staged, not committed.

### THE FIVE PROTECTED CONTRACTS (and their projects)
`186c5f6e-325d-423c-a43a-d99ce8505e57`, `afee3b0c-3238-4d5a-8b23-bcb0e7f50c54`, `dae46200-fd26-43ef-b720-d00dcbc4247e`, `e3c8d64c-0b1c-4c3b-84cc-9a27ccfa1ed1`, `fecd1a85-5336-4785-9b47-31231820ed22` — all `status='ACCEPTED'`, `proposal_id IS NULL`, each with exactly one project. **Untouched and protected.**

### Migration 038 (applied once, immutable)
`apps/api/migrations/038_db_contract_repair.sql`:
- **A:** `solution_versions` normalized (empty-table assertion inside the migration): `solution_id UUID NOT NULL REFERENCES solution_architectures(id) ON DELETE CASCADE`, `version INT NOT NULL`, `config_snapshot JSONB`, `UNIQUE(solution_id, version)`; legacy 001 columns (`version_number`, `json_config`, `changelog`) dropped; no FK to legacy `solutions`.
- **B:** FK `workflow_versions_solution_id_fkey` (`workflow_versions.solution_id → solution_architectures(id) ON DELETE CASCADE`) added `NOT VALID` then `VALIDATE`d; **orphan guard aborts the migration** (proved live: it aborted on 210 orphans pre-cleanup with full atomic rollback, then passed post-cleanup).
- **C:** `CREATE UNIQUE INDEX ux_commercial_packages_lead_id_solution_version_id ON commercial_packages(lead_id, solution_version_id)` (duplicate guard aborts; DB-enforced Step 7 idempotency).

### G2 verifier
`apps/api/scripts/verify-g2-db-contract.ts` (PRE/POST modes) — last result **`G2_VERIFIER: FULL PASS`**: metadata contract checks, positive inserts, **negative proofs** (FK rejects unknown solution_id; NOT NULL rejects NULL version; unique index rejects duplicate (lead_id, solution_version_id) pair — each in its own short rollback transaction, because PostgreSQL aborts a whole transaction at first error), FK-safe deletion demo (residual=0), count stability. **Documented adjustments made during G2** (now stable): hardcoded "210 rows" check replaced by "zero orphans + VALID FK" (authorized cleanup legitimately emptied the table); fixture INSERT aligned with the removed `changelog` column; negative proofs isolated per-transaction.

### Regression results at G2 close
`npx tsc --noEmit` → **exit 0** · Step 8 `run-phase-11-verify.ts` **unchanged** → **exit 0, 17 PASS, 0 FAIL** · `migrate.ts status` → 38 `[X]`, none pending.

---

## SECTION 6 — CURRENT DATABASE STATE (VERIFIED live at handover time)

| Object | Count / State |
|---|---|
| `migrations_history` | **37 rows** (001–037 minus missing-003, plus 038) — **no pending migrations** |
| `workflow_versions` | **0** — zero orphan references (FK VALID) |
| `commercial_packages` | **0** |
| `pricing_recommendations` | **0** |
| `offer_options` | **0** |
| `proposals` / `proposal_versions` | **0 / 0** |
| `commercial_agreements` | **0** |
| `payments` | **0** |
| `contracts` / `projects` | **5 / 5** (the protected five; all `proposal_id IS NULL`, ACCEPTED) |
| `solutions` | **31** (all legacy rows with NULL company — untouched baseline, out of all scopes) |
| `leads` / `contacts` / `companies` | **2 / 1 / 1** (residue of the Step 5 matching-verify chain only) |
| `workflow_match_sessions` | **1** (REVIEW_REQUIRED, Step 5 chain) — **0 ANALYZING** |
| `solution_architectures` | **1** |
| `solution_versions` | **0** — under the NEW 038 contract |
| `workflow_library` | **6,953 — READ-ONLY, never modified** |
| `governance_approvals` | 45 |
| `engagement_events` | 0 |
| **`audit_logs`** | **0 rows** — columns (live catalog): `id UUID PK default gen_random_uuid()`, `user_id UUID NULL`, `action VARCHAR(255) NOT NULL`, `entity_type VARCHAR(50) NULL`, `entity_id UUID NULL`, `timestamp TIMESTAMPTZ NULL default CURRENT_TIMESTAMP`, `details JSONB NULL`. **No correlation_id column. No indexes at all. No FKs.** Defined once in `001_init_schema.sql:390-399`. |

Key verified constraints: `contracts.proposal_id → proposals ON DELETE CASCADE`; `projects.contract_id → contracts ON DELETE CASCADE`; partial unique indexes `ux_contracts_proposal_id`, `ux_projects_contract_id`; `payments.proposal_id → proposals CASCADE`; `solution_architectures.session_id → workflow_match_sessions` (NO ACTION — delete sessions before architectures). `workflow_match_sessions.lead_id` is a plain column (no FK) — cleanups must handle sessions via lead IDs explicitly.

---

## SECTION 7 — CURRENT REPOSITORY / GIT STATE (VERIFIED at handover time)

- Branch `main`; HEAD `b0096f6` (2026-09-23). **Staged files: 0.**
- **48 modified tracked files + 1 deleted** (`apps/web/src/hooks/use-auth.ts`, baseline) and **81 untracked**. Tracked diff total **+5058 / −889**.
- **The working tree is NOT clean and must not be "cleaned".** The bulk of the modified files are **known baseline changes that predate the hardening session** (API controllers pain/qualification/requirements/research, `core/notifications/notification-system.ts`, `routes/api-router.ts`, `services/governance/approval-service.ts`, six matching engines, pain/requirements/research/qualification services, `services/projects/payment-service.ts`, all `apps/web` modifications) plus the earlier **Steps 6–8 authorized** changes (`api-router.ts` routes, `commercial-foundation-service.ts` +66/−0, `phase-11-commercial-verify.ts` +478/−185).
- **G1 files:** `M apps/api/src/config/config-manager.ts`, `?? apps/api/src/config/config-validation.ts`, `M apps/api/src/services/projects/manual-instapay-provider.ts`.
- **G2 files:** `?? apps/api/migrations/038_db_contract_repair.sql`, `?? apps/api/scripts/verify-g2-db-contract.ts`.
- **Temporary G2 files REMOVED (verified gone):** `g2-bresidue-audit-TEMPORARY-READONLY.ts`, `g2-bresidue-cleanup-TEMPORARY.ts`.
- **New file added by this handover (documentation only):** `GATES_HANDOVER.md` (this document, untracked `??`).
- Untracked inventory also includes migrations 034–037 (applied to the DB, untracked in git — baseline), Step 1–7 services/suites/runners/controllers, HANDOVER docs, `TS_ERROR_RECOVERY_PLAN.md`, `tsc-errors-after-path-fix.txt`, root-level `phase-11-commercial-verify-js.js` / `phase-5-verify.js` (legacy), `apps/web/.next`.

---

## SECTION 8 — VERIFICATION COMMANDS (authoritative; last verified results)

| Command (from `apps/api/` unless noted) | Proves | Last verified result |
|---|---|---|
| `npx tsc --noEmit` | TypeScript health (strict) | **exit 0, zero errors** |
| `npx ts-node scripts/migrate.ts status` | Applied/pending migrations | **38 × `[X]` incl. 038 — none pending** |
| `npx ts-node scripts/verify-g2-db-contract.ts` | G2 DB contract (schema + positive/negative proofs) | **`G2_VERIFIER: FULL PASS`** |
| `npx ts-node scripts/run-phase-11-verify.ts` | Step 8 E2E commercial→project regression (17 results incl. cleanup; exit 0 required) | **exit 0, 17 PASS, 0 FAIL** |
| `npx ts-node scripts/migrate.ts up` | Applies pending migrations (checksum-enforced) | last run: "Successfully applied 1 new migrations" (038) |
| `curl` boot probe pattern (`PORT=<free> npx ts-node src/index.ts`, then kill via `taskkill //F //PID`) | API boots, routes respond (no auth — any `/api/*` GET returns data: known B-01) | verified during G1 (200/404 shapes) |

Environment note: these suites require the live dev PostgreSQL (`DATABASE_URL` from `config/.env`). The shell exports `PORT=0` (harmless; 0→3000 semantics).

---

## SECTION 9 — G3 RECONNAISSANCE (complete, READ-ONLY; all VERIFIED)

### 9.1 Current AuditLogger (`apps/api/src/core/logging/audit-logger.ts`, 47 lines)
- **Console-only.** `log(entry)` builds `{...entry, timestamp: new Date()}` and `console.log('[AUDIT] <ISO> | <action> | <type>:<id>', details)`. A code comment admits persistence is not implemented.
- **Public API:** `log(entry: Omit<AuditEntry, 'timestamp'>): Promise<void>` where `AuditEntry = { userId?: string; action: string; entityType?: string; entityId?: string; timestamp: Date; details: any }` — **`details` is `any` (no schema/filtering)**.
- **Error handling:** none (no try/catch). Today it cannot fail (console). **After G3 persistence, an un-isolated DB failure would propagate into all 64 call sites** — failure isolation is mandatory (Section 13).

### 9.2 Consumers — **64 call sites across ~25 files, ALL inside `apps/api/src/services/**` (zero in controllers)**
Category inventory (file → call-site line numbers → notable facts):
- `projects/scope-manager.ts` (56,124,268,407,506,566,647) — REQUIREMENTS_*/SCOPE_BASELINE_CONFIRMED/CHANGE_REQUEST_* (7).
- `deployment/deployment-service.ts` (42,136,161,231,259,286,349) — DEPLOYMENT_*/ACTIVATION_COMPLETED (7).
- `matching/matching-orchestrator.ts` (279,305,401,446,563) — MATCHING_SESSION_CREATED/REUSED/NO_CANDIDATES/DECISION_REACHED/TRIGGER_FAILED (5).
- `projects/handover-service.ts` (100,184,273,382), `completion-service.ts` (54,144,365), `review-service.ts` (62,133,219) — HANDOVER_*/COMPLETION_*/REVIEW_*/PROJECT_ACCEPTED (10).
- `projects/commercial-foundation-service.ts` (64,129,176,224) — COMMERCIAL_PACKAGE_CREATED ×2 (create + WithClient paths), PRICING_RECOMMENDATION_CREATED, OFFER_OPTION_CREATED (4).
- `versioning/version-service.ts` (87,110,128,162) — WORKFLOW_VERSION_* + HASH_MISMATCH (4).
- `matching/matching-review-service.ts` (202) — **`MATCHING_REVIEW_${decision}`** (→ …_APPROVED / …_REJECTED), entity `WorkflowMatchSession`, actor `decidedBy` in details (1).
- `projects/agreement-service.ts` (62,148) — AGREEMENT_CREATED, **AGREEMENT_ACCEPTED** (actor `actorId` in details) (2).
- `projects/payment-service.ts` (41,79) — PAYMENT_REQUIREMENT_CREATED, **PAYMENT_SUBMITTED** (details `{submittedAmount}` only; clientReference/evidenceRef deliberately NOT in details) (2).
- `projects/payment-verification-service.ts` (101) — **PAYMENT_VERIFIED** (actor `verifiedBy`, decision, verifiedAmount) (1).
- `projects/commercial-governance-service.ts` (51) — **`COMMERCIAL_ARTIFACT_APPROVED`** (entity_type from the approval row; live DB value is `'Proposal'` capital-P), actor `userId` in details (1).
- `projects/proposal-service.ts` (90) — PROPOSAL_GENERATED (1).
- `projects/matching-commercial-handoff-service.ts` (259,317) — MATCHING_COMMERCIAL_HANDOFF_COMPLETED (replay + create paths) (2).
- Others (1 each unless noted): `pain/pain-analysis-service.ts` (2), `requirements/requirements-analysis-service.ts` (2), `orchestration/lead-lifecycle-orchestrator.ts` (2), `qualification/notification-rule-engine.ts` (2, NOTIFY_OWNER), `projects/project-service.ts` (2), `projects/engagement-service.ts` (1), `projects/commercial-engagement-intent-adapter.ts` (1), `projects/delivery-plan-service.ts` (1), `validation/validation-orchestrator.ts` (1), `qualification/human-override-service.ts` (1), `workflows/{composition-impl,customization-engine,transformation-engine}.ts` (1 each).

**Actor availability:** present inside `details` for most commercial events (decidedBy/actorId/userId/verifiedBy); **absent** for PAYMENT_SUBMITTED (no submitter identity exists in the system at all), matching-orchestrator events, and most workflow/deployment events. **No consumer has correlation or IP** (infrastructure absent — 9.4/9.5). **Sensitive-data review of all observed payloads:** no passwords/tokens/API keys/card data anywhere; only future-risk inputs are free-text `reason` fields and `clientReference`/`evidenceRef` (the latter two currently never enter details).

### 9.3 audit_logs schema
See Section 6 table. Single definition `001_init_schema.sql:390-399`. **Zero indexes, zero FKs, zero rows.** Note: `user_id` is UUID-without-FK (fine until G4 creates users).

### 9.4 Correlation infrastructure — **DOES NOT EXIST**
Repo-wide search for correlation/requestId/x-request-id/traceId/AsyncLocalStorage/cls: no request-context machinery. **`apps/api/src/middleware/` is EMPTY.** `index.ts` registers no request-id middleware. The only `correlationId` hits are business-scoped: `engagement-service.ts` uses an optional `correlationId` as an **idempotency key on its own `engagement_events.correlation_id` column** — unrelated to HTTP request context. There is **no propagation path from request → controller → service** today.

### 9.5 IP hashing — **DOES NOT EXIST**
Zero occurrences of `req.ip` / `x-forwarded-for` / `remoteAddress` / `ip_hash` / `ipHash`. Reusable primitive: `crypto.createHash('sha256')` pattern exists in 8 files (deployment/versioning contexts).

### 9.6 Absent prerequisites
**No users table, no passwords, no sessions, no roles anywhere** (grep across migrations + source; only unrelated `workflow_match_sessions`/`review_sessions`). Frontend auth is mock (Section 1). This is why 4 of the 12 planned G3 events are impossible until G4/G5.

### 9.7 Event coverage matrix (12 planned G3 events)

| EVENT | Currently logged? | Location | Actor? | Entity? | Correlation? | IP? | Gap |
|---|---|---|---|---|---|---|---|
| LOGIN_SUCCESS | NO | — | — | — | — | — | **Blocked until G4/G5** (no auth exists) |
| LOGIN_FAILED | NO | — | — | — | — | — | Blocked until G4/G5 |
| LOGOUT | NO | — | — | — | — | — | Blocked until G4/G5 |
| AUTHZ_DENIED | NO | — | — | — | — | — | Blocked until G5/G6 (no authz layer) |
| MATCHING_APPROVED | PARTIAL (as `MATCHING_REVIEW_APPROVED`) | matching-review-service.ts:202-210 | yes (decidedBy, in details) | yes (WorkflowMatchSession/sessionId) | no | no | name differs from plan; no context |
| MATCHING_REJECTED | PARTIAL (as `MATCHING_REVIEW_REJECTED`) | same call site (template) | yes | yes | no | no | same |
| PROPOSAL_APPROVED | COVERED UNDER A DIFFERENT NAME (`COMMERCIAL_ARTIFACT_APPROVED`, entity_type='Proposal') | commercial-governance-service.ts:51-56 | yes (userId) | yes | no | no | name differs; same call also covers pricing approvals |
| AGREEMENT_ACCEPTED | YES | agreement-service.ts:148-153 | yes (actorId) | yes | no | no | correlation/IP only |
| PAYMENT_SUBMITTED | YES | payment-service.ts:79-85 | **NO submitter identity exists** | yes (Payment) | no | no | actor impossible pre-G4/G5 |
| PAYMENT_VERIFIED | YES | payment-verification-service.ts:101-110 | yes (verifiedBy) | yes | no | no | correlation/IP only |
| READINESS_EVALUATED | **NO** | payment-readiness-service.ts has NO audit call at all | n/a (implicit agreementId/proposalId inputs) | implicit | no | no | **new call site required** |
| PROJECT_HANDOFF | **NO** (by this name) | commercial-project-handoff-service.ts **imports auditLogger (line 12) but never calls it** (only dead import found) | actorId available in inputs | implicit (contractId/projectId in result) | no | no | **new call site required** |

---

## SECTION 10 — G3 OPEN DESIGN DECISIONS (the human must decide; DO NOT self-resolve)

### Decision 1 — correlation storage: Option A vs Option B (factual comparison; NO choice made here)

| Criterion | **A: dedicated `correlation_id` column via migration 039** | **B: correlation inside `details` JSONB** |
|---|---|---|
| Queryability | `WHERE correlation_id = $1` directly | `details->>'correlation_id'` expression |
| Indexing | plain B-tree index | needs GIN on details or expression index (heavier) |
| Integrity | can be typed/constrained (e.g., length CHECK; NOT-NULL policies discussable) | unconstrained by nature |
| Migration cost | one `ADD COLUMN` + indexes on an **empty** table ⇒ effectively free now; one more migration file (039) | zero migration |
| Compatibility | `AuditEntry` gains an OPTIONAL field ⇒ all 64 call sites compile untouched (db proxy is schema-agnostic) | fully compatible |
| Audit usefulness | uniform, aggregatable across the whole chain | lossy (hand-written per payload; easy to omit) |
| Future observability (G8 request logs) | natural join key | weak |
| Future-migration implication | adds one applied migration to maintain | **hard to retrofit later once the table has rows** (backfill + dual-read) |

### Decision 2 — correlation propagation mechanism
New request-context middleware in the (currently empty) `apps/api/src/middleware/` + header inheritance (`x-request-id`) is the natural shape, but: **AsyncLocalStorage (node stdlib, no new dependency) vs explicit parameter threading** through services is an open choice; middleware must be mounted in `index.ts` (one line).

### Decision 3 — IP hashing design
No existing utility. Open: capture point (middleware), normalization (x-forwarded-for vs socket), salt source (env? — interacts with G1 fail-fast rules), column placement (same A/B question as correlation).

### Decision 4 — new call sites
Whether **READINESS_EVALUATED** (`payment-readiness-service.ts`) and **PROJECT_HANDOFF** (`commercial-project-handoff-service.ts`, which already imports the logger) are added **now** as part of G3.

### Decision 5 — event naming
Existing live names `MATCHING_REVIEW_APPROVED/REJECTED` and `COMMERCIAL_ARTIFACT_APPROVED` differ from the G3 plan names (`MATCHING_APPROVED`, `PROPOSAL_APPROVED`). Renaming changes persisted `action` values (and G3 verifier expectations). Keep-as-is vs alias vs rename = open.

### Decision 6 — failure-isolation semantics
Audit-write failure MUST NOT fail business operations (64 awaited call sites; Step 8 depends on several). Open details: swallow+console-error inside the logger vs explicit policy.

### Decision 7 — sensitive-details filtering contract
`details` is `any` today. Open: deny-list (password/token/secret/apiKey/authorization/card/…) enforced inside the logger, vs payload-shape allow-list, vs nothing.

### Decision 8 — scope of the 4 auth events
LOGIN_*/LOGOUT/AUTHZ_DENIED cannot exist before G4/G5. Open: explicitly defer them in G3's verifier coverage, or stub later.

---

## SECTION 11 — G3 IMPLEMENTATION PLAN (PROPOSED ONLY — **NOT AUTHORIZED**)

Every item below is **PROPOSED — NOT AUTHORIZED**. Sequence assumes Decision 1 = A where migration-dependent; reorder if B:

1. **PROPOSED — NOT AUTHORIZED:** migration `039_audit_correlation.sql` (ONLY if A): `ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS correlation_id VARCHAR(64);` + `CREATE INDEX IF NOT EXISTS idx_audit_logs_correlation ON audit_logs(correlation_id);` + `CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp);` (+ optionally `action`). Apply only via `migrate.ts up`. Rollback = drop column/indexes.
2. **PROPOSED — NOT AUTHORIZED:** request-context middleware (new file `apps/api/src/middleware/request-context.ts`; mount one line in `index.ts`; inherit `x-request-id` or mint UUID; expose via chosen propagation mechanism).
3. **PROPOSED — NOT AUTHORIZED:** rewrite `audit-logger.ts`: DB insert into `audit_logs` (+ optional correlation/ip_hash fields), **failure-isolated** (never throw into business flow), sensitive-key filtering, keep `log()` signature backward-compatible.
4. **PROPOSED — NOT AUTHORIZED:** two new call sites: `READINESS_EVALUATED` in `payment-readiness-service.ts`, `PROJECT_HANDOFF` in `commercial-project-handoff-service.ts` (if Decision 4 = yes).
5. **PROPOSED — NOT AUTHORIZED:** G3 verifier `apps/api/scripts/verify-g3-audit-logging.ts` (ts-node, `{step,status}` style, exit-code semantics): DB row assertions per event, correlation propagation proof, sensitive-data exclusion proof, **failure-isolation proof** (induce audit-write failure; business call must still succeed), fixture-in-rollback-transaction pattern (learned in G2: PostgreSQL aborts the whole transaction at first error — put expected-rejection proofs in their own short transactions).
6. **PROPOSED — NOT AUTHORIZED:** regression: `tsc --noEmit`, `migrate.ts status`, `verify-g2-db-contract.ts` (POST, FULL PASS), Step 8 suite unchanged (17/17).
7. **PROPOSED — NOT AUTHORIZED:** documentation update + final read-only review with the established report format.

**Must-NOT-touch list for G3 (from the standing rules):** `038_db_contract_repair.sql`, `verify-g2-db-contract.ts` (except explicit authorization), `phase-11-commercial-verify.ts` + Steps 1–7 suites, `workflow_library`, G1 files, contracts/projects, payment verification logic, existing event names (unless Decision 5 says rename), `migrations_history`.

---

## SECTION 12 — G4–G9 ROADMAP (verified plan only — no invented detail)

| Gate | Verified scope (from Phase 2 plan) | Dependencies |
|---|---|---|
| **G4** | Identity foundation: migration 039/040-class for `users` + `auth_sessions` (token-hash unique), `crypto.scrypt` password hashing (no new deps), `/auth` login/logout/me, bootstrap user script | after G3 (numbering) |
| **G5** | Authentication enforcement + `req.auth`; convert **10 body-sourced identity fields** in 7 controllers (exact map in Phase 2 §C; e.g. agreement-payment-controller.ts:123,227) to authenticated identity; cookie flags per environment | G4 |
| **G6** | RBAC: 3 roles (OWNER/OPERATOR/VIEWER), protected-route authorization, 403 denial + AUTHZ_DENIED audit | G5 |
| **G7** | Payment rule: `VERIFIED` only when `verifiedAmount === expected_amount` (integer minor units), PARTIAL/REJECT/mismatch semantics, verifiedBy ≠ submitter | G5/G6 context |
| **G8** | Runtime hardening: build/start scripts, health/ready endpoints, graceful shutdown (SIGTERM/SIGINT + `closeDbPool()`), unhandledRejection/Exception handlers, CORS allowlist, JSON limit, error sanitization, request logging + correlation IDs | needs G1 only; can run in parallel lane |
| **G9** | R1: `buildWhere` supports `contains`/`hasSome` (db.ts) — consumers `workflow-candidate-search.ts:46-48`; R3: SECURITY hard-gate UNKNOWN policy (`hard-gate-evaluator.ts`); flip the documented R1/R3 verification scenarios from expected-degraded to success | **last** (highest regression risk) |

---

## SECTION 13 — KNOWN TECHNICAL RISKS

1. **Audit-write failure breaking business ops** — 64 awaited `auditLogger.log` sites; persistence without failure isolation can turn any audit hiccup into commercial-flow failure (Step 8 included). Mandatory isolation (Section 11.3).
2. **Step 8 dependency on auditLogger paths** — payment/agreement/governance services call the logger inside/around their flows; any G3 change must keep Step 8 at 17/17 without editing it.
3. **Sensitive details risk** — `details: any` + future auth/IP data; a deny-list contract (Decision 7) mitigates leaking credentials into a persistent table (and logs).
4. **Correlation propagation risk** — no context infra exists; wrong choice (e.g., middleware writing headers) can leak or miss context; AsyncLocalStorage vs explicit threading must be decided consciously (Decision 2).
5. **Naming compatibility risk** — renaming existing `action` values changes the audit history semantics and verifier expectations (Decision 5).
6. **Migration numbering** — next migration is **039** regardless of which gate creates it; runner is checksum-enforced (never edit an applied file); 003 is historically absent (numbering gap is cosmetic, `migrate.ts status` sorts by name and works).
7. **Config import-cycle risk** — `config-manager.ts` is currently leaf-like; G3's logger should not import config in a way that creates cycles (dotenv side effects run at import).
8. **Protected data** — the 5 contracts/projects, the 31 legacy orphan `solutions`, the Step-5 chain rows (2 leads/1 session/1 architecture/45 approvals) are out of every scope; nothing may touch them.
9. **workflow_library immutability** — 6,953 rows; any accidental write is a critical incident.
10. **Runner/deploy quirks** — `migration-runner.ts:18` still hardcodes the absolute migrations path (works on this machine; listed for a future small gate); shell exports `PORT=0`.

---

## SECTION 14 — EXACT STARTING POINT FOR CODE CRAFT (first action = READ-ONLY)

1. **Read this file completely** (`GATES_HANDOVER.md`).
2. Verify git state: `git status --short` (expect: 48 M + 1 D + ~82 untracked incl. this file; staged 0) and `git log -1` (expect `b0096f6`).
3. Verify migrations: `cd apps/api && npx ts-node scripts/migrate.ts status` (expect 38 `[X]`, none pending).
4. Verify G1/G2: `npx tsc --noEmit` (0), `npx ts-node scripts/verify-g2-db-contract.ts` (FULL PASS), optionally the Step 8 suite (17/17) — all read-safe.
5. Inspect the G3 surfaces: `apps/api/src/core/logging/audit-logger.ts`, the consumer inventory (Section 9.2), `audit_logs` schema (Section 6), the empty `src/middleware/`.
6. **DO NOT implement anything until the Section 10 decisions are explicitly authorized by the human.**
7. Record the decisions (A/B, propagation, IP design, new call sites, naming, isolation, filtering, auth-event deferral) in the authorization message or a notes file.
8. Only then implement exactly the authorized scope per Section 11, gate-style: implement → verify (tsc + G3 verifier + G2 verifier + Step 8 regression) → read-only final review report ending with the exact status line the user specifies.

---

## SECTION 15 — DO NOT GUESS

- **If repository evidence conflicts with this handover: repository evidence wins.** STOP, report the discrepancy to the human, do NOT silently repair either side.
- **If a gate is not fully specified: do not invent requirements.** Ask for authorization/specification.
- **If a migration is required: do not create it until explicitly authorized** (and then: new numbered file, repository conventions, `migrate.ts up` only, never edit applied migrations).
- **If a cleanup seems necessary: do not execute it** — target-ID deletion requires explicit authorization, backup, one transaction, assertions (G2 pattern, Section 5).
- **Never** widen any predicate, never touch `workflow_library`, never modify Step 8 assertions or Steps 1–8 files without explicit authorization.

---

## SECTION 16 — FINAL STATUS

PROJECT_HANDOVER_COMPLETE: YES
G1: PASS
G2: PASS
G3: RECON_COMPLETE
G3_IMPLEMENTATION_AUTHORIZED: NO
G4: NOT_STARTED
G5: NOT_STARTED
G6: PASS
G7: NOT_STARTED
G8: NOT_STARTED
G9: PASS
DATABASE_MODIFIED_BY_THIS_HANDOVER: NO
SOURCE_MODIFIED_BY_THIS_HANDOVER: NO
