import {LocationGate} from '@/components/location/location-gate';
import {pageMember} from '@/lib/page-access';
import LaborWindow from '@/components/labor-window';
export const dynamic='force-dynamic';
export default async function Page({params}:{params:Promise<{jobId:string}>}){const {jobId}=await params,m=await pageMember('/labor/'+jobId);const view=<LaborWindow jobId={jobId}/>;return m.role==='installer'?<LocationGate memberId={m.id}>{view}</LocationGate>:view;}
