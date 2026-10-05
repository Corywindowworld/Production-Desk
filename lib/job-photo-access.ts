import {localDay} from './operations';
export const jobPhotoKinds=['photos','front','rear','left','right','issue'] as const;
export const jobPhotoStages=['Production','InProgress','Incomplete','SVC','COLL','UTI'];
export function canAddJobPhotos(member:{id:string;role:string},job:any,today=localDay()){
 if(!jobPhotoStages.includes(job.stage))return false;
 if(['admin','supervisor'].includes(member.role))return true;
 return member.role==='installer'&&!!(job.installerId===member.id||job.operations?.services?.some((s:any)=>s.installerId===member.id&&s.date>=today));
}
