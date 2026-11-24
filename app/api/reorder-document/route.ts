import {actor, apiError, ApiError, jobFor} from '@/lib/access';
import {requireLocation} from '@/lib/location-store';
import {reorderFormPdf} from '@/lib/reorder-form-pdf';

export async function GET(request: Request) {
 try {
  const member = await actor(request);
  await requireLocation(request, member);
  const {searchParams} = new URL(request.url);
  const job = await jobFor(member, searchParams.get('jobId') || '');
  const reorder = job.operations?.reorders?.find((record: {id: string}) => record.id === searchParams.get('reorderId'));
  if (!reorder) throw new ApiError(404, 'Reorder form not found.');
  return new Response(Buffer.from(await reorderFormPdf(job, reorder)), {headers: {
   'Content-Type': 'application/pdf',
   'Content-Disposition': 'attachment; filename="contractor-reorder.pdf"',
   'Cache-Control': 'no-store',
  }});
 } catch (error) {
  return apiError(error);
 }
}
