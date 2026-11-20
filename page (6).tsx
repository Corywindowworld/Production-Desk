import {pageMember} from '@/lib/page-access';
import {redirect} from 'next/navigation';
import {CustomerDatabase} from '@/components/customer-database';
export const dynamic='force-dynamic';
export default async function Page(){const m=await pageMember('/customers');if(!m||m.role==='installer')redirect('/installers');return <CustomerDatabase/>}
