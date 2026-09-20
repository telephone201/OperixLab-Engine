# WORKFLOW LIBRARY SEARCH ARCHITECTURE

## Search Strategy
The Operix search layer uses a hybrid approach to find the best workflow for a client's needs.

### 1. Structured Search (Deterministic)
Users can filter by:
- **Trigger:** "Find workflows triggered by a Webhook."
- **Integration:** "Find workflows using Google Sheets."
- **Category:** "Find workflows in the Sales category."

### 2. Semantic Search (Intelligence)
The system analyzes the client's requirements and matches them against the `workflow_library` using:
- **Keyword Expansion:** Mapping "qualified leads" $\rightarrow$ "lead qualification", "scoring".
- **Capability Matching:** Matching a "Requirement" (e.g., "Must send an email") to a "Capability" (e.g., `outputs` contains 'Gmail').
- **Local Embeddings (Future):** Using a local model (Ollama/Sentence-Transformers) to create vector representations of workflow purposes.

## Search Pipeline
`Client Requirement` $\rightarrow$ `Requirement Extraction` $\rightarrow$ `Query Expansion` $\rightarrow$ `Structured Filter` $\rightarrow$ `Semantic Ranking` $\rightarrow$ `Candidate List`

## Zero Cost Implementation
In Zero Cost Mode, the search engine uses:
- **SQL-based filtering** on the `workflow_library` table.
- **Keyword-based matching** on the `description` and `integrations` fields.
- **Local LLM** to rank the top 5 candidates based on a final comparison.
