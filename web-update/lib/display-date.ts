// Display only: database dates and calendar comparisons remain ISO.
export function displayDate(value:unknown){return String(value??'').replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g,'$2-$3-$1');}
