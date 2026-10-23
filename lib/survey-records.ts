// Keep original rows for audit; only the newest customer survey contributes to scores.
// Choose before installer filtering so a reassigned customer cannot count for two crews.
export const currentSurveysSQL = `SELECT DISTINCT ON (COALESCE(NULLIF(TRIM(customer_id), ''), id)) *
 FROM production.operations_surveys
 ORDER BY COALESCE(NULLIF(TRIM(customer_id), ''), id), completed_on DESC, created DESC, id DESC`;
