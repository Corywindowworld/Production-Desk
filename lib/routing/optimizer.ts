export type RouteStop = {
  id: string; serviceMinutes: number; windowStart: number; windowEnd: number;
};
export type Visit = { id: string; arrival: number; start: number; finish: number; driveMinutes: number; waitMinutes: number };
export type RouteResult = { feasible: boolean; visits: Visit[]; finish: number; driveMinutes: number; waitMinutes: number; reason?: string };
export type RouteOptions = { start: number; end: number; loadingMinutes: number; returnToWarehouse: boolean; travelFactor: number };
// Matrix index zero is the warehouse. Stop indexes remain stable while searching.
export function optimizeRoute(stops: RouteStop[], seconds: (number | null)[][], options: RouteOptions) {
  if (!stops.length || stops.length > 8) throw Error('Plan between 1 and 8 stops per crew.');
  if (new Set(stops.map(s => s.id)).size !== stops.length) throw Error('Each stop must be unique.');
  if (seconds.length !== stops.length + 1 || seconds.some(r => r.length !== seconds.length || r.some(v => v !== null && (!Number.isFinite(v) || v < 0)))) throw Error('Invalid driving-time matrix.');
  if (![options.start, options.end, options.loadingMinutes, options.travelFactor].every(Number.isFinite) || options.start < 0 || options.end > 1440 || options.end <= options.start || options.loadingMinutes < 0 || options.travelFactor < 1 || options.travelFactor > 3) throw Error('Check the working hours and travel allowance.');
  for (const s of stops) if (!s.id || ![s.serviceMinutes, s.windowStart, s.windowEnd].every(Number.isFinite) || s.serviceMinutes <= 0 || s.serviceMinutes > 720 || s.windowStart < 0 || s.windowEnd > 1440 || s.windowStart > s.windowEnd) throw Error('Check each job duration and appointment window.');
  function evaluate(order: number[]): RouteResult {
    let clock = options.start + options.loadingMinutes, last = 0, driveMinutes = 0, waitMinutes = 0;
    const visits: Visit[] = [];
    for (const index of order) {
      const s = stops[index], leg = seconds[last][index + 1];
      if (leg === null) return { feasible: false, visits, finish: clock, driveMinutes, waitMinutes, reason: 'A stop cannot be reached by road.' };
      const drive = Math.ceil(leg * options.travelFactor / 60), arrival = clock + drive, start = Math.max(arrival, s.windowStart), wait = start - arrival;
      clock = start + s.serviceMinutes; driveMinutes += drive; waitMinutes += wait;
      visits.push({id: s.id, arrival, start, finish: clock, driveMinutes: drive, waitMinutes: wait});
      if (start > s.windowEnd || clock > options.end) return { feasible: false, visits, finish: clock, driveMinutes, waitMinutes, reason: 'The route exceeds an appointment window or the crew’s working hours.' };
      last = index + 1;
    }
    if (options.returnToWarehouse) {
      const leg = seconds[last][0];
      if (leg === null) return {feasible: false, visits, finish: clock, driveMinutes, waitMinutes, reason: 'No return route to the warehouse.'};
      const drive = Math.ceil(leg * options.travelFactor / 60); clock += drive; driveMinutes += drive;
    }
    return {feasible: clock <= options.end, visits, finish: clock, driveMinutes, waitMinutes, ...(clock > options.end ? {reason: 'The return trip exceeds the crew’s working hours.'} : {})};
  }
  const baseline = evaluate(stops.map((_, i) => i));
  let best: RouteResult | null = null;
  function search(order: number[], remaining: number[]) {
    if (!remaining.length) {
      const r = evaluate(order);
      // Earliest finish includes driving and waiting, with driving as tie-breaker.
      if (r.feasible && (!best || r.finish < best.finish || (r.finish === best.finish && r.driveMinutes < best.driveMinutes))) best = r;
      return;
    }
    for (const index of remaining) search([...order, index], remaining.filter(i => i !== index));
  }
  search([], stops.map((_, i) => i));
  return {baseline, optimized: best as RouteResult | null, reason: best ? undefined : 'No order fits every stop, appointment window and working hour. Adjust the schedule or estimated work times; no jobs were dropped.'};
}
