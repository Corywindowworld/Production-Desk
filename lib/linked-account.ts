// Copy account information, never another job's identity or product/workflow data.
export const linkedAccountFields = [
 'customer','firstName','lastName','address','city','state','zip','phone','phone2','phone3','customerEmail',
 'salesRep','salesRepPhone','salesRepEmail','notes','instructions','deliveryOnly',
 'permitReceived','permitNumber','noPermitRequired','buildingDepartment','buildingDepartmentPhone',
 'permitExpiration','privateProvider','customerSuppliedPermit'
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
