export function surveyDetails(s:any,jobs:any[]){
 const match=String(s.external_id||'').match(/^gq:C\d+:(\d+):\d{4}-\d{2}-\d{2}$/),customerId=s.customer_id||match?.[1]||'';
 const matches=customerId?(Array.isArray(jobs)?jobs:[]).filter(j=>String(j.number)===String(customerId)):[];
 let decoded=s?.ratings;try{if(typeof decoded==='string')decoded=JSON.parse(decoded)}catch{decoded=[]}
 const source=Array.isArray(decoded)?decoded:[],ratings=[0,1,2,3].map(i=>{const value=source[i];return typeof value==='number'&&Number.isFinite(value)?value-1:null}),answered=ratings.filter((r:number|null):r is number=>r!==null);
 return {...s,completed_on:String(s?.completed_on||''),customerId,job:matches.length===1?matches[0]:null,ambiguous:matches.length>1,ratings,score:answered.length?answered.reduce((a:number,b:number)=>a+b,0)/answered.length:null};
}
