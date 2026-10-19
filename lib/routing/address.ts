export type AddressSuggestion = { street: string; city: string; state: string; zip: string; formatted: string; latitude: number; longitude: number; source: 'OpenStreetMap' };
const states = Object.fromEntries('AL:Alabama|AK:Alaska|AZ:Arizona|AR:Arkansas|CA:California|CO:Colorado|CT:Connecticut|DE:Delaware|FL:Florida|GA:Georgia|HI:Hawaii|ID:Idaho|IL:Illinois|IN:Indiana|IA:Iowa|KS:Kansas|KY:Kentucky|LA:Louisiana|ME:Maine|MD:Maryland|MA:Massachusetts|MI:Michigan|MN:Minnesota|MS:Mississippi|MO:Missouri|MT:Montana|NE:Nebraska|NV:Nevada|NH:New Hampshire|NJ:New Jersey|NM:New Mexico|NY:New York|NC:North Carolina|ND:North Dakota|OH:Ohio|OK:Oklahoma|OR:Oregon|PA:Pennsylvania|RI:Rhode Island|SC:South Carolina|SD:South Dakota|TN:Tennessee|TX:Texas|UT:Utah|VT:Vermont|VA:Virginia|WA:Washington|WV:West Virginia|WI:Wisconsin|WY:Wyoming|DC:District of Columbia'.split('|').map(s => { const [code, name] = s.split(':'); return [name.toLowerCase(), code]; }));
export const addressKey = (j: any) => [j.address, j.city, j.state, j.zip].map(v => String(v || '').trim().toLowerCase().replace(/\s+/g, ' ')).join('|');
export function photonAddresses(data: any): AddressSuggestion[] {
  const seen = new Set<string>();
  return (Array.isArray(data?.features) ? data.features : []).flatMap((f: any) => {
    const p = f?.properties || {}, [longitude, latitude] = f?.geometry?.coordinates || [];
    if (String(p.countrycode || '').toUpperCase() !== 'US' || !p.street || !p.housenumber || !Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return [];
    const stateName = String(p.statecode || p.state || ''), state = states[stateName.toLowerCase()] || (/^[A-Z]{2}$/.test(stateName) ? stateName : '');
    const street = String(p.housenumber + ' ' + p.street), city = String(p.city || p.town || p.village || p.municipality || ''), zip = /^\d{5}(-\d{4})?$/.test(String(p.postcode || '')) ? String(p.postcode) : '';
    const formatted = [street, city, [state, zip].filter(Boolean).join(' ')].filter(Boolean).join(', '), key = formatted.toLowerCase();
    if (seen.has(key)) return []; seen.add(key);
    return [{street, city, state, zip, formatted, latitude, longitude, source: 'OpenStreetMap' as const}];
  }).slice(0, 6);
}
