# Phase 6 Architecture: Pain Analysis & Problem Intelligence

## 1. Overview
Phase 6 transforms validated research evidence into a structured understanding of business problems. It bridges the gap between "What we know about the company" (Phase 4) and "What we will build for them" (Phase 7+).

## 2. The Pain Intelligence Model
The system avoids subjective AI labels in favor of an evidence-based model.

### 2.1 Pain Entity
- **Taxonomy**: Controlled categories (e.g., `LEAD_MANAGEMENT`, `DATA_ENTRY`) to ensure consistency.
- **Evidence Level**: `OBSERVED` (Direct), `INFERRED` (Suggested), `UNKNOWN` (Insufficient).
- **Severity**: `LOW` $\rightarrow$ `CRITICAL`.
- **Frequency**: `RARE` $\rightarrow$ `CONTINUOUS`.
- **Automation Relevance**: `LOW` $\rightarrow$ `HIGH`.

### 2.2 Evidence Chain
`Research Evidence` $\rightarrow$ `Candidate Pain` $\rightarrow$ `Truth Classification` $\rightarrow$ `Impact Analysis` $\rightarrow$ `Confidence Score`.

## 3. Deterministic Logic
To prevent fabrication, the system uses a strict priority and impact model.

### 3.1 Priority Calculation
`Priority = (Severity * 0.4) + (Frequency * 0.3) + (Confidence * 0.3)`
This ensures the "Primary Pain" is based on operational impact, not AI preference.

### 3.2 Impact Model
- **Operational**: Focuses on `TIME`, `ERROR_RISK`, `STAFF_EFFORT`.
- **Commercial**: Focuses on `LOST_OPPORTUNITY`, `SALES_DELAY`.
- **Customer**: Focuses on `RESPONSE_DELAY`, `INCONSISTENT_SERVICE`.

## 4. Human-in-the-Loop
All AI-generated pains are `DRAFT` by default.
- **Review Process**: Human reviewers can approve, reject, or edit pains.
- **Audit Trail**: Every change is logged via `AuditLogger` using the `HumanOverrideService` pattern.

## 5. Zero Cost Mode
Pain analysis uses a "User-as-Bridge" manual AI workflow.
- **Prompting**: The `PainAnalysisPromptGenerator` creates structured prompts that explicitly forbid fabricating metrics and require source citations.
- **Manual Bridge**: Users copy prompts to Perplexity/Gemini and return the results to the system.

## 6. Phase Boundaries
- **Input**: Consumes Research and Qualification data.
- **Output**: A validated set of prioritized business pains.
- **Strict Boundary**: NO requirements extraction, NO workflow matching.
