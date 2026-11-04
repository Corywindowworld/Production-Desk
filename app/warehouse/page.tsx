import {LocationGate} from '@/components/location/location-gate';
import {pageMember} from '@/lib/page-access';
import Warehouse from '@/components/warehouse';
export const dynamic='force-dynamic';
export default async function Page(){const m=await pageMember('/warehouse');return m.role==='installer'?<LocationGate memberId={m.id}><Warehouse/></LocationGate>:<Warehouse/>}
