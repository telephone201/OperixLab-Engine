CREATE UNIQUE INDEX IF NOT EXISTS ux_workflow_deployments_version_environment
    ON workflow_deployments(workflow_version_id, environment);
