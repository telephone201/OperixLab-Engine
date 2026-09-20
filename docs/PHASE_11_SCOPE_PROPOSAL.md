# Phase 11 Scope Proposal: Commercialization Engine

## 1. Objective
To implement the "Middle of Funnel" of the Operix lifecycle, automating the transition from a designed Solution Architecture to a funded Project.

---

## 2. Proposed In-Scope Capabilities

### A. Pricing Intelligence Engine
- **Dynamic Pricing**: Calculate solution cost based on `OriginType` (REUSE, CUSTOMIZE, COMPOSE, BUILD) and complexity.
- **Value-Based Pricing**: Ability to apply multipliers based on lead qualification scores (from Phase 5).
- **Quote Generation**: Create a formal Quote entity with line items.

### B. Proposal Generation System
- **Automated Drafting**: Use AI to generate a professional proposal based on:
  - The `Pain Analysis` (Phase 6).
  - The `Requirements Extraction` (Phase 7).
  - The `Solution Architecture` (Phase 8).
- **Template Management**: Support for multiple proposal formats.
- **Version Control**: Track iterations of the proposal.

### C. Sales Pipeline & Intent Tracking
- **Outreach Automation**: Integration with outreach providers to deliver proposals.
- **Engagement Tracking**: Monitor when proposals are opened or interacted with.
- **Intent Scoring**: Move the lead through `ENGAGEMENT` $\rightarrow$ `INTENT` $\rightarrow$ `HUMAN_SALES` based on behavior.

---

## 3. Out of Scope
- **Payment Gateway Integration**: (Phase 10 already handles the `PaymentStatus.VERIFIED` logic; Phase 11 focuses on the *request* for payment).
- **Client Portal**: A full UI for clients to sign proposals (deferred to a later "Productization" phase).
- **Production Infrastructure**: Persistent logging/API routes (should be a separate "Hardening" phase).

---

## 4. Impact Analysis

### 4.1 Database Impact
New tables required:
- `quotes`: Pricing details and line items.
- `proposals`: Proposal content, versions, and status.
- `outreach_logs`: Tracking engagement and intent.
- `sales_pipeline_stages`: State machine for the sales process.

### 4.2 API Impact
New endpoints for:
- `POST /commercial/quote`
- `POST /commercial/proposal`
- `PATCH /commercial/intent`

### 4.3 Provider Impact
Potential new providers for:
- **Email/Messaging**: For proposal delivery.
- **Document Generation**: For PDF proposal creation.

---

## 5. Final Boundary
**INPUT**: Solution Architecture $\rightarrow$ **OUTPUT**: Payment Verified (Project Start).
