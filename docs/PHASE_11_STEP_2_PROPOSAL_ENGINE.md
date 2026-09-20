# Phase 11 Step 2: Proposal Engine

## 1. Purpose
The Proposal Engine transforms the structured commercial foundation (Package, Pricing, Offer) into a client-facing, professional proposal. It ensures that all claims are grounded in approved source data and that no internal Operix technical details are leaked to the client.

## 2. Architecture

### 2.1 Proposal Lifecycle
`CommercialPackage` $\rightarrow$ `ProposalGenerator` $\rightarrow$ `ProposalVersion` $\rightarrow$ `Deterministic Validator` $\rightarrow$ `Proposal (GENERATED)`.

### 2.2 Generation Pipeline
1. **Context Assembly**: Gathers approved data from Phase 5 (Qualification), 6 (Pain), 7 (Requirements), 8 (Solution), and Phase 11 Step 1 (Pricing/Offer).
2. **AI-Assisted Drafting**: Uses a provider-agnostic generator to create a structured `ProposalContent` object.
3. **Template Fallback**: In `ZERO_COST_MODE`, a deterministic template is used to ensure reliability without external APIs.
4. **Content Validation**: A deterministic check for forbidden internal terms (e.g., "n8n", "API key").
5. **Persistence**: Saves the proposal and its specific version, linking back to the exact source versions used.

---

## 3. Domain Model

### Proposal
The root entity for a client proposal.
- `proposalId`: UUID
- `commercialPackageId`: UUID (FK)
- `status`: `ProposalStatus` (DRAFT $\rightarrow$ GENERATED $\rightarrow$ ...)
- `version`: Current active version.

### ProposalVersion
An immutable snapshot of a specific proposal draft.
- `proposalVersionId`: UUID
- `content`: `ProposalContent` (JSONB)
- `sourceVersions`: references to the exact `solutionVersionId`, `requirementsVersionId`, etc.
- `contentHash`: SHA-256 of the structured content.

### ProposalContent
A structured model to avoid giant HTML blobs:
- `introduction`, `companyUnderstanding`, `painSummary`, `requirementsSummary`, `recommendedSolution`, `expectedImpact`, `scope` (included/optional/out), `commercialOptions`, `terms`, `faq`, `nextSteps`.

---

## 4. AI Governance & Safety

### 4.1 Forbidden Content
The `ProposalService` implements a strict blacklist for content. Any proposal containing internal terminology (n8n, workflow IDs, internal scores) is automatically rejected.

### 4.2 Factual Grounding
The generator is restricted to using provided context. It is forbidden from inventing:
- Pricing values (must use `OfferOption`).
- Technical capabilities (must use `SolutionArchitecture`).
- Business results (must use `PainAnalysis` evidence).

---

## 5. Integration Points

- **Upstream**: Consumes `CommercialPackage`, `PricingRecommendation`, and `OfferOption` from Step 1.
- **Downstream**: Produces a `Proposal` in `GENERATED` status, which will be consumed by the `CommercialApprovalGate` in Step 3.

---

## 6. Implementation Details

### Persistence
Migration `019_p11_proposal_engine.sql` creates:
- `proposals`
- `proposal_versions`
- `proposal_generation_runs`

### Service Layer
- `ProposalGenerator`: Handles the transformation of context $\rightarrow$ content.
- `ProposalService`: Handles the orchestration, validation, and persistence.

---

## 7. Known Limitations
- **Rendering**: Currently produces structured JSON content. Final HTML/PDF rendering is deferred to a future UI/Portal phase.
- **Manual AI Bridge**: The "Manual AI Task" generation is conceptual; the service currently supports deterministic fallback.
