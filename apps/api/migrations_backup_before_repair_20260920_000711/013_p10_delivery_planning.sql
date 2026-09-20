-- Migration 013: Phase 10 Delivery Planning
-- Implements persistence for delivery plans, milestones, and tasks.

CREATE TABLE IF NOT EXISTS delivery_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    solution_architecture_id UUID NOT NULL,
    solution_version_id UUID NOT NULL,
    workflow_version_id UUID NOT NULL,
    plan_version INTEGER NOT NULL DEFAULT 1,
    status VARCHAR(50) NOT NULL, -- 'DRAFT', 'READY', 'ACTIVE', 'COMPLETED', 'ARCHIVED'
    planning_rules_version VARCHAR(50) NOT NULL,
    created_by UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(project_id, solution_version_id, workflow_version_id, plan_version)
);

CREATE TABLE IF NOT EXISTS delivery_milestones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id UUID NOT NULL REFERENCES delivery_plans(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL, -- 'PROJECT_INITIALIZATION', 'REQUIREMENTS_CONFIRMATION', etc.
    title VARCHAR(255) NOT NULL,
    description TEXT,
    order_index INTEGER NOT NULL,
    status VARCHAR(50) NOT NULL, -- 'PENDING', 'IN_PROGRESS', 'COMPLETED'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS delivery_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    plan_id UUID NOT NULL REFERENCES delivery_plans(id) ON DELETE CASCADE,
    milestone_id UUID NOT NULL REFERENCES delivery_milestones(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    task_type VARCHAR(50) NOT NULL, -- 'INTERNAL', 'TECHNICAL', 'REVIEW', etc.
    status VARCHAR(50) NOT NULL, -- 'PENDING', 'READY', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED', 'CANCELLED'
    priority VARCHAR(20) NOT NULL, -- 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'
    owner UUID,
    due_date TIMESTAMP WITH TIME ZONE,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    evidence TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS delivery_task_dependencies (
    task_id UUID NOT NULL REFERENCES delivery_tasks(id) ON DELETE CASCADE,
    depends_on_task_id UUID NOT NULL REFERENCES delivery_tasks(id) ON DELETE CASCADE,
    PRIMARY KEY (task_id, depends_on_task_id),
    CHECK (task_id <> depends_on_task_id)
);

CREATE TABLE IF NOT EXISTS delivery_milestone_dependencies (
    milestone_id UUID NOT NULL REFERENCES delivery_milestones(id) ON DELETE CASCADE,
    depends_on_milestone_id UUID NOT NULL REFERENCES delivery_milestones(id) ON DELETE CASCADE,
    PRIMARY KEY (milestone_id, depends_on_milestone_id),
    CHECK (milestone_id <> depends_on_milestone_id)
);

-- Indexes for performance
CREATE INDEX idx_dp_project ON delivery_plans(project_id);
CREATE INDEX idx_dm_plan ON delivery_milestones(plan_id);
CREATE INDEX idx_dt_plan ON delivery_tasks(plan_id);
CREATE INDEX idx_dt_milestone ON delivery_tasks(milestone_id);
