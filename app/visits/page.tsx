import {pageMember} from '@/lib/page-access';
import {redirect} from 'next/navigation';
import {VisitDirectory} from '@/components/visit-directory';
export const dynamic='force-dynamic';
export default async function Page(){const m=await pageMember('/visits');if(!m||m.role==='installer')redirect('/installers');return <VisitDirectory/>}
