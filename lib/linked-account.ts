export const linkedPermitFields = [
 'permitReceived','permitNumber','noPermitRequired','buildingDepartment','buildingDepartmentPhone',
 'permitExpiration','privateProvider','customerSuppliedPermit',
] as const;

export function linkedPermitValues(source:Record<string,any>) {
 const permit:Record<string,any> = {};
 const flags = new Set<string>(['permitReceived','noPermitRequired','privateProvider','customerSuppliedPermit']);
 for (const key of linkedPermitFields) permit[key] = source[key] ?? (flags.has(key) ? false : '');
 if (permit.noPermitRequired) permit.permitReceived = false;
 return permit;
}

// Prefer the selected account's permit. Use the open account if only it has a permit on file.
export function preferredLinkedPermit(selected:Record<string,any>, current:Record<string,any>) {
 const from = linkedPermitValues(selected), existing = linkedPermitValues(current);
 const recorded = (permit:Record<string,any>) => !!(permit.permitNumber || permit.noPermitRequired || permit.permitReceived);
 if (recorded(from) || (!recorded(existing) && Object.values(from).some(Boolean))) return from;
 return existing;
}

// Copy account information, never another job's identity or product/workflow data.
export const linkedAccountFields = [
 'customer','firstName','lastName','address','city','state','zip','phone','phone2','phone3','customerEmail',
 'salesRep','salesRepPhone','salesRepEmail','notes','instructions','deliveryOnly',
 ...linkedPermitFields
] as const;
export const linkedFinancialFields = ['paymentMethod','contractAmount','amount'] as const;
export function linkedAccountValues(source:Record<string,any>,includeFinancial=true){
 const result:Record<string,any>={};
 for(const key of [...linkedAccountFields,...(includeFinancial?linkedFinancialFields:[])]){
  if(source[key]!==undefined)result[key]=source[key];
 }
 if(!result.firstName&&!result.lastName&&source.customer){
  const name=String(source.customer),parts=name.split(',');
  result.firstName=parts.length>1?parts.slice(1).join(',').trim():name.split(' ')[0];
  result.lastName=parts.length>1?parts[0].trim():name.split(' ').slice(1).join(' ');
 }
 if(result.noPermitRequired)result.permitReceived=false;
 return result;
}
