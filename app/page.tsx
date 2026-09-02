import {redirect} from 'next/navigation';import Home from '@/components/production-desk';import {pageMember,AccessPending} from '@/lib/page-access';import {InstallApp} from '@/components/install-app';
export const dynamic='force-dynamic';

export default async function Page(){const m=await pageMember('/');if(!m)return <AccessPending/>;if(m.role==='installer')redirect('/installers/');return <><link rel="manifest" href="/manifest.webmanifest" crossOrigin="use-credentials"/><Home/><InstallApp/></>}
