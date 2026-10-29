import {normalizedJobStatus} from './payment-status';
export function isPipelineJob(job:any){
 const excluded=['Closed','SVC','COLL','UTI'];
 return ![normalizedJobStatus(job),normalizedJobStatus({stage:job.stage}),normalizedJobStatus({stage:job.status})].some(s=>excluded.includes(s));
}
