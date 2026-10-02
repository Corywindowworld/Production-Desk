import {addDays} from './operations';
import {installAppointments,hourLabel} from './install-calendar';
import {displayedJobStatus} from './payment-status';

const escape=(value:unknown)=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));
const label=(day:string)=>new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}).format(new Date(day+'T12:00:00Z'));
export function weeklyScheduleHtml({jobs,daysOff=[],day,colors={}}:{jobs:any[];daysOff?:any[];day:string;colors?:Record<string,string>}){
 const start=addDays(day,-new Date(day+'T12:00:00Z').getUTCDay());
 const dates=Array.from({length:7},(_,i)=>addDays(start,i));
 const appointments=jobs.flatMap(j=>[
  ...installAppointments(j,dates).map(a=>({...a,service:j.stage==='SVC',details:[j.instructions,j.scheduleInstructions].filter(Boolean).join(' · ')})),
  ...(j.operations?.services||[]).filter((s:any)=>dates.includes(s.date)).map((s:any)=>({...j,...s,service:true}))
 ]);
 const statuses:Record<string,string>={Ordered:'ORD',Received:'RCVD',Production:'PROD',InProgress:'IN PROGRESS',Incomplete:'INC',Closed:'COMP',SVC:'SVC'};
 const columns=dates.map(date=>{
  const rows=appointments.filter(a=>a.date===date).sort((a,b)=>(a.time||(a.period==='PM'?'12:00':'00:00')).localeCompare(b.time||(b.period==='PM'?'12:00':'00:00'))||(a.stop||1)-(b.stop||1)||String(a.crew||'').localeCompare(String(b.crew||'')));
  return `<section class="day"><h2>${escape(new Intl.DateTimeFormat('en-US',{weekday:'long',timeZone:'UTC'}).format(new Date(date+'T12:00:00Z')))}<span>${escape(label(date))}</span></h2>${daysOff.filter(d=>d.date===date).map(d=>`<div class="off">NOT WORKING<br>${escape(d.crew||'Installer')}</div>`).join('')}${rows.map(a=>{
   const color=/^#[0-9a-f]{6}$/i.test(colors[a.installerId]||'')?colors[a.installerId]:'#173a66';
   return `<article style="border-left-color:${color}"><b>${escape(a.time?hourLabel(a.time):a.period||'')} · ${a.service?'Service':'Stop '+escape(a.stop||1)}</b><strong>${escape(a.crew||'Unassigned')}</strong><strong>${escape(a.customer)}</strong><div>#${escape(a.number)} · ${escape(statuses[displayedJobStatus(a)]||displayedJobStatus(a))}</div><div>${escape([a.address,a.city,a.state,a.zip].filter(Boolean).join(', '))}</div>${a.phone?`<div>${escape(a.phone)}</div>`:''}${a.deliveryOnly?'<b>DELIVERY ONLY</b>':''}${a.multi&&!a.service?`<b>MULTI-DAY (${escape(a.daysLeft)} left)</b>`:''}${a.details?`<p>${escape(a.details)}</p>`:''}</article>`;
  }).join('')}${!rows.length?'<p class="empty">No appointments</p>':''}</section>`;
 }).join('');
 return `<!doctype html><html><head><meta charset="utf-8"><title>Production Desk — Week of ${escape(label(start))}</title><style>
 @page{size:letter landscape;margin:8mm}*{box-sizing:border-box}body{margin:0;color:#132738;background:#fff;font:10px Arial,sans-serif}.toolbar{padding:12px;font:14px Arial;background:#eef3f8}.toolbar button{padding:8px 16px;margin-right:12px}#page{width:260mm;height:194mm;margin:0}#sheet{width:260mm;transform-origin:top left}header{display:flex;justify-content:space-between;align-items:baseline;padding:0 0 10px}h1{font-size:19px;margin:0}header p{font-size:12px;margin:0}.week{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:5px}.day{min-width:0;border:1px solid #bac7d1;padding:4px}h2{font-size:12px;margin:0 0 5px;padding-bottom:5px;border-bottom:1px solid #bac7d1}h2 span{display:block;font-size:10px;font-weight:normal;margin-top:3px}article{border:1px solid #ccd5dd;border-left:4px solid #173a66;padding:5px;margin:0 0 5px;overflow-wrap:anywhere;break-inside:avoid}article b,article strong{display:block}article div{margin-top:3px}article p{margin:4px 0 0;white-space:pre-wrap}.off{border:1px dashed #657483;padding:5px;margin:5px 0;font-weight:bold}.empty{color:#536677}@media print{.toolbar{display:none}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
 </style></head><body><div class="toolbar"><button id="print" type="button">Print / Save PDF</button>Landscape · Letter · One page. Turn off browser headers and footers. Busy weeks use smaller text.</div><div id="page"><div id="sheet"><header><h1>Production Desk · Weekly Schedule</h1><p>${escape(label(start))} – ${escape(label(dates[6]))}</p></header><div class="week">${columns}</div></div></div></body></html>`;
}
export function printWeeklySchedule(options:Parameters<typeof weeklyScheduleHtml>[0]){
 const preview=window.open('','_blank','width=1200,height=850');
 if(!preview)throw Error('Allow pop-ups for Production Desk to open the printable schedule.');
 preview.document.open();preview.document.write(weeklyScheduleHtml(options));preview.document.close();
 const fit=()=>{const sheet=preview.document.getElementById('sheet')!,page=preview.document.getElementById('page')!;sheet.style.zoom='1';sheet.style.zoom=String(Math.min(1,(page.clientHeight-4)/sheet.scrollHeight));};
 const print=()=>{fit();preview.focus();preview.print();};
 preview.document.getElementById('print')!.addEventListener('click',print);
 preview.addEventListener('beforeprint',fit);
 preview.requestAnimationFrame(()=>preview.requestAnimationFrame(print));
}
