import {redirect} from 'next/navigation';
import {pageMember} from '@/lib/page-access';
import {AccountProfile} from '@/components/account-profile';
export const dynamic='force-dynamic';
export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params;const m=await pageMember('/accounts/'+encodeURIComponent(id));if(m?.role!=='admin')redirect('/');return <main className="accounts-page"><a href="/accounts">← Account management</a><AccountProfile id={id}/></main>}
