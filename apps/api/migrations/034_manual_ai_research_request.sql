ALTER TABLE manual_ai_tasks
ADD COLUMN research_request_id UUID
REFERENCES research_requests(id)
ON DELETE SET NULL;
