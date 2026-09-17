import LiveOperations from '@/components/live-operations';
import {pageMember,AccessPending} from '@/lib/page-access';
import {InstallApp} from '@/components/install-app';
export const dynamic='force-dynamic';
export default async function Page(){const m=await pageMember('/');if(!m)return <AccessPending/>;return <><link rel="manifest" href="/manifest.webmanifest" crossOrigin="use-credentials"/><LiveOperations/><InstallApp/></>}
