import {aging, bonusMetrics, bonusPeriod} from './operations';

export function monthEnd(day: string) {
 const [year, month] = day.split('-').map(Number);
 return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

export function bonusPlannerJobs(jobs: any[], today: string, horizon: string) {
 return jobs.flatMap(job => {
  const current = aging(job, today);
  if (!current.kind || !current.ageDate || current.ageDate > horizon) return [];
  return [{id: job.id, customer: job.customer, number: job.number, status: current.kind, amount: job.amount, ageDate: current.ageDate, aged: current.aged}];
 });
}

export function projectBonus(jobs: any[], surveys: any[], config: any, today: string, asOf: string, closed: Set<string>) {
 return bonusMetrics(
  jobs.map(job => closed.has(job.id) ? {...job, stage: 'Closed', status: 'Closed'} : job),
  surveys.filter(survey => survey.completed_on <= today),
  config,
  asOf,
  bonusPeriod(today),
 );
}
