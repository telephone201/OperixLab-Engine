# Acquisition Engine Architecture

## Overall Architecture
Operix is designed as an Intelligence and Orchestration layer that sits above a self-hosted n8n instance. It manages the business logic of lead acquisition, qualification, and solutioning, while delegating actual workflow execution to n8n.

### Core Layers
1. **Operix Command Center (Frontend):** Owner-only dashboard for managing the entire pipeline.
2. **Operix Backend (API):** Orchestrates the flow from lead acquisition to project delivery.
3. **AI Layer:** Handles research, pain analysis, requirements extraction, and workflow matching.
4. **Provider Layer:** Abstractions for LLMs, Research, Local Business discovery, Email, Calendar, and n8n.
5. **Workflow Intelligence:** Indexes the workflow library and live n8n instance to find and compose solutions.
6. **n8n Integration Layer:** Communicates with the self-hosted n8n instance for deployment and monitoring.
7. **Execution Engine (User's n8n):** The actual environment where workflows are deployed and run.

## Component Details

### Lead Acquisition & Sales
- **Lead Acquisition:** Multi-source discovery (Google Maps, Website, CSV, etc.).
- **Research & Qualification:** Automated and manual enrichment to score leads (ICP Fit, Automation Opportunity).
- **Pain & Requirements:** AI-driven analysis of business bottlenecks to extract functional requirements.
- **Workflow Matching:** Decision tree: Existing -> Composite -> Custom.
- **Commercials:** Market-based pricing intelligence and proposal generation.
- **Proposal Portal:** Secure, tokenized client view for proposal review and acceptance.

### Workflow Intelligence & n8n
- **Library Management:** Immutable storage of source workflows from the ZIP library.
- **Composition Engine:** a logic-based merge engine that analyzes I/O compatibility and dependency resolution to create composite workflows.
- **Deployment Pipeline:** Validate -> Test -> Human Approval -> Deploy -> Monitor.

### Revenue & Projects
- **Payments:** Integration with InstaPay (Manual verification).
- **Project Gates:** Hard gate requiring payment verification before project start.
- **Contracts:** Tracking of scope, terms, and change requests.

## Technology Stack (ZERO COST MODE)
- **Frontend:** React / Next.js (Local).
- **Backend:** Node.js / Python (Local).
- **Database:** PostgreSQL (Local).
- **Cache/Queue:** Redis (Local).
- **AI:** Ollama (Local) / Gemini Pro (Manual).
- **Workflows:** Self-hosted n8n.

## Security & Privacy
- **Client Isolation:** Clients never see n8n infrastructure.
- **Secret Management:** Environment variables and secure provider abstractions.
- **Audit Trails:** Full logging of lead status, pricing changes, and deployment events.
