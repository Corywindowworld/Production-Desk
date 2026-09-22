export function surveyDetails(s:any,jobs:any[]){
 const match=String(s.external_id||'').match(/^gq:C\d+:(\d+):\d{4}-\d{2}-\d{2}$/),customerId=s.customer_id||match?.[1]||'';
 const matches=customerId?jobs.filter(j=>String(j.number)===String(customerId)):[];
 const ratings=s.ratings.map((r:number|null)=>r===null?null:r-1),answered=ratings.filter((r:number|null)=>r!==null);
 return {...s,customerId,job:matches.length===1?matches[0]:null,ambiguous:matches.length>1,ratings,score:answered.length?answered.reduce((a:number,b:number)=>a+b,0)/answered.length:null};
}
