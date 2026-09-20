# Phase 11 Dependency Map

## 1. Upstream Dependencies (Inputs)
Phase 11 requires the following data from previous phases:
- **Phase 5 (Qualification)**: Qualification scores to drive value-based pricing.
- **Phase 6 (Pain)**: Pain clusters and impact analysis to drive proposal narratives.
- **Phase 7 (Requirements)**: Confirmed requirements to define quote line items.
- **Phase 8 (Solution)**: `OriginType` and `SolutionArchitecture` to determine base cost and technical effort.

---

## 2. Downstream Dependencies (Outputs)
Phase 11 provides the necessary preconditions for Phase 10:
- **Payment Verification**: The `Intent` and `Sales` process leads to the payment event that triggers `ProjectStartEligibilityGate`.
- **Commercial Baseline**: The `Quote` and `Proposal` establish the commercial terms that the `ScopeBaseline` (Phase 10) later formalizes.

---

## 3. Internal Dependencies
- **Pricing** $\rightarrow$ **Proposal**: A proposal cannot be generated without an approved quote.
- **Proposal** $\rightarrow$ **Outreach**: Outreach cannot occur without a finalized proposal.
- **Outreach** $\rightarrow$ **Intent**: Intent cannot be scored without engagement data from outreach.
