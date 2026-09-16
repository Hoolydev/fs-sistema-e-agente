BEGIN;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  cnpj char(14) NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  phone text NOT NULL,
  name text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, phone)
);

CREATE TABLE IF NOT EXISTS companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  cnpj char(14) NOT NULL,
  legal_name text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, cnpj)
);

CREATE TABLE IF NOT EXISTS contact_permissions (
  contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  document_type text NOT NULL,
  PRIMARY KEY (contact_id, company_id, document_type)
);

CREATE TABLE IF NOT EXISTS certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  company_id uuid REFERENCES companies(id),
  provider text NOT NULL,
  secret_reference text NOT NULL,
  serial_number text,
  expires_at timestamptz NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS portal_authorizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  representative_cnpj char(14),
  services jsonb NOT NULL DEFAULT '[]'::jsonb,
  expires_at timestamptz,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS document_requests (
  id uuid PRIMARY KEY,
  tenant_id uuid REFERENCES tenants(id),
  contact_id uuid REFERENCES contacts(id),
  company_id uuid REFERENCES companies(id),
  source_message_id text NOT NULL UNIQUE,
  document_type text NOT NULL,
  period text NOT NULL,
  status text NOT NULL,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES document_requests(id),
  queue_job_id text NOT NULL UNIQUE,
  attempt integer NOT NULL DEFAULT 0,
  worker_id text,
  status text NOT NULL,
  started_at timestamptz,
  finished_at timestamptz,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES document_requests(id),
  storage_key text NOT NULL UNIQUE,
  filename text NOT NULL,
  mime_type text NOT NULL,
  sha256 char(64) NOT NULL,
  obtained_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  whatsapp_message_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id uuid REFERENCES tenants(id),
  request_id uuid REFERENCES document_requests(id),
  actor_type text NOT NULL,
  actor_id text,
  action text NOT NULL,
  result text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_requests_status_created
  ON document_requests(status, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_request_created
  ON audit_events(request_id, created_at);
CREATE INDEX IF NOT EXISTS idx_documents_expires
  ON documents(expires_at);

INSERT INTO schema_migrations(version)
VALUES ('001_initial')
ON CONFLICT (version) DO NOTHING;

COMMIT;
