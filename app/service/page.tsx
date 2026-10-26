import {pageMember,AccessPending} from '@/lib/page-access';
import {LocationGate} from '@/components/location/location-gate';
import ServiceWorkspace from '@/components/service-workspace';
import {redirect} from 'next/navigation';
export const dynamic='force-dynamic';
export default async function ServicePage(){const m=await pageMember('/service');if(!m)return <AccessPending/>;if(!['admin','supervisor','service_manager','service_tech'].includes(m.role))redirect('/');return m.role==='service_tech'?<LocationGate memberId={m.id}><ServiceWorkspace/></LocationGate>:<ServiceWorkspace/>;}
