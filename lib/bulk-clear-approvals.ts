import { database } from '@/db/raw';
import { ApiError, type Member } from './access';
import { dismissApprovedReport, dismissApprovedLabor } from './approval-paperwork';
import { reorderOperation } from './reorder-requests';
import { storedObject } from './stored-data';
import { z } from 'zod';

const selectionSchema = z.array(z.object({
  jobId: z.string().uuid(),
  version: z.number().int().positive(),
  kind: z.enum(['report', 'labor', 'reorder']),
  recordId: z.string().min(1).max(100).optional(),
})).min(1).max(100);

export async function bulkClearApprovals(member: Member, input: unknown, at: string) {
  if (!['admin', 'supervisor'].includes(member.role)) {
    throw new ApiError(403, 'Supervisor or administrator access required.');
  }
  const selected = selectionSchema.parse(input);
  const jobs = new Map<string, typeof selected>();
  for (const item of selected) jobs.set(item.jobId, [...(jobs.get(item.jobId) || []), item]);
  await database().transaction(async tx => {
    for (const jobId of [...jobs.keys()].sort()) {
      const items = jobs.get(jobId)!;
      const row = await tx.prepare('SELECT payload,version FROM jobs WHERE id=? FOR UPDATE').bind(jobId).first();
      if (!row || items.some(item => item.version !== row.version)) {
        throw new ApiError(409, 'An approval changed. Refresh and select the items again.');
      }
      const job = storedObject(row.payload), operations = job.operations;
      if (!operations) throw new ApiError(409, 'This job has no approvals to clear.');
      for (const item of items) {
        if (item.kind === 'report') {
          if (!operations.report?.approved || operations.report.pending) throw new ApiError(409, 'Review the result before clearing it.');
          dismissApprovedReport(operations, member.name, at);
        } else if (item.kind === 'labor') {
          const sheet = operations.laborSheets?.find((sheet: any) => sheet.id === item.recordId);
          if (sheet?.status !== 'Approved') throw new ApiError(409, 'Approve the labor sheet before clearing it.');
          dismissApprovedLabor(sheet, member.name, at);
        } else {
          await reorderOperation({tx, j:job, m:member, data:{command:'clearApproval', id:item.recordId}, at});
        }
      }
      job.history = [{at, by:member.name, text:'Selected approvals cleared. Saved paperwork retained.'}, ...(job.history || [])];
      await tx.prepare('UPDATE jobs SET payload=?,version=version+1,updated=? WHERE id=?').bind(JSON.stringify(job), at, jobId).run();
    }
  });
}
