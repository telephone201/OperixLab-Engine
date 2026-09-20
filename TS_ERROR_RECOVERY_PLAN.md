# TypeScript Error Recovery Plan

This plan outlines the systematic approach to reducing the 289 TypeScript errors in the Operix AI Acquisition Engine API to zero.

## 1. Error Classification & Root Causes

| Group | Root Cause | Affected Files | Estimated Errors | Priority | Architectural Fix |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **1** | **Database Adapter Typings** | `src/lib/db.ts` and all callers | High | P0 | Implement a generic, type-safe Proxy-based DB interface supporting dynamic table access. |
| **2** | **Missing Dependencies** | Project-wide | Moderate | P0 | Install missing core modules (`express`, `cors`, `axios`) and their types. |
| **3** | **Express Typing** | `src/routes/*.ts`, `src/controllers/*.ts` | Moderate | P1 | Correct `Request`/`Response` annotations using Express types. |
| **4** | **Export/Import Contracts** | Cross-module boundaries | Moderate | P1 | Audit and align public exported types with their imports. |
| **5** | **Domain Enum/Type Drift** | Services and Domain models | Moderate | P2 | Align all callers to the single source of truth for domain enums. |
| **6** | **Service Contract Drift** | Service implementations vs Callers | Moderate | P2 | Synchronize method signatures and argument counts. |
| **7** | **Interface/Async Syntax** | `agreement-provider.ts`, `payment-provider.ts` | Low | P3 | Correct invalid `async` modifiers in interface declarations. |
| **8** | **Concrete Source Bugs** | `n8n-parser.ts`, `scope-manager.ts`, etc. | Low | P3 | Fix typos, duplicates, and undefined references. |
| **9** | **Domain Mapping Errors** | Mappers in services | Moderate | P2 | Implement explicit mapping between disparate domain objects. |
| **10** | **Verification/Test Drift** | `phase-*-verify.ts` | Moderate | P3 | Update verification scripts to match current service contracts. |
| **11** | **Validation/Workflow Types** | `composition-impl.ts`, `validation-orchestrator.ts` | Low | P3 | Replace implicit `any` with concrete domain types. |
| **12** | **Research Types** | `local-research-provider.ts` | Low | P3 | Resolve stale provider interface paths. |
| **13** | **Requirements/Pain Types** | `pain-analysis-service.ts` and related | Low | P3 | Export missing types and align priority/status enums. |
| **14** | **Scope/Project/Commercial** | `project-service.ts`, `commercial-foundation-service.ts` | Moderate | P2 | Align state transitions and project status types. |

## 2. Dependencies Between Fixes
1. **Group 1 (DB)** and **Group 2 (Deps)** must be solved first. Nearly all other errors depend on the DB adapter's types and basic module availability.
2. **Group 4 (Exports)** must precede **Group 5 & 6** to ensure types are available for alignment.
3. **Group 10 (Tests)** is the final step as they depend on all other service contract fixes.

## 3. Safe Zones (Do NOT Modify)
*   **Applied Migrations**: `apps/api/migrations/*.sql` (Immutable).
*   **Business Logic**: Do not change the *behavior* of services to satisfy the compiler.
*   **DB Adapter Core**: Do not restore the backup `db.ts.backup-2026-09-20`.

## 4. Verification Process
After each group repair, the following command will be executed:
`npx tsc --noEmit`

## 5. Execution Order
1. `db.ts` Typing $\rightarrow$ DB Import Paths $\rightarrow$ Transaction Compatibility.
2. Missing npm dependencies $\rightarrow$ `npm install`.
3. Express typing.
4. Module exports/imports.
5. Enum/type drift.
6. Service method contract drift.
7. Invalid interfaces / async declarations.
8. Concrete source bugs and typos.
9. Domain mapping functions.
10. Verification/test files.
11. Validation/workflow typing.
12. Remaining isolated errors.
