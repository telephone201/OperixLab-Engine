# Phase 11 Detailed Design: Commercialization Engine

## 1. Executive Summary
The Commercialization Engine is the critical bridge between the **Designed Solution (Phase 8)** and the **Funded Project (Phase 10)**. It transforms a technical solution into a commercially viable offer, manages the sales engagement process, and establishes the financial readiness required to trigger project activation.

**Objective**: To automate the transition from "What we can build" to "What the client pays for," ensuring total traceability, human governance, and commercial integrity.

---

## 2. Existing Repository Findings
The audit of the existing repository reveals:
- **Phase 5 (Qualification)**: Implements an `IntentManager` with a state machine (`NO_SIGNAL` $\rightarrow$ `LOW_INTENT` $\rightarrow$ `WARM` $\rightarrow$ `HOT`). This is the authoritative intent system.
- **Phase 8 (Solution)**: Produces `SolutionArchitecture` and `SolutionVersion` with an `OriginType` (REUSE, CUSTOMIZE, COMPOSE, BUILD).
- **Phase 10 (Project)**: Uses a `ProjectStartEligibilityGate` that requires `PaymentStatus.VERIFIED` and a linked `contract_id`.
- **Governance**: A `HumanApprovalService` and `ApprovalGate` exist in `apps/api/src/services/governance`, providing a reusable pattern for sign-offs.
- **Core**: `AuditLogger` and `CostTracker` are available for system-wide traceability and metrics.

---

## 3. Exact Boundary

### In-Scope
- **Pricing Intelligence**: Determining cost floors and recommended pricing.
- **Offer Construction**: Defining commercial options (e.g., Core vs. Premium).
- **Proposal Generation**: AI-driven drafting of client-facing documents.
- **Proposal Governance**: Versioning and human approval of proposals.
- **Engagement Tracking**: Capturing client interactions with proposals.
- **Intent Integration**: Feeding commercial events into the Phase 5 Intent Engine.
- **Commercial Agreement**: Finalizing the offer into a binding agreement.
- **Payment Readiness**: Generating the requirements for payment verification.

### Out-of-Scope
- **Payment Verification**: (Owned by Phase 10 Step 2).
- **Project Start Authorization**: (Owned by Phase 10 Step 2).
- **Technical Implementation**: (Owned by Phase 9).
- **Lead Research/Qualification**: (Owned by Phases 3-5).

---

## 4. Architecture

### 4.1 High-Level Flow
`Approved Solution` $\rightarrow$ `Pricing Recommendation` $\rightarrow$ `Offer Options` $\rightarrow$ `Proposal Draft` $\rightarrow$ `Human Approval` $\rightarrow$ `Client Delivery` $\rightarrow$ `Engagement Tracking` $\rightarrow$ `Commercial Agreement` $\rightarrow$ `Payment Readiness` $\rightarrow$ `Phase 10 Gate`.

### 4.2 Service Boundaries
The engine is decomposed into discrete services to avoid monolithization:

1. **`PricingIntelligenceService`**: Calculates cost floors and recommends prices based on `OriginType` and complexity.
2. **`OfferService`**: Constructs the commercial options (included/excluded items, recurring fees).
3. **`ProposalService`**: Manages proposal versions, states, and retrieval.
4. **`ProposalGenerator`**: AI-driven content creation ( Provider-agnostic).
5. **`EngagementService`**: Ingests client events and updates the `IntentManager` (Phase 5).
6. **`CommercialGovernanceService`**: Manages `HumanApproval` for pricing and proposals.
7. **`CommercialAgreementService`**: Finalizes the offer into a contract/agreement record.

---

## 5. Domain Model

### 5.1 The Commercial Package (`CommercialPackage`)
The central entity that aggregates all commercial data for a specific lead/solution.

- `commercialPackageId`: UUID (PK)
- `leadId`: UUID (FK to Phase 3/4)
- `solutionVersionId`: UUID (FK to Phase 8)
- `pricingVersionId`: UUID (FK to `PricingRecommendation`)
- `offerVersionId`: UUID (FK to `OfferOption`)
- `proposalVersionId`: UUID (FK to `Proposal`)
- `status`: `CommercialPackageStatus`
- `currency`: String (e.g., 'USD')
- `validUntil`: Date
- `createdAt`/`updatedAt`: Date
- `createdBy`/`approvedBy`: UUID

