# Phase 11 Step 1: Commercial Foundation

## 1. Purpose
Established the persistent data foundation for the Commercialization Engine. This step provides the containers and domain models required to transform a technical solution into a commercial offer.

## 2. Architecture
The foundation consists of three primary entities:
- **`CommercialPackage`**: The root container linking a Lead, a Solution Version, and its subsequent commercial artifacts.
- **`PricingRecommendation`**: A versioned recommendation of price based on technical and market data.
- **`OfferOption`**: A specific commercial configuration (pricing, scope, terms) that can be presented to a client.

### Relationships
`CommercialPackage` $\rightarrow$ (1:N) $\rightarrow$ `PricingRecommendation`
`CommercialPackage` $\rightarrow$ (1:N) $\rightarrow$ `OfferOption`

---

## 3. Entities & Data Model

### CommercialPackage
- **Role**: Commercial context container.
- **Key Fields**: `solutionVersionId`, `status`, `currency`.
- **Versioning**: Tracks the evolution of the commercial context.

### PricingRecommendation
- **Role**: Internal pricing logic output.
- **Key Fields**: `costFloor`, `recommendedPrice`, `pricingConfidence`, `reasoning`.
- **Integrity**: Immutable once approved (implemented in Step 3).

### OfferOption
- **Role**: Client-facing commercial configuration.
- **Key Fields**: `setupFee`, `recurringFee`, `billingCycle`, `includedScope`.
- **Scope Protection**: Uses structured arrays for `includedScope`, `optionalScope`, and `outOfScope`.

---

## 4. Implementation Details

### Persistence
Migration `018_p11_commercial_foundation.sql` creates:
- `commercial_packages`
- `pricing_recommendations`
- `offer_options`

### Service Layer
`CommercialFoundationService` provides:
- Idempotent creation of commercial packages.
- Managed creation of pricing recommendations.
- Configuration of offer options.

### Audit & Governance
- All creation events are logged via `AuditLogger`.
-- Foundational statuses (`DRAFT`, `READY_FOR_PRICING`, etc.) are established for future governance gates.

---

## 5. Future Integration Points
- **Step 2**: Will consume `OfferOption` to generate AI Proposals.
- **Step 3**: Will implement `CommercialApprovalGate` to transition `PricingRecommendation` and `OfferOption` to `APPROVED` status.
- **Step 5**: Will transition `CommercialPackage` to `COMMERCIAL_ACCEPTED` to signal payment readiness.
