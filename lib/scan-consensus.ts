import {parseLeadsCustomerScan} from './customer-scan';
export function reconcileLeadsScans(texts:string[]){
 const scans=texts.map(t=>parseLeadsCustomerScan(t));const values:Record<string,any>={},warnings:string[]=[];
 const critical=/^(number|amount|contractAmount|reportedUnits|.*Date|received|ordered|zip|phone\d*)$/;
 for(const key of new Set(scans.flatMap(s=>Object.keys(s.values)))){
  const candidates=scans.map(s=>s.values[key]).filter(v=>v!==undefined&&v!=='');
  const distinct=[...new Set(candidates)];
  if(distinct.length===1&&(!critical.test(key)||candidates.length>=2))values[key]=distinct[0];
  else if(distinct.length)warnings.push(`${key}: verify from image (${distinct.join(' / ')}).`);
 }
 warnings.push('Review every value against the original image. Blank or conflicting fields are not applied. Total units do not establish the window/SPD breakdown.');
 return {values,warnings,text:texts[0]||''};
}