### 5.2 Pricing Recommendation (`PricingRecommendation`)
- `pricingId`: UUID (PK)
- `commercialPackageId`: UUID (FK)
- `costFloor`: Decimal
- `recommendedPrice`: Decimal
- `marketConfidence`: `LOW` | `MEDIUM` | `HIGH`
- `reasoning`: Text (Internal only)
- `evidenceRefs`: String[]
- `version`: Integer

### 5.3 Offer Option (`OfferOption`)
- `offerId`: UUID (PK)
- `commercialPackageId`: UUID (FK)
- `optionName`: String (e.g., 'Standard', 'Accelerated')
- `setupFee`: Decimal
- `recurringFee`: Decimal
- `billingCycle`: `MONTHLY` | `ANNUAL`
- `includedScope`: String[] (References to Requirements/Solution)
- `excludedScope`: String[]
- `supportTerms`: Text

### 5.4 Proposal (`Proposal`)
- `proposalId`: UUID (PK)
- `offerId`: UUID (FK)
- `version`: Integer
- `content`: JSONB (Structured sections: Introduction, Impact, Pricing, etc.)
- `status`: `ProposalStatus`
- `deliveryToken`: String (Randomized token for client portal)
- `contentHash`: String (SHA-256)

---

## 6. State Machines

### 6.1 Commercial Package State Machine
`DRAFT` $\rightarrow$ `PRICING_PENDING` $\rightarrow$ `PRICING_APPROVED` $\rightarrow$ `OFFER_READY` $\rightarrow$ `PROPOSAL_DRAFT` $\rightarrow$ `READY_TO_SEND` $\rightarrow$ `SENT` $\rightarrow$ `NEGOTIATION` $\rightarrow$ `COMMERCIAL_ACCEPTED` $\rightarrow$ `PAYMENT_READY` $\rightarrow$ `COMMERCIAL_COMPLETED`.

### 6.2 Proposal State Machine
`DRAFT` $\rightarrow$ `UNDER_REVIEW` $\rightarrow$ `APPROVED` $\rightarrow$ `SENT` $\rightarrow$ `VIEWED` $\rightarrow$ `ACCEPTED` $\rightarrow$ `EXPIRED` | `REVOKED`.

---

## 7. Pricing Architecture

### 7.1 The Pricing Engine
Pricing is a **recommendation**, not an automatic decision.

**Formula Logic**:
`Base Cost (per OriginType)` $\times$ `Complexity Multiplier` $+$ `Risk Premium` $=$ `Cost Floor`.
`Cost Floor` $\times$ `Value Multiplier (from Phase 5 Qualification)` $=$ `Recommended Price`.

**OriginType Weights**:
- `REUSED`: Low effort, high margin.
- `CUSTOMIZED`: Medium effort.
- `COMPOSED`: Medium-High effort.
- `CUSTOM_BUILT`: High effort, high risk.

---

## 8. Proposal Architecture & AI Governance

### 8.1 Generation Pipeline
`CommercialPackage` $\rightarrow$ `ContextBuilder` (Gathering Pain, Req, Solution) $\rightarrow$ `LLMProvider` $\rightarrow$ `Draft Proposal` $\rightarrow$ `Deterministic Validator` $\rightarrow$ `Human Approval`.

### 8.2 AI Boundaries
- **Allowed**: Drafting a professional narrative, summarizing pains, formatting the offer.
- **Forbidden**: Inventing features, modifying the `recommendedPrice`, creating guarantees not in the `SolutionArchitecture`, inventing customer references.

---

## 9. Engagement & Intent Integration

### 9.1 The Feedback Loop
Phase 11 provides **Evidence** to the Phase 5 `IntentManager`.

**Commercial Events $\rightarrow$ Intent Signals**:
- `PROPOSAL_OPENED` $\rightarrow$ `WARM` signal.
- `PRICING_VIEWED` $\rightarrow$ `HOT` signal.
- `MEETING_BOOKED` $\rightarrow$ `HOT` signal.
- `COMMERCIAL_ACCEPTED` $\rightarrow$ `READY_TO_BUY` signal.

---

## 10. Commercial Governance

