-- OPERIX LABS DATABASE SCHEMA
-- Domain: Lead Acquisition
CREATE TABLE lead_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    provider VARCHAR(50) NOT NULL, -- e.g., 'google_maps', 'csv', 'manual'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(20) DEFAULT 'ACTIVE', -- 'ACTIVE', 'PAUSED', 'COMPLETED'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    domain VARCHAR(255) UNIQUE,
    industry VARCHAR(100),
    employee_count INT,
    revenue_tier VARCHAR(50),
    website TEXT,
    linkedin_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    email VARCHAR(255) UNIQUE,
    role VARCHAR(100),
    seniority VARCHAR(50),
    linkedin_url TEXT,
    is_primary_decision_maker BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
    contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
    source_id UUID REFERENCES lead_sources(id),
    campaign_id UUID REFERENCES campaigns(id),
    status VARCHAR(50) DEFAULT 'NEW', -- 'NEW', 'RESEARCHED', 'QUALIFIED', 'PAIN_ANALYZED', 'PROPOSAL_SENT', 'WON', 'LOST'
    lead_score INT DEFAULT 0,
    intent_score INT DEFAULT 0,
    intent_status VARCHAR(50) DEFAULT 'NO_SIGNAL', -- 'NO_SIGNAL', 'LOW_INTENT', 'WARM', 'HOT', 'READY_TO_BUY'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Domain: Intelligence
