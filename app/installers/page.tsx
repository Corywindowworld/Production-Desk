import {redirect} from 'next/navigation';
import {pageMember,AccessPending} from '@/lib/page-access';import InstallerDesk from '@/components/installer-desk';import {InstallApp} from '@/components/install-app';
export const dynamic='force-dynamic';
export const metadata={title:'Installer Desk',appleWebApp:{capable:true,title:'Installer Desk',statusBarStyle:'default' as const}};
export default async function Page(){const m=await pageMember('/installers/');if(!m)return <AccessPending/>;if(m.role==='supervisor')redirect('/');return <><link rel="manifest" href="/installer.webmanifest" crossOrigin="use-credentials"/><InstallerDesk member={{name:m.name,role:m.role}}/><InstallApp name="Installer Desk"/></>}
