# Phase 7 Requirement Rules & Governance

## 1. The "What" vs "How" Boundary (Critical)
The primary objective of Phase 7 is to define the business requirement without specifying the technical implementation.

### 1.1 Forbidden Implementation Terms (Solutioning)
Any requirement containing the following terms must be rejected by the `RequirementValidator` and returned to the AI for rewrite:
- **Tools**: `n8n`, `Zapier`, `Make.com`, `AirTable`, `Google Sheets` (when specified as the *engine* rather than the *data source*).
- **Technical Patterns**: `webhook`, `JSON`, `API Key`, `REST API`, `GraphQL`, `Node`, `Workflow ID`, `Cron Job`.
- **Architecture**: `Database schema`, `Frontend`, `Backend`, `Middleware`, `Environment Variable`.

**Correct**: "The system must automatically route qualified leads to the assigned sales representative."
**Incorrect**: "The system must use an n8n webhook to send lead data to a CRM."

## 2. Evidence & Certainty Rules
Every requirement must be anchored to the research evidence provided in Phase 4 and the pains identified in Phase 6.

### 2.1 Certainty Classification
- **CONFIRMED**: The requirement is explicitly stated or directly derivable from a source URL/Snippet.
- **INFERRED**: The requirement is a logical necessity based on observed business patterns, but not explicitly stated.
- **UNKNOWN**: The requirement is a candidate but lacks supporting evidence from the research phase.

### 2.2 Traceability Chain
`Requirement` $\rightarrow$ `Evidence ID` $\rightarrow$ `Source URL/Snippet` $\rightarrow$ `Pain ID`.

## 3. Deterministic Priority Logic
Priorities are not "guessed" by the AI; they are calculated based on a weighted formula of business impact.

| Priority | Pain Severity | Commercial Signal | Logic |
| :--- | :--- | :--- | :--- |
| **MUST** | CRITICAL or HIGH | STRONG | Non-negotiable for solution viability. |
| **SHOULD** | HIGH or MEDIUM | MEDIUM | High value, but the business can function without it initially. |
| **COULD** | Any | Any/Weak | Nice-to-have or optimization. |

## 5. Zero Cost Mode Constraints
To maintain Zero Cost Mode, the system does not perform the actual requirement extraction via internal API calls to LLMs. Instead, it generates a highly structured, context-rich prompt (via `RequirementPromptGenerator`) which is then delivered to a human operator. The human operator runs this prompt through a chosen LLM (e.g., Perplexity, Gemini) and pastes the result back into the system. This ensures that the expensive reasoning process is decoupled from the system's operational cost.