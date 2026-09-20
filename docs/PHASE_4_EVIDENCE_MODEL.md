# Phase 4 Evidence Model

## Evidence Structure
Every claim in the research summary is backed by a record in the `research_evidence` table.

| Field | Description |
| :--- | :--- |
| `evidence_id` | Unique identifier. |
| `research_id` | Link to the research version. |
| `source_url` | The exact URL where the fact was found. |
| `evidence_text` | The original text snippet from the source. |
| `confidence` | 0.0 to 1.0 based on source reliability. |
| `type` | `OBSERVED` / `INFERRED` / `UNKNOWN`. |

## Confidence Hierarchy
1. **Official Website (High):** Direct claim on the company's own site.
2. **Public Listing (Medium):** Verified business directory.
3. **AI Synthesis (Low/Medium):** Inferred from multiple sources via Perplexity/Gemini.
4. **Unknown (Zero):** Not found in any source.
