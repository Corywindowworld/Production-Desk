import {redirect} from 'next/navigation';
import {pageMember} from '@/lib/page-access';
import AccountManagement from '@/components/account-management';
export const dynamic='force-dynamic';
export default async function Page(){const member=await pageMember('/accounts');if(member?.role!=='admin')redirect('/');return <AccountManagement me={{id:member.id,role:member.role}}/>}
