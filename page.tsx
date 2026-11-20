import {AccountSettings} from '@/components/account-settings';
import {pageMember} from '@/lib/page-access';
import AccountManagement from '@/components/account-management';
export const dynamic='force-dynamic';
export default async function Page(){const member=await pageMember('/accounts');if(!member)return null;if(member.role!=='admin')return <AccountSettings id={member.id} name={member.name} email={member.email}/>;return <AccountManagement me={{id:member.id,role:member.role}}/>}
