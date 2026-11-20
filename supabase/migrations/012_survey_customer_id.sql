-- Link Guild Quality surveys directly to Production Desk jobs by Customer ID.
BEGIN;

ALTER TABLE production.operations_surveys
  ADD COLUMN IF NOT EXISTS customer_id text;

UPDATE production.operations_surveys
SET customer_id = (regexp_match(external_id, '^gq:C[0-9]+:([0-9]+):[0-9]{4}-[0-9]{2}-[0-9]{2}$'))[1]
WHERE (customer_id IS NULL OR btrim(customer_id) = '')
  AND external_id ~ '^gq:C[0-9]+:[0-9]+:[0-9]{4}-[0-9]{2}-[0-9]{2}$';

CREATE INDEX IF NOT EXISTS operations_surveys_customer_id
  ON production.operations_surveys(customer_id);

COMMIT;
