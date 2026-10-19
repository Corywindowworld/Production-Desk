import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {resolve} from 'node:path';
const vite=await createServer({configFile:false,resolve:{alias:{'@':resolve('.')}},server:{middlewareMode:true,hmr:false}});
const {optimizeRoute}=await vite.ssrLoadModule('/lib/routing/optimizer.ts');
const {photonAddresses,addressKey}=await vite.ssrLoadModule('/lib/routing/address.ts');
const {drivingMatrix,searchAddresses}=await vite.ssrLoadModule('/lib/routing/providers.ts');
test.after(()=>vite.close());
const options={start:420,end:1020,loadingMinutes:30,travelFactor:1,returnToWarehouse:false};
const jobs=[{id:'A',serviceMinutes:60,windowStart:480,windowEnd:719},{id:'B',serviceMinutes:60,windowStart:480,windowEnd:719},{id:'C',serviceMinutes:60,windowStart:720,windowEnd:1020}];
test('optimizer honors loading, asymmetric roads, appointment windows, and every job',()=>{
 const r=optimizeRoute(jobs,[[0,3600,600,600],[600,0,600,600],[600,600,0,600],[600,600,600,0]],options);
 assert.ok(r.optimized);assert.deepEqual(new Set(r.optimized.visits.map(s=>s.id)),new Set(['A','B','C']));
 assert.equal(r.optimized.visits[0].id,'B');assert.ok(r.optimized.visits[0].arrival>=460);assert.ok(r.optimized.visits[2].start>=720);assert.ok(r.optimized.finish<=options.end);
});
test('unreachable roads are never substituted with straight line times; impossible days drop no jobs',()=>{
 const r=optimizeRoute(jobs,[[0,null,null,null],[null,0,60,60],[null,60,0,60],[null,60,60,0]],options);
 assert.equal(r.optimized,null);assert.match(r.reason,/no jobs were dropped/i);
 const impossible=optimizeRoute(jobs.map(j=>({...j,serviceMinutes:600})),Array.from({length:4},()=>Array(4).fill(60)),options);assert.equal(impossible.optimized,null);
});
test('return travel, driving allowance, exact appointments, duplicate IDs and matrix bounds',()=>{
 const job=[{id:'one',serviceMinutes:60,windowStart:480,windowEnd:480}];
 const r=optimizeRoute(job,[[0,600],[3600,0]],{...options,travelFactor:1.5,returnToWarehouse:true});assert.equal(r.optimized.finish,630);assert.equal(r.optimized.driveMinutes,105);assert.equal(r.optimized.visits[0].start,480);
 assert.throws(()=>optimizeRoute([job[0],job[0]],[[0]],options),/unique/);
 assert.throws(()=>optimizeRoute(job,[[0,-1],[0,0]],options),/matrix/);
 assert.throws(()=>optimizeRoute(Array(9).fill(job[0]),[],options),/1 and 8/);
 assert.equal(optimizeRoute(job,[[0,100000],[0,0]],options).optimized,null);
});
test('Photon addresses normalize state ZIP and coordinates and reject broad, duplicate, non-US and invalid matches',()=>{
 const feature={geometry:{coordinates:[-82.46,27.95]},properties:{countrycode:'us',housenumber:'123',street:'Main St',city:'Tampa',state:'Florida',postcode:'33601'}};
 const out=photonAddresses({features:[feature,feature,{...feature,properties:{...feature.properties,countrycode:'ca'}},{...feature,properties:{...feature.properties,housenumber:''}},{...feature,geometry:{coordinates:[null,null]}}]});
 assert.equal(out.length,1);assert.equal(out[0].state,'FL');assert.equal(out[0].zip,'33601');assert.equal(out[0].latitude,27.95);assert.equal(out[0].formatted,'123 Main St, Tampa, FL 33601');
 assert.equal(addressKey({address:' 123 Main St ',city:'TAMPA',state:'FL',zip:'33601'}),'123 main st|tampa|fl|33601');assert.deepEqual(photonAddresses({features:{}}),[]);
});
test('self-hosted adapters keep secrets on the server, validate the matrix, and never call public demo endpoints',async()=>{
 const prior={osrm:process.env.OSRM_BASE_URL,photon:process.env.PHOTON_BASE_URL,token:process.env.MAP_SERVICE_TOKEN,fetch:globalThis.fetch};
 try{
  delete process.env.OSRM_BASE_URL;await assert.rejects(()=>drivingMatrix([{latitude:1,longitude:1},{latitude:2,longitude:2}]),/not connected/);
  process.env.OSRM_BASE_URL='https://roads.example.test';process.env.PHOTON_BASE_URL='https://addresses.example.test';process.env.MAP_SERVICE_TOKEN='test-secret';
  let urls=[];globalThis.fetch=async(url,opts)=>{urls.push(url);assert.equal(opts.headers.Authorization,'Bearer test-secret');assert.equal(opts.redirect,'error');return Response.json(url.includes('/table/')?{code:'Ok',durations:[[0,null],[30,0]]}:{features:[]})};
  assert.deepEqual(await drivingMatrix([{latitude:27,longitude:-82},{latitude:28,longitude:-81}]),[[0,null],[30,0]]);await searchAddresses('123 Main');assert.match(urls[0],/\/driving\/-82,27;-81,28/);assert.match(urls[1],/^https:\/\/addresses.example.test\/api\//);
  globalThis.fetch=async()=>Response.json({code:'Ok',durations:[[0],[30]]});await assert.rejects(()=>drivingMatrix([{latitude:27,longitude:-82},{latitude:28,longitude:-81}]),/invalid driving/);
 }finally{globalThis.fetch=prior.fetch;for(const [key,value]of [['OSRM_BASE_URL',prior.osrm],['PHOTON_BASE_URL',prior.photon],['MAP_SERVICE_TOKEN',prior.token]]){if(value===undefined)delete process.env[key];else process.env[key]=value}}
});
test('Geoapify hosted adapter normalizes addresses, preserves road times/nulls, and rejects corrupt matrices and quota errors',async()=>{
 const prior={key:process.env.GEOAPIFY_API_KEY,fetch:globalThis.fetch};
 process.env.GEOAPIFY_API_KEY='private-test-key';
 const points=[{latitude:27,longitude:-82},{latitude:28,longitude:-81}];
 try{
  let calls=[];
  globalThis.fetch=async(url,opts)=>{calls.push({url,opts});return Response.json(url.includes('routematrix')?{sources_to_targets:[[{time:0,source_index:0,target_index:0},{time:null,source_index:0,target_index:1}],[{time:45,source_index:1,target_index:0},{time:0,source_index:1,target_index:1}]]}:{features:[{geometry:{coordinates:[-82,27]},properties:{country_code:'us',housenumber:'123',street:'Main St',city:'Tampa',state_code:'FL',postcode:'33601'}}]})};
  const addresses=await searchAddresses('123 Main');assert.equal(addresses[0].street,'123 Main St');assert.equal(addresses[0].state,'FL');assert.equal(addresses[0].source,'Geoapify');assert.ok(!JSON.stringify(addresses).includes('private-test-key'));
  assert.deepEqual(await drivingMatrix(points),[[0,null],[45,0]]);
  assert.equal(calls[1].opts.method,'POST');assert.deepEqual(JSON.parse(calls[1].opts.body).sources,[{location:[-82,27]},{location:[-81,28]}]);
  assert.ok(calls.every(c=>c.url.startsWith('https://api.geoapify.com/')));
  globalThis.fetch=async()=>Response.json({sources_to_targets:[[{time:0,source_index:1,target_index:0}]]});await assert.rejects(()=>drivingMatrix(points),/invalid driving/);
  for(const status of [401,403]){globalThis.fetch=async()=>new Response('',{status});await assert.rejects(()=>searchAddresses('123 Main'),e=>/rejected the API key/.test(e.message)&&!e.message.includes('private-test-key'));}
  globalThis.fetch=async()=>new Response('',{status:429});await assert.rejects(()=>searchAddresses('123 Main'),/usage limit/);
  globalThis.fetch=async()=>{throw Error('secret URL private-test-key')};await assert.rejects(()=>searchAddresses('123 Main'),e=>!e.message.includes('private-test-key')&&/unavailable/.test(e.message));
 }finally{globalThis.fetch=prior.fetch;if(prior.key===undefined)delete process.env.GEOAPIFY_API_KEY;else process.env.GEOAPIFY_API_KEY=prior.key}
});
