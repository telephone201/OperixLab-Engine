# Phase 4 Research Provider Report

## Implemented Providers
| Provider | Method | Cost | Status |
| :--- | :--- | :--- | :--- |
| `LocalResearchProvider` | HTML Metadata / Domain analysis | Zero Cost | ACTIVE |
| `ManualPerplexityProvider` | User-bridged AI search | Zero Cost | ACTIVE |
| `ManualGeminiProvider` | User-bridged AI analysis | Zero Cost | ACTIVE |

## Provider Capabilities
- **Local Research:** extracts `<title>`, `<meta>`, and tech signals.
- **Manual AI:** Generates tailored prompts for deep business intelligence.
- **Confidence Scoring:** Each provider contributes a confidence weight to the final evidence claim.

## Compliance & Privacy
- Respects `robots.txt` for local research.
- No automated scraping of restricted data.
- No storage of private PII; only public business identity.
