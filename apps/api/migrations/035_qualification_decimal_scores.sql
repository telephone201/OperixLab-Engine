ALTER TABLE "qualifications"
    ALTER COLUMN "total_score" TYPE DOUBLE PRECISION
    USING "total_score"::DOUBLE PRECISION;

ALTER TABLE "score_components"
    ALTER COLUMN "score" TYPE DOUBLE PRECISION
    USING "score"::DOUBLE PRECISION;

ALTER TABLE "score_components"
    ALTER COLUMN "override_score" TYPE DOUBLE PRECISION
    USING "override_score"::DOUBLE PRECISION;
