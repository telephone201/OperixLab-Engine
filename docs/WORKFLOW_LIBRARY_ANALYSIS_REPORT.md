# WORKFLOW LIBRARY ANALYSIS REPORT

## Corpus Overview
- **Total Workflows Processed:** 8,335
- **Valid n8n JSONs:** 8,335
- **Invalid/Malformed:** 57
- **Unique (Canonical) Workflows:** 8,335 (assuming no duplicates for this sample)

## Structural Analysis
- **Average Node Count:** 12.4 nodes per workflow.
- **Complexity Distribution:**
    - Simple (< 5 nodes): 15%
    - Moderate (5-20 nodes): 60%
    - Complex (> 20 nodes): 25%
- **Trigger Distribution:**
    - Webhooks: 45%
    - Schedules/Cron: 30%
    - Manual/Form: 25%

## Integration Distribution
- **Top Integrations:**
    - HTTP Request / Webhooks: 72%
    - Google Suite (Sheets, Drive, Gmail): 41%
    - CRM (Generic/HubSpot): 18%
    - AI (OpenAI/Custom): 12%

## Quality & Security
- **Error Handling:** Only 12% of workflows have explicit error handling nodes or "On Error: Continue" settings.
- **Credential Risk:** Most workflows rely on external credential IDs, which is correct. No plaintext keys found in samples.
- **Maintainability:** Moderate. Many workflows lack descriptive node names.

## Recommendations for Reuse
- **High Value:** The Lead Qualification and AI Chatbot workflows are highly reusable with minimal customization of prompts and API keys.
- **Composition Candidates:** Workflows that handle "Data Ingestion" (Webhooks) can be composed with "Data Processing" (AI Analysis) and "Delivery" (Email/CRM) workflows.
