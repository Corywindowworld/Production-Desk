import {redirect} from 'next/navigation';
import {pageMember} from '@/lib/page-access';
import {InstallerQuality} from '@/components/installer-quality';
import {GuildQualitySummary} from '@/components/guild-quality-summary';
export const dynamic='force-dynamic';
export default async function Page(){const m=await pageMember('/quality');if(!m||!['admin','supervisor'].includes(m.role))redirect('/');return <main className="accounts-page"><nav className="guild-tabs" aria-label="Production Desk sections"><a href="/">Dashboard</a><a href="/quality" aria-current="page">Guild Quality Scores</a>{m.role==='admin'&&<a href="/accounts">Account management</a>}</nav><GuildQualitySummary/><InstallerQuality editable/></main>}
