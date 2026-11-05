import { z } from "zod";
import {
  apiError,
  checkMutationOrigin,
  merchantContext,
} from "@/lib/server/db";
import { decideRecommendation } from "@/lib/server/workspace";

const inputSchema = z
  .object({
    decision: z.enum(["approve", "reject"]),
    draft: z.string().min(1).max(1800),
    promiseDate: z.iso.date().nullable().default(null),
  })
  .strict();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    checkMutationOrigin(request);
    const context = await merchantContext();
    const { id } = await params;
    z.uuid().parse(id);
    const input = inputSchema.parse(await request.json());
    return Response.json(
      await decideRecommendation(
        context,
        id,
        input.decision,
        input.draft,
        input.promiseDate,
      ),
    );
  } catch (error) {
    return apiError(error);
  }
}
