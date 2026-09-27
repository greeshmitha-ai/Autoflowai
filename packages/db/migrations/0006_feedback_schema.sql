-- Feedback Engine schema migration
-- Creates surveys and survey_responses tables

CREATE TYPE survey_status AS ENUM ('draft', 'published', 'closed');
CREATE TYPE sentiment_type AS ENUM ('positive', 'neutral', 'negative');

-- Surveys table
CREATE TABLE IF NOT EXISTS surveys (
  survey_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(tenant_id),
  name        VARCHAR(255) NOT NULL,
  questions   JSONB NOT NULL DEFAULT '[]',
  status      survey_status NOT NULL DEFAULT 'draft',
  share_link  VARCHAR(2048),
  embed_code  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Survey responses table
CREATE TABLE IF NOT EXISTS survey_responses (
  response_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id    UUID NOT NULL REFERENCES surveys(survey_id),
  tenant_id    UUID NOT NULL REFERENCES tenants(tenant_id),
  contact_id   UUID REFERENCES contacts(contact_id),
  answers      JSONB NOT NULL DEFAULT '{}',
  sentiment    sentiment_type NOT NULL DEFAULT 'neutral',
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_surveys_tenant ON surveys(tenant_id);
CREATE INDEX IF NOT EXISTS idx_surveys_tenant_status ON surveys(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_survey_responses_survey ON survey_responses(survey_id);
CREATE INDEX IF NOT EXISTS idx_survey_responses_tenant ON survey_responses(tenant_id);
CREATE INDEX IF NOT EXISTS idx_survey_responses_contact ON survey_responses(contact_id);
