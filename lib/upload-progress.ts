export type UploadProgress={id:string;jobId:string;name:string;percent:number;status:string};
export const progressEvent='production-desk-upload-progress';
export function reportUpload(value:UploadProgress){if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent(progressEvent,{detail:value}));}
