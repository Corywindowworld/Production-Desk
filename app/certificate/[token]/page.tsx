import {CustomerCertificatePortal} from '@/components/customer-certificate-portal';
export const dynamic='force-dynamic';
export const metadata={title:'Window World · Customer certificate',robots:{index:false,follow:false},referrer:'no-referrer'};
export default async function Page({params}:{params:Promise<{token:string}>}){const {token}=await params;return <CustomerCertificatePortal token={token}/>;}
