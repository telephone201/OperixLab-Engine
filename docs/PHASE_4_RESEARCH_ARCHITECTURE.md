# Phase 4 Research Architecture

## Research Engine Design
The research engine transforms a validated lead into a high-fidelity business intelligence profile using an evidence-based approach.

### The Research Pipeline
`Validated Lead` $\rightarrow$ `Research Request` $\rightarrow$ `Discovery` $\rightarrow$ `Evidence Extraction` $\rightarrow$ `Structured Research` $\rightarrow$ `Gap Analysis` $\rightarrow$ `Confidence Assessment`.

### Provider Tiers (Zero Cost Mode)
1. **Local Research Provider:** Performs lightweight HTML metadata analysis and domain checks.
2. **Manual AI Provider (Perplexity/Gemini):** Generates a structured prompt for the user. The user performs the search and pastes the results back.
3. **Internal Evidence Engine:** Links every claim to a source URL and a confidence level.

## Evidence Model
Every research claim is stored as an `EvidenceClaim`:
- **Observed:** Directly seen on a website or in a source.
- **Inferred:** Derived from other facts (e.g., "Uses Shopify" $\rightarrow$ "Is an E-commerce business").
- **Unknown:** Specifically marked as missing to trigger further research.

## Gap Analysis
The system maintains a "Critical Information Checklist" (Decision Maker, CRM, Business Model, etc.). Any missing field is marked as `NEEDS_RESEARCH`.
