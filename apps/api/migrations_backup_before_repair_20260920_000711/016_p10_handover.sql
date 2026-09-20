-- Migration 016: Phase 10 Handover and Support Transition
-- Implements persistence for handovers, handover items, support readiness, and support transitions.

CREATE TABLE IF NOT EXISTS handovers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    acceptance_id UUID NOT NULL, -- Reference to the final acceptance record
    scope_baseline_id UUID NOT NULL REFERENCES scope_baselines(id),
    delivery_plan_version_id UUID NOT NULL,
    solution_version_id UUID NOT NULL,
    workflow_version_id UUID NOT NULL,
    handover_version INTEGER NOT NULL DEFAULT 1,
    status VARCHAR(50) NOT NULL, -- 'DRAFT', 'PREPARING', 'READY_FOR_REVIEW', 'APPROVED', 'HANDED_OVER', 'CANCELLED'
    created_by UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    prepared_at TIMESTAMP WITH TIME ZONE,
    approved_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS handover_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    handover_id UUID NOT NULL REFERENCES handovers(id) ON DELETE CASCADE,
    category VARCHAR(50) NOT NULL, -- 'DELIVERABLE', 'DOCUMENTATION', 'ACCESS', 'SUPPORT', etc.
    title VARCHAR(255) NOT NULL,
    description TEXT,
    required BOOLEAN DEFAULT TRUE,
    status VARCHAR(50) NOT NULL, -- 'PENDING', 'READY', 'COMPLETED', 'BLOCKED'
    evidence_reference TEXT,
    owner UUID,
    completed_at TIMESTAMP WITH TIME ZONE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS support_readiness (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    handover_id UUID NOT NULL REFERENCES handovers(id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL, -- 'NOT_READY', 'READY', 'BLOCKED'
    support_mode VARCHAR(50) NOT NULL, -- 'MANUAL', 'CONTRACTED', etc.
    support_reference TEXT,
    known_limitations TEXT,
    operational_requirements TEXT,
Hescalation_reference TEXT,
    prepared_by UUID NOT NULL,
    prepared_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS support_transitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    handover_id UUID NOT NULL REFERENCES handovers(id) ON DELETE CASCADE,
    support_readiness_id UUID NOT NULL REFERENCES support_readiness(id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL, -- 'PENDING', 'COMPLETED', 'CANCELLED'
    transitioned_by UUID NOT NULL,
    transitioned_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    notes TEXT
);

-- Indexes
CREATE INDEX idx_ho_project ON handovers(project_id);
CREATE INDEX idx_hi_handover ON handover_items(handover_id);
CREATE INDEX idx_sr_project ON support_readiness(project_id);
CREATE INDEX idx_st_project ON support_transitions(project_id);
