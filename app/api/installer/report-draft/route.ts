import { actor, apiError, sameOrigin } from "@/lib/access";
import { requireLocation } from "@/lib/location-store";
import { saveReportDraft } from "@/lib/operations-store";

export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const member = await actor(request);
    await requireLocation(request, member);
    const input = await request.json();
    return Response.json(await saveReportDraft(member, input), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}
