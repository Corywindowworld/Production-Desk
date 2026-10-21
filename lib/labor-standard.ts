import {blankLaborTemplate} from './labor-template';
const rawKey=(s:string)=>s.toLowerCase().replace(/[^a-z0-9]/g,'');
const pocketAliases=new Set(['nslpocketdoor','nstlpocketdoor','instlpocketdoor']);
const key=(s:string)=>pocketAliases.has(rawKey(s))?'installpocketdoor':rawKey(s);
function similarity(a:string,b:string){const row=Array.from({length:b.length+1},(_,i)=>i);for(let i=1;i<=a.length;i++){let prev=row[0];row[0]=i;for(let j=1;j<=b.length;j++){const old=row[j];row[j]=Math.min(row[j]+1,row[j-1]+1,prev+(a[i-1]===b[j-1]?0:1));prev=old;}}return 1-row[b.length]/Math.max(a.length,b.length,1);}
/** Keep the complete form, matching scan descriptions rather than their row positions. */
export function completeLaborRows(input:any[],scan=false){
 const rows:any[]=blankLaborTemplate(),used=new Set<number>(),extras:any[]=[];
 for(const line of input){const name=key(line.description||'');if(line.scanMissing||!name&&!line.contract&&!line.actual&&line.rate==null)continue;const scores=rows.map((r,i)=>({i,score:similarity(name,key(r.description))})).sort((a,b)=>b.score-a.score);const match=scores[0];
  if(pocketAliases.has(rawKey(line.description||''))&&used.has(match.i)){const existing=rows[match.i];if(!line.contract&&!line.actual)continue;if(!existing.contract&&!existing.actual){rows[match.i]={...existing,...line,description:existing.description,scanMissing:false};continue;}}
  if(name&&match.score>=.8&&match.score-(scores[1]?.score||0)>.06&&!used.has(match.i)){
   const base=rows[match.i];rows[match.i]={...base,...line,description:base.description,...(scan&&base.rate!==null?{rate:base.rate}:{}),scanMissing:false};used.add(match.i);
  }else extras.push({...line,extra:true});
 }
 return [...rows.map((r,i)=>used.has(i)?r:{...r,scanMissing:true}),...extras];
}
export function standardLaborSheet(sheet:any){
 if(!['Draft','Returned','Imported','Submitted'].includes(sheet.status)||(sheet.standardLayout&&!(sheet.lines||[]).some((l:any)=>pocketAliases.has(rawKey(l.description||''))))||sheet.templateVersion)return sheet;
 return {...sheet,standardLayout:true,lines:completeLaborRows(sheet.lines||[],sheet.source==='upload'&&!sheet.revisions?.length&&sheet.status!=='Submitted'),originalLines:completeLaborRows(sheet.originalLines||sheet.lines||[],sheet.source==='upload'&&!sheet.revisions?.length&&sheet.status!=='Submitted')};
}
