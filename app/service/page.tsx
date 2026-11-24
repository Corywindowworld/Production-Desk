import {pageMember,AccessPending} from '@/lib/page-access';
import {LocationGate} from '@/components/location/location-gate';
import {SignOutButton} from '@/components/auth-forms';
import ServiceWorkspace from '@/components/service-workspace';
import {serviceDeskEnabled} from '@/lib/service-desk-availability';
import {redirect} from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function ServicePage() {
 const member = await pageMember('/service');
 if (!member) return <AccessPending />;
 const serviceAccount = ['service_manager','service_tech'].includes(member.role);
 if (!serviceDeskEnabled) {
  if (!serviceAccount) redirect('/');
  return <main className="accounts-page">
   <h1>Service Desk is temporarily unavailable</h1>
   <SignOutButton />
  </main>;
 }
 if (!serviceAccount && !['admin','supervisor'].includes(member.role)) redirect('/');
 return member.role === 'service_tech'
  ? <LocationGate memberId={member.id}><ServiceWorkspace /></LocationGate>
  : <ServiceWorkspace />;
}
