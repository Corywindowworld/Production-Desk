// Display only: database dates and calendar comparisons remain ISO.
export function displayDate(value:unknown){return String(value??'').replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g,'$2-$3-$1');}

export function displayBonusDate(value:unknown){const raw=String(value??'');if(!/^\d{4}-\d{2}-\d{2}$/.test(raw))return raw;const date=new Date(raw+'T12:00:00Z');if(Number.isNaN(date.getTime()))return raw;return new Intl.DateTimeFormat('en-US',{month:'long',timeZone:'UTC'}).format(date)+' '+raw.slice(8)+' '+raw.slice(0,4);}