### 10.1 Governance Gates
No commercial artifact may move to `SENT` without:
1. **`CommercialApprovalGate`**: Verifies that the pricing and proposal have been approved by a human authorized user.
2. **`StalenessCheck`**: Verifies that the `SolutionVersion` hasn't changed since the proposal was drafted.

---

## 11. Payment Handoff

When a `CommercialPackage` reaches `COMMERCIAL_ACCEPTED`, the system generates a `PaymentReadiness` record:
- `amountDue`: Decimal
- `paymentTerms`: Text
- `currency`: String
- `agreementReference`: UUID (CommercialAgreement)

This record is the primary input for the Phase 10 `ProjectStartEligibilityGate`.

---

## 12. Database Design (Proposed)

| Table | Purpose | Key FKs | Versioned? |
| :--- | :--- | :--- | :---: |
| `commercial_packages` | Root commercial entity | `lead_id`, `solution_version_id` | Yes |
| `pricing_recommendations` | Price calculations | `commercial_package_id` | Yes |
| `offer_options` | Commercial tiers | `commercial_package_id` | Yes |
| `proposals` | Client-facing content | `offer_id` | Yes |
| `proposal_events` | Engagement tracking | `proposal_id` | No |
| `commercial_agreements` | Final signed terms | `commercial_package_id` | Yes |

---

## 13. API Design (Proposed)

| Endpoint | Method | Purpose | Guard |
| :--- | :---: | :--- | :--- |
| `/commercial/package` | `POST` | Create new package | `SolutionApproved` |
| `/commercial/pricing` | `POST` | Generate recommendation | `PackageDraft` |
| `/commercial/pricing/approve` | `PATCH` | Human sign-off on price | `AuthorizedUser` |
| `/commercial/proposal` | `POST` | Generate AI draft | `PricingApproved` |
| `/commercial/proposal/approve` | `PATCH` | Human sign-off on proposal | `AuthorizedUser` |
| `/commercial/proposal/send` | `POST` | Deliver to client | `ProposalApproved` |
| `/commercial/engagement` | `POST` | Ingest event (from portal) | `ValidToken` |

---

## 14. Zero-Cost & Production Mode

- **Zero-Cost Mode**: Uses local deterministic pricing rules, Ollama/Local LLM for proposals, and manual payment verification (InstaPay).
- **Production Mode**: Supports integration with external Pricing APIs, OpenAI/Claude for proposals, and Stripe/Paymob for payments.

---

## 15. Implementation Sequence

### Step 1: Commercial Foundation
- Data models for `CommercialPackage`, `PricingRecommendation`, and `OfferOption`.
- Base `PricingIntelligenceService` (Rule-based).

### Step 2: Proposal Engine
- `ProposalGenerator` integration with `LLMProvider`.
- `Proposal` state machine and versioning.

### Step 3: Governance & Approval
- `CommercialApprovalGate` and integration with `HumanApprovalService`.
- Staleness detection logic.

### Step 4: Engagement & Intent
- `EngagementService` and event ingestion.
- Integration with Phase 5 `IntentManager`.

### Step 5: Commercial Agreement & Handoff
- `CommercialAgreement` finalization.
- `PaymentReadiness` output for Phase 10.

### Step 6: Verification Suite
- E2E test: `Solution` $\rightarrow$ `Price` $\rightarrow$ `Proposal` $\rightarrow$ `Acceptance` $\rightarrow$ `Payment Readiness`.

---

## 16. Final Design Review
1. **Duplicating Phase 5?** No. Phase 5 owns *Intent State*; Phase 11 provides *Commercial Evidence*.
2. **Duplicating Phase 8?** No. Phase 8 owns *Technical Solution*; Phase 11 owns *Commercial Offer*.
3. **Duplicating Phase 10?** No. Phase 11 owns *Payment Readiness*; Phase 10 owns *Payment Verification* and *Project Start*.
4. **AI Inventing Prices?** No. AI suggests; human approves.
5. **Automatic Project Start?** No. Handsoff to Phase 10 Step 2.
6. **Zero-Cost Compatible?** Yes. Uses provider abstractions.

**STATUS: PHASE_11_DESIGN_COMPLETE_READY_FOR_IMPLEMENTATION**
