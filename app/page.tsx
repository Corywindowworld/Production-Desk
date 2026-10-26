import {redirect} from 'next/navigation';
import {LocationGate} from '@/components/location/location-gate';
import LiveOperations from '@/components/live-operations';
import {pageMember,AccessPending} from '@/lib/page-access';
import {InstallApp} from '@/components/install-app';
export const dynamic='force-dynamic';
export default async function Page(){const m=await pageMember('/');if(!m)return <AccessPending/>;if(m.role==='warehouse')redirect('/warehouse');if(['service_tech','service_manager'].includes(m.role))redirect('/service');return <><link rel="manifest" href="/manifest.webmanifest" crossOrigin="use-credentials"/>{m.role==='installer'?<LocationGate memberId={m.id}><LiveOperations/></LocationGate>:<LiveOperations/>}<InstallApp/></>}
