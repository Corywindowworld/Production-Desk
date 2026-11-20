CREATE TABLE IF NOT EXISTS production.bonus_snapshots (
  period_end date PRIMARY KEY,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