CREATE TABLE research (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    source VARCHAR(100),
    observed_fact TEXT NOT NULL,
    confidence FLOAT CHECK (confidence >= 0 AND confidence <= 1),
    source_type VARCHAR(50), -- 'OBSERVED', 'INFERRED', 'UNKNOWN'
    url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE qualification (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
    icp_fit_score INT,
    automation_opportunity_score INT,
    decision_maker_score INT,
    commercial_potential_score INT,
    data_confidence_score INT,
    demo_potential_score INT,
    total_score INT,
    label VARCHAR(20), -- 'PRIORITY_A', 'PRIORITY_B', 'NURTURE', 'REJECT'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE pain_analysis (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    current_process TEXT,
    pain_points TEXT,
    bottlenecks TEXT,
    manual_work_details TEXT,
    business_impact TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE requirements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    required_functions TEXT,
    optional_functions TEXT,
    inputs TEXT,
    outputs TEXT,
    integrations TEXT,
    business_rules TEXT,
    security_requirements TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Domain: Workflow Intelligence
CREATE TABLE workflow_library (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100),
    industry VARCHAR(100),
    use_cases TEXT,
    trigger TEXT,
    inputs TEXT,
    outputs TEXT,
    integrations TEXT,
    credentials_required TEXT,
    complexity INT,
    quality_score INT,
    security_notes TEXT,
    license_status VARCHAR(50),
    source_file_path TEXT,
    source_hash TEXT,
    version VARCHAR(20) DEFAULT '1.0.0',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE workflow_matches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    workflow_id UUID REFERENCES workflow_library(id) ON DELETE CASCADE,
    match_confidence FLOAT,
    reasoning TEXT,
    status VARCHAR(50) DEFAULT 'PENDING_REVIEW',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE workflow_customizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id UUID REFERENCES workflow_matches(id) ON DELETE CASCADE,
    customization_plan TEXT,
    prompt_overrides TEXT,
    logic_changes TEXT,
    status VARCHAR(50) DEFAULT 'DRAFT',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE solutions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    name VARCHAR(255),
    description TEXT,
    solution_type VARCHAR(50), -- 'EXISTING_CUSTOMIZED', 'COMPOSITE', 'CUSTOM_BUILT'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE solution_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    solution_id UUID REFERENCES solutions(id) ON DELETE CASCADE,
    version_number VARCHAR(20),
    json_config TEXT,
    changelog TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE composition_candidates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    solution_id UUID REFERENCES solutions(id) ON DELETE CASCADE,
    workflow_id UUID REFERENCES workflow_library(id) ON DELETE CASCADE,
    role VARCHAR(50), -- 'PRIMARY', 'SUPPORTING', 'DATA_TRANSFORM'
    confidence FLOAT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE composition_blueprints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    solution_id UUID REFERENCES solutions(id) ON DELETE CASCADE,
    blueprint_json TEXT,
    status VARCHAR(50) DEFAULT 'PENDING_HUMAN_REVIEW',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE composition_components (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    blueprint_id UUID REFERENCES composition_blueprints(id) ON DELETE CASCADE,
    workflow_id UUID REFERENCES workflow_library(id) ON DELETE CASCADE,
    order_index INT,
    mapping_config TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE composition_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    component_id UUID REFERENCES composition_components(id) ON DELETE CASCADE,
    source_field TEXT,
    target_field TEXT,
    transformation_logic TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Domain: Commercials
CREATE TABLE pricing_research (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    market_range_min FLOAT,
    market_range_max FLOAT,
    cost_floor FLOAT,
    target_price FLOAT,
    recommended_price FLOAT,
    confidence FLOAT,
    evidence TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE pricing_recommendations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pricing_research_id UUID REFERENCES pricing_research(id) ON DELETE CASCADE,
    recommended_price FLOAT,
    margin_analysis TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE offer_options (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    solution_id UUID REFERENCES solutions(id) ON DELETE CASCADE,
    tier_name VARCHAR(50),
    price FLOAT,
    billing_model VARCHAR(50), -- 'SETUP_MONTHLY', 'ALL_INCLUSIVE'
    scope_summary TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE proposals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    offer_option_id UUID REFERENCES offer_options(id) ON DELETE CASCADE,
    status VARCHAR(50) DEFAULT 'DRAFT', -- 'DRAFT', 'SENT', 'VIEWED', 'ACCEPTED', 'REJECTED'
    token VARCHAR(255) UNIQUE,
    expiry_date TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE proposal_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proposal_id UUID REFERENCES proposals(id) ON DELETE CASCADE,
    version_number INT,
    content_json TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE proposal_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proposal_id UUID REFERENCES proposals(id) ON DELETE CASCADE,
    event_type VARCHAR(50), -- 'OPENED', 'SECTION_VIEWED', 'CTA_CLICKED'
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB
);

CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proposal_id UUID REFERENCES proposals(id) ON DELETE CASCADE,
    amount FLOAT,
    currency VARCHAR(10) DEFAULT 'USD',
    payment_method VARCHAR(50),
    status VARCHAR(50) DEFAULT 'PAYMENT_REQUIRED', -- 'REQUIRED', 'SUBMITTED', 'PENDING_VERIFICATION', 'VERIFIED', 'REJECTED'
    reference TEXT,
    proof_attachment TEXT,
    payment_requested_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    payment_submitted_at TIMESTAMP WITH TIME ZONE,
    payment_verified_at TIMESTAMP WITH TIME ZONE,
    verified_by VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE contracts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proposal_id UUID REFERENCES proposals(id) ON DELETE CASCADE,
    commercial_model VARCHAR(50),
    payment_terms TEXT,
    minimum_commitment INT,
    scope TEXT,
    support_terms TEXT,
    status VARCHAR(50) DEFAULT 'DRAFT', -- 'DRAFT', 'SENT', 'ACCEPTED', 'EXPIRED', 'CANCELLED'
    signed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Domain: Sales & Communication
CREATE TABLE outreach (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
    channel VARCHAR(50), -- 'EMAIL', 'LINKEDIN', 'WHATSAPP', 'PHONE'
    status VARCHAR(50) DEFAULT 'SCHEDULED',
    scheduled_at TIMESTAMP WITH TIME ZONE,
    sent_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE email_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    outreach_id UUID REFERENCES outreach(id) ON DELETE CASCADE,
    thread_id TEXT,
    message_id TEXT,
    content TEXT,
    direction VARCHAR(10), -- 'INBOUND', 'OUTBOUND'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE followups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    outreach_id UUID REFERENCES outreach(id) ON DELETE CASCADE,
    sequence_number INT,
    content TEXT,
    scheduled_at TIMESTAMP WITH TIME ZONE,
    sent_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE intent_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
    event_type VARCHAR(50), -- 'COMMERCIAL_SIGNAL', 'RESPONSE_SUMMARY'
    score_impact INT,
    evidence TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE meetings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    title VARCHAR(255),
    start_time TIMESTAMP WITH TIME ZONE,
    end_time TIMESTAMP WITH TIME ZONE,
    status VARCHAR(50) DEFAULT 'SCHEDULED', -- 'SCHEDULED', 'COMPLETED', 'CANCELLED'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE meeting_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meeting_id UUID REFERENCES meetings(id) ON DELETE CASCADE,
    event_type VARCHAR(50),
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB
);

CREATE TABLE communication_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    action_type VARCHAR(50),
    recommended_by VARCHAR(50) DEFAULT 'AI',
    status VARCHAR(50) DEFAULT 'PENDING',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Domain: Operations
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id UUID REFERENCES contracts(id) ON DELETE CASCADE,
    name VARCHAR(255),
    status VARCHAR(50) DEFAULT 'READY_TO_START', -- 'READY_TO_START', 'IN_PROGRESS', 'BLOCKED', 'DELIVERED', 'COMPLETED'
    start_date TIMESTAMP WITH TIME ZONE,
    end_date TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE change_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    description TEXT,
    impact_on_timeline TEXT,
    additional_cost FLOAT,
    status VARCHAR(50) DEFAULT 'PENDING',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(50),
    priority VARCHAR(20) DEFAULT 'MEDIUM',
    message TEXT,
    entity_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    is_read BOOLEAN DEFAULT false
);

CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    action VARCHAR(255) NOT NULL,
    entity_type VARCHAR(50),
    entity_id UUID,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    details JSONB
);

CREATE TABLE api_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id VARCHAR(100),
    endpoint VARCHAR(255),
    tokens_used INT,
    requests_count INT,
    cost FLOAT,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE provider_costs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id VARCHAR(100),
    amount FLOAT,
    currency VARCHAR(10) DEFAULT 'USD',
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE manual_ai_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_type VARCHAR(50),
    provider VARCHAR(50),
    generated_prompt TEXT,
    status VARCHAR(50) DEFAULT 'READY', -- 'READY', 'COPIED', 'IN_PROGRESS', 'RESULT_SUBMITTED', 'REVIEWED', 'APPROVED', 'REJECTED'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    copied_at TIMESTAMP WITH TIME ZONE,
    result TEXT,
    result_source VARCHAR(50),
    version VARCHAR(20),
    related_entity_id UUID,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Domain: n8n Integration
CREATE TABLE n8n_workflow_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version_id UUID REFERENCES solution_versions(id) ON DELETE CASCADE,
    n8n_workflow_id VARCHAR(100),
    webhook_url TEXT,
    api_key_id VARCHAR(100),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE n8n_deployments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_link_id UUID REFERENCES n8n_workflow_links(id) ON DELETE CASCADE,
    environment VARCHAR(50) DEFAULT 'PROD',
    deployed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deployed_by VARCHAR(100),
    status VARCHAR(50) DEFAULT 'SUCCESS'
);

CREATE TABLE n8n_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deployment_id UUID REFERENCES n8n_deployments(id) ON DELETE CASCADE,
    n8n_execution_id VARCHAR(100),
    status VARCHAR(50), -- 'success', 'failed', 'running'
    start_time TIMESTAMP WITH TIME ZONE,
    end_time TIMESTAMP WITH TIME ZONE,
    error_log TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_leads_status ON leads(status);
CREATE INDEX idx_leads_intent ON leads(intent_status);
CREATE INDEX idx_companies_domain ON companies(domain);
CREATE INDEX idx_workflow_library_category ON workflow_library(category);
CREATE INDEX idx_proposals_token ON proposals(token);
CREATE INDEX idx_projects_status ON projects(status);
CREATE INDEX idx_n8n_executions_status ON n8n_executions(status);
