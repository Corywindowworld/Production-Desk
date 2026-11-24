'use client';

import {useMemo, useState} from 'react';
import {bonusPlannerJobs, monthEnd, projectBonus} from '@/lib/bonus-planner';
import {date, dayDifference} from '@/lib/operations';

const dollars = new Intl.NumberFormat('en-US', {style: 'currency', currency: 'USD'});
const displayDate = (day: string) => new Date(day + 'T12:00:00Z').toLocaleDateString('en-US', {timeZone: 'America/New_York', month: 'short', day: 'numeric', year: 'numeric'});

export function BonusPlanner({jobs, surveys, config, today, metrics}: any) {
 const [asOf, setAsOf] = useState(metrics.period.end as string);
 const [closed, setClosed] = useState(new Set<string>());
 const [query, setQuery] = useState('');
 const [sort, setSort] = useState('date');
 const end = monthEnd(today);
 const validDate = date.safeParse(asOf).success && asOf >= today ? asOf : metrics.period.end;
 const projected = useMemo(() => projectBonus(jobs, surveys, config, today, validDate, closed), [jobs, surveys, config, today, validDate, closed]);
 const candidates = useMemo(() => bonusPlannerJobs(jobs, today, end > validDate ? end : validDate), [jobs, today, end, validDate]);
 const rows = candidates.filter(job => `${job.customer} ${job.number}`.toLowerCase().includes(query.trim().toLowerCase()))
  .sort((a,b) => sort === 'balance' ? (b.amount ?? -1) - (a.amount ?? -1) || a.ageDate.localeCompare(b.ageDate) : a.ageDate.localeCompare(b.ageDate));
 const groups = [
  {title:'Already Aged', jobs:rows.filter(job=>job.aged)},
  {title:'Aging by Month-End', jobs:rows.filter(job=>!job.aged && job.ageDate <= end)},
  {title:'Aging After Month-End by Projection Date', jobs:rows.filter(job=>!job.aged && job.ageDate > end)},
 ];
 const comparison: Array<[string, number | null, number | null, (value:number)=>string]> = [
  ['Aged dollars', metrics.amount, projected.amount, value=>dollars.format(value)],
  ['Aged jobs', metrics.count, projected.count, value=>String(value)],
  ['GuildQuality score', metrics.score, projected.score, value=>value.toFixed(2)],
  ['Estimated bonus', metrics.estimate, projected.estimate, value=>dollars.format(value)],
 ];
 function toggle(id: string) {
  setClosed(previous=>{
   const next = new Set(previous);
   if (next.has(id)) next.delete(id); else next.add(id);
   return next;
  });
 }
 return <section className="bonus-planner">
  <p>Check jobs you expect to close by the projection date. This scenario uses current balances, statuses and GuildQuality results.</p>
  <p>Bonus cutoff: <strong>{displayDate(metrics.period.end)}</strong> · Month-end: <strong>{displayDate(end)}</strong></p>
  <label>Projected as of <input type="date" min={today} value={asOf} onChange={event=>setAsOf(event.target.value)} /></label>
  {validDate !== asOf && <p role="status">Showing the bonus cutoff projection until you enter a valid date on or after today.</p>}
  <div className="bonus-planner-table"><table>
   <thead><tr><th scope="col">Metric</th><th scope="col">Current</th><th scope="col">Projected</th><th scope="col">Difference</th></tr></thead>
   <tbody>{comparison.map(([label,current,next,format])=>{
    const difference = current === null || next === null ? null : next-current;
    return <tr key={label}><th scope="row">{label}</th><td>{current===null?'Unavailable':format(current)}</td><td>{next===null?'Unavailable':format(next)}</td><td>{difference===null?'—':(difference>0?'+':difference<0?'−':'')+format(Math.abs(difference))}</td></tr>;
   })}</tbody>
  </table></div>
  {validDate > metrics.period.end && <p role="status">This date is after the bonus cutoff. The projected estimate still uses the current bonus period’s targets.</p>}
  {projected.estimate === null && <p>Estimate unavailable. Check bonus targets, GuildQuality ratings, and any missing aging dates or balances.</p>}
  <div className="bonus-planner-controls">
   <label>Search jobs <input type="search" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Customer or job number" /></label>
   <label>Sort by <select value={sort} onChange={event=>setSort(event.target.value)}><option value="date">Date aged</option><option value="balance">Highest balance</option></select></label>
   <button className="live-button" type="button" disabled={!closed.size} onClick={()=>setClosed(new Set())}>Reset ({closed.size} selected)</button>
  </div>
  {groups.map(({title,jobs},index)=>(index<2||jobs.length>0)&&<section key={title}>
   <h3>{title} ({jobs.length})</h3>
   {!jobs.length ? <p>No matching jobs.</p> : <div className="bonus-planner-table"><table>
    <thead><tr><th scope="col">Close</th><th scope="col">Customer</th><th scope="col">Status</th><th scope="col">Date aged</th><th scope="col">Balance</th></tr></thead>
    <tbody>{jobs.map(job=><tr key={job.id}>
     <td><input type="checkbox" aria-label={`Simulate closing ${job.customer} #${job.number}`} checked={closed.has(job.id)} onChange={()=>toggle(job.id)} /></td>
     <th scope="row">{job.customer} · #{job.number}</th><td>{job.status}{job.aged ? ` · ${dayDifference(job.ageDate,today)} days aged` : ''}</td>
     <td>{displayDate(job.ageDate)}{job.ageDate>validDate && <small>After projection date</small>}</td>
     <td>{job.amount==null?'Missing balance':dollars.format(job.amount)}</td>
    </tr>)}</tbody>
   </table></div>}
  </section>)}
 </section>;
}
