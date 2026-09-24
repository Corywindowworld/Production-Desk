import {z} from 'zod';
import {date,bonusPeriod,configSchema} from './operations';
export const importedSurveySchema=z.object({code:z.string().regex(/^C\d+$/),name:z.string().trim().min(1).max(100),supervisor:z.string().max(100),customerId:z.string().regex(/^\d+$/),completedOn:date,ratings:z.array(z.number().int().min(0).max(4)).length(4),installerId:z.string().uuid().optional()});
export const reportImportSchema=z.object({rows:z.array(importedSurveySchema).min(1).max(2000)});
export type ImportedSurvey=z.infer<typeof importedSurveySchema>;
function usDate(s:string){const [m,d,y]=s.split('/');const v=`${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;return date.parse(v)}
export function parseGuildReport(text:string){
 let code='',name='',supervisor='';const rows:ImportedSurvey[]=[];
 for(const line of text.split(/\r?\n/)){
  const crew=line.trim().match(/^(C\d+)\s*[-–]\s*(.+)$/);if(crew){code=crew[1];name=crew[2].trim();continue}
  const sup=line.trim().match(/^\d+\s*[-–]\s*(.+)$/);if(sup){supervisor=sup[1].trim();continue}
  if(!/^\s*\d{1,2}\/\d{1,2}\/\d{4}\s/.test(line))continue;
  const r=line.trim().match(/^(\d{1,2}\/\d{1,2}\/\d{4})\s+(\d+)\s+\d{1,2}\/\d{1,2}\/\d{4}\s+.+?\s+([0-4])\s+([0-4])\s+([0-4])\s+([0-4])\s+(\d+)\s*$/);
  if(!r||!code)throw Error('A survey row could not be read. Check the extracted text near: '+line.trim().slice(0,90));
  const ratings=r.slice(3,7).map(Number);if(ratings.reduce((s,n)=>s+n,0)!==Number(r[7]))throw Error('Category totals do not match for customer '+r[2]+'. Correct the extracted text first.');
  rows.push({code,name,supervisor,customerId:r[2],completedOn:usDate(r[1]),ratings});
 }
 const totals=text.match(/Region Totals:\s*Sum:\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)/i);
 if(!totals)throw Error('The regional total could not be read. Include every report page and check the Region Totals: Sum line.');
 const sums=[0,1,2,3].map(i=>rows.reduce((s,r)=>s+r.ratings[i],0));if([...sums,sums.reduce((a,b)=>a+b,0)].some((n,i)=>n!==Number(totals[i+1])))throw Error('Survey rows do not reconcile with the printed regional totals. Check for missing, duplicated or unreadable rows before importing.');
 return reportImportSchema.parse({rows}).rows;
}
export function parseBonusReport(text:string){
 const month=text.match(/Targets\s+For\s+([A-Za-z]+)\s+(\d{4})/i);if(!month)throw Error('Report month was not found. Keep the “Targets For Month Year” heading.');
 const months=['january','february','march','april','may','june','july','august','september','october','november','december'];const m=months.indexOf(month[1].toLowerCase());if(m<0)throw Error('Invalid bonus month.');
 const pool=text.match(/Potential Bonus Pool:\s*\$?([\d,]+(?:\.\d+)?)/i);if(!pool)throw Error('Potential Bonus Pool was not found.');
 const groups:number[][][]=[[],[],[]];let section=-1;
 for(const line of text.split(/\r?\n/)){
  if(/^\s*\$ At Risk\s*$/i.test(line))section=0;
  if(/^\s*# Jobs At Risk\s*$/i.test(line))section=1;
  if(/^\s*GuildQuality Rating\s*$/i.test(line))section=2;
  if(section<0||!/TWITA|Very good|Above Average|Below Average|\bAverage\b|\bPoor\b/i.test(line))continue;
  const n=(line.match(/\$?\d[\d,]*(?:\.\d+)?%?/g)||[]).map(v=>Number(v.replace(/[$,%]/g,'')));groups[section].push(n);
 }
 if(groups.some(g=>g.length!==6))throw Error('Expected six payout rows in each of the three categories. Check the scan or extracted text.');
 const [d,j,q]=groups; if([...d.slice(0,5),...j.slice(0,5)].some(r=>r.length!==6)||q.slice(0,5).some(r=>r.length!==4))throw Error('A threshold row has missing values. Check the scan.');
 return configSchema.parse({period:bonusPeriod(`${month[2]}-${String(m+1).padStart(2,'0')}-15`).end,pool:Number(pool[1].replaceAll(',','')),dollars:d.slice(1,5).map(r=>r[3]),jobs:j.slice(1,5).map(r=>r[3]),quality:q.slice(0,5).map(r=>r[0]),payouts:{dollars:d.map(r=>r.at(-1)),jobs:j.map(r=>r.at(-1)),quality:q.map(r=>r.at(-1))}});
}
