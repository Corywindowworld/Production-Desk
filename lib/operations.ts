import {isPurchaseOrder} from './payment-status';
import {z} from 'zod';
export const officeRoles=['admin','office','production_assistant','supervisor'];
export const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>!isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v);
export const optionalDate=z.union([date,z.literal('')]).default('');
export const money=z.number().finite().min(0).max(999999999.99).multipleOf(.01);
export const localDay=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export const addDays=(d:string,n:number)=>new Date(Date.parse(d+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
export const dayDifference=(a:string,b:string)=>{if(!a||!b)return null;const n=Math.floor((Date.parse(b.slice(0,10)+'T12:00:00Z')-Date.parse(a.slice(0,10)+'T12:00:00Z'))/86400000);return Number.isFinite(n)?n:null};
export function aging(j:any,today=localDay()){
 const stage=isPurchaseOrder(j)?'PO':j.stage,kind=stage==='Received'?'Received':['Production','InProgress'].includes(stage)?'Production':stage==='Incomplete'?'Incomplete':null;
 const since=kind==='Received'?j.received:kind==='Production'?j.installed:j.incompleteSince?.slice(0,10);
 const days=kind&&since?dayDifference(since,today):null,limit=kind==='Incomplete'?45:kind==='Production'?7:30;
 const aged=days!==null&&(kind==='Incomplete'?days>=limit:days>limit);
 return {kind,days,aged,missing:!!kind&&days===null,remaining:days===null?null:Math.max(0,(kind==='Incomplete'?limit:limit+1)-days)};
}
export function bonusPeriod(day:string){
 const d=new Date(day+'T12:00:00Z'),y=d.getUTCFullYear(),m=d.getUTCMonth();
 const lastTuesday=(month:number)=>{const v=new Date(Date.UTC(y,month+1,0,12));v.setUTCDate(v.getUTCDate()-(v.getUTCDay()+5)%7);return v.toISOString().slice(0,10)};
 const month=day>lastTuesday(m)?m+1:m;
 return {start:addDays(lastTuesday(month-1),1),end:lastTuesday(month)};
}
export const materialSchema=z.object({materialType:z.enum(['Window','SPD','Entry Door','Diamond Screen']),brand:z.enum(['Simonton','Plygem','Wincore','Thermatru','Diamond Screens','AMI','CWS']),bay:z.string().trim().min(1).max(100)});
export const allowedMaterials=(product:string)=>product==='Entry Doors'?['Entry Door']:product==='Diamond Screens'?['Diamond Screen']:['Window','SPD'];
export const fieldsSchema=z.object({
 firstName:z.string().trim().max(80).default(''),lastName:z.string().trim().max(80).default(''),phone2:z.string().max(50).default(''),phone3:z.string().max(50).default(''),customerSuppliedPermit:z.boolean().default(false),
 reorderDate:optionalDate,lastEstimatedShipDate:optionalDate,loadBrands:z.string().trim().max(300).default(''),reportedUnits:z.number().int().min(0).max(999).nullable().default(null),
 permitExpiration:optionalDate,buildingDepartmentPhone:z.string().trim().max(50).default(''),privateProvider:z.boolean().default(false),
 screenCount:z.number().int().min(0).max(999).default(0),paymentMethod:z.enum(['','FNC','CHK','CC','AQUA','PO']).default(''),buildingDepartment:z.string().trim().max(200).default(''),
 city:z.string().trim().max(120).default(''),state:z.string().trim().max(50).default(''),zip:z.string().trim().regex(/^$|^\d{5}(-\d{4})?$/).default(''),
 number:z.string().trim().min(1).max(80),customer:z.string().trim().min(1).max(160),address:z.string().trim().min(1).max(300),phone:z.string().max(50).default(''),
 customerEmail:z.union([z.string().email(),z.literal('')]).default(''),product:z.enum(['Windows','Entry Doors','Diamond Screens']).default('Windows'),windowCount:z.number().int().min(0).max(999).default(0),slidingDoors:z.number().int().min(0).max(999).default(0),entryDoorCount:z.number().int().min(0).max(999).default(0),
 brand:z.enum(['','Simonton','Plygem','Wincore','Thermatru','Diamond Screens','AMI','CWS']).default(''),materialType:z.enum(['','Window','SPD','Entry Door','Diamond Screen']).default(''),permitReceived:z.boolean().default(false),permitNumber:z.string().trim().max(150).default(''),
 received:optionalDate,installed:optionalDate,incompleteSince:optionalDate,stage:z.enum(['Received','Production','InProgress','Incomplete','Closed','Ordered']).default('Ordered'),
 amount:money.nullable(),contractAmount:money.nullable().default(null),supervisorId:z.string().default(''),
 salesRep:z.string().max(160).default(''),salesRepPhone:z.string().max(50).default(''),salesRepEmail:z.union([z.string().email(),z.literal('')]).default(''),
 bay:z.string().max(100).default(''),notes:z.string().max(4000).default(''),instructions:z.string().max(4000).default(''),reorder:z.string().max(4000).default('')
});
export const scheduleSchema=z.object({time:z.union([z.string().regex(/^(?:[01]\d|2[0-3]):00$/),z.literal('')]).default(''),endDate:optionalDate,salesPhotos:z.array(z.object({key:z.string().max(250),name:z.string().max(255),kind:z.literal('photos')})).max(50).default([]),date,period:z.enum(['AM','PM']),installerId:z.string().uuid(),stop:z.number().int().min(1).max(99),adminOverride:z.boolean().default(false),paymentReference:z.string().trim().max(300).default(''),additionalInstructions:z.string().trim().max(4000).default('')}).refine(s=>!s.endDate||s.endDate>=s.date,'End date must be on or after start date.');
export const receiveSchema=z.object({received:date,bay:z.string().trim().min(1).max(100),brand:z.enum(['Simonton','Plygem','Wincore','Thermatru','Diamond Screens','AMI','CWS']),materialType:z.enum(['Window','SPD','Entry Door','Diamond Screen'])});
export const receiveItemsSchema=z.object({received:date,materials:z.array(materialSchema).min(1).max(50)});
export const requestSchema=z.object({type:z.enum(['UTI','COLL','Service','ACCRF']),details:z.string().trim().min(1).max(4000),paymentReference:z.string().trim().max(300).default(''),refused:z.boolean().default(false),serviceDate:optionalDate,period:z.enum(['AM','PM']).default('AM'),installerId:z.string().default(''),amount:money.optional()});
export const surveySchema=z.object({externalId:z.string().trim().min(1).max(150),installerId:z.string().uuid(),completedOn:date,ratings:z.array(z.number().int().min(1).max(5).nullable()).length(4)}).refine(s=>s.ratings.some(r=>r!==null),'Enter at least one rating.');
export const configSchema=z.object({period:date,pool:money,payouts:z.object({dollars:z.array(money).length(6),jobs:z.array(money).length(6),quality:z.array(money).length(6)}).optional(),dollars:z.array(money).length(4),jobs:z.array(z.number().int().min(0)).length(4),quality:z.array(z.number().min(0).max(4)).length(5)}).refine(c=>c.dollars.every((v,i)=>!i||v>=c.dollars[i-1])&&c.jobs.every((v,i)=>!i||v>=c.jobs[i-1])&&c.quality.every((v,i)=>!i||v<=c.quality[i-1]),'Thresholds must be ordered.').refine(c=>date.safeParse(c.period).success&&bonusPeriod(c.period).end===c.period,'Choose the last Tuesday of the bonus month.');
export function bonusMetrics(jobs:any[],surveys:any[],config:any,today=localDay()){
 const period=bonusPeriod(today),aged=jobs.filter(j=>aging(j,today).aged),missing=aged.filter(j=>j.amount==null).length,unknownDates=jobs.filter(j=>aging(j,today).missing).length;
 const amount=Math.round(aged.reduce((s,j)=>s+(j.amount??0),0)*100)/100;
 const included=surveys.filter(s=>s.completed_on>=period.start&&s.completed_on<=period.end&&s.completed_on<=today);
 const categories=[0,1,2,3].map(i=>{const ratings=included.map(s=>s.ratings[i]).filter(v=>v!==null);return ratings.length?ratings.reduce((s,v)=>s+v-1,0)/ratings.length:null});
 const score=categories.every(c=>c!==null)?categories.reduce((s,c)=>s+c!,0)/4:null;
 const tier=(v:number,t:number[])=>v===0?1.2:[1,.75,.5,.25][t.findIndex(x=>v<=x)]??0;
 const q=score===null||!config?null:([1.2,1,.75,.5,.25][config.quality.findIndex((x:number)=>score>=x)]??0);
 const estimate=config&&config.period===period.end&&!missing&&!unknownDates&&q!==null?(config.payouts?config.payouts.dollars[amount===0?0:(config.dollars.findIndex((x:number)=>amount<=x)<0?5:config.dollars.findIndex((x:number)=>amount<=x)+1)]+config.payouts.jobs[aged.length===0?0:(config.jobs.findIndex((x:number)=>aged.length<=x)<0?5:config.jobs.findIndex((x:number)=>aged.length<=x)+1)]+config.payouts.quality[config.quality.findIndex((x:number)=>score!>=x)<0?5:config.quality.findIndex((x:number)=>score!>=x)]:config.pool*(.4*tier(amount,config.dollars)+.2*tier(aged.length,config.jobs)+.4*q)):null;
 return {period,count:aged.length,amount,missing,unknownDates,categories,score,surveys:included.length,estimate};
}
