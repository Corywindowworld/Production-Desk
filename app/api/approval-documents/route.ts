import {PDFDocument} from 'pdf-lib';
import {z} from 'zod';
import {actor, apiError, ApiError, jobFor, sameOrigin} from '@/lib/access';
import {approvedLaborToClear, laborMatchesReport} from '@/lib/approval-paperwork';
import {paperworkPdf} from '@/lib/completion-batch-pdf';
import {jobCertificatePdf} from '@/lib/job-certificate-pdf';
import {requireLocation} from '@/lib/location-store';

const selection = z.object({jobIds: z.array(z.string().uuid()).min(1).max(20)});
export const maxDuration = 60;

export async function POST(request: Request) {
 try {
  sameOrigin(request);
  const member = await actor(request);
  if (!['admin', 'supervisor'].includes(member.role)) throw new ApiError(403, 'Supervisor or administrator access required.');
  await requireLocation(request, member);
  const {jobIds} = selection.parse(await request.json());
  const pdf = await PDFDocument.create();
  const append = async (bytes: Uint8Array) => {
   const source = await PDFDocument.load(bytes);
   for (const page of await pdf.copyPages(source, source.getPageIndices())) pdf.addPage(page);
  };
  for (const id of new Set(jobIds)) {
   const job = await jobFor(member, id);
   const report = job.operations?.report;
   const sheets = approvedLaborToClear(job);
   const certificates = new Set<string>();
   const appendCertificate = async (certificate: any) => {
    if (!certificate) return;
    const key = certificate.id || JSON.stringify(certificate);
    if (certificates.has(key)) return;
    certificates.add(key);
    await append(await jobCertificatePdf(certificate));
   };
   if (report?.approved && (!report.approvalDismissed || sheets.some((sheet: any) => laborMatchesReport(sheet, report)))) {
    await appendCertificate(report.certificate);
   }
   for (const sheet of sheets) await appendCertificate(sheet.packetJob?.operations?.report?.certificate);
   for (const sheet of sheets) await append(await paperworkPdf(sheet.packetJob || job, sheet, 'labor'));
   const lead = job.operations?.leadRenovation?.signatureDataUrl
    ? job.operations.leadRenovation
    : sheets.map((sheet: any) => sheet.packetJob?.operations?.leadRenovation).find((form: any) => form?.signatureDataUrl);
   if (lead?.signatureDataUrl) await append(await paperworkPdf(job, lead, 'lead'));
  }
  if (!pdf.getPageCount()) throw new ApiError(409, 'No approved certificates, labor sheets, or signed lead sheets are available for these jobs.');
  return new Response(Buffer.from(await pdf.save()), {headers: {
   'Content-Type': 'application/pdf',
   'Content-Disposition': 'inline; filename="approval-documents.pdf"',
   'Cache-Control': 'no-store',
  }});
 } catch (error) {
  if (error instanceof z.ZodError) return Response.json({error: 'Select up to 20 jobs to print.'}, {status: 400});
  return apiError(error);
 }
}
