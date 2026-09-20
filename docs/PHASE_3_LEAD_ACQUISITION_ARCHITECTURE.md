# Phase 3: Lead Acquisition Architecture

## Pipeline Overview
The lead acquisition engine transforms raw external data into validated, research-ready leads.

**Flow:** `Source` $\rightarrow$ `Raw Record` $\rightarrow$ `Normalize` $\rightarrow$ `Deduplicate` $\rightarrow$ `Validate` $\rightarrow$ `Lead`

### 1. Provider Layer
- **ManualLocalBusinessProvider:** Low-cost/Free discovery.
- **CSVImporter:** Batch imports with dynamic column mapping.
- **GooglePlacesProvider (Optional):** Official API integration.
- **ApifyProvider (Optional):** Scraper integration.

### 2. Normalization Logic
- **Company:** Removes suffixes (Ltd, LLC), extracts domain, formats phone.
- **Contact:** Lowercases emails, cleans name casing.

### 3. Deduplication Logic
- **High Confidence:** Exact Domain or Phone match.
- **Medium Confidence:** Name + City match.
- **State:** `CANONICAL` $\rightarrow$ `DUPLICATE` $\rightarrow$ `POSSIBLE_DUPLICATE`.

### 4. Validation Logic
- **Rule 1:** Must have a company name.
- **Rule 2:** Must have at least one contact method (email/phone).
- **Rule 3:** Must have a website for `READY_FOR_RESEARCH` status.

## Campaign Management
All runs are grouped by `Campaign`, tracking:
- `discovered_count`
- `valid_count`
- `duplicate_count`
- `total_cost`
