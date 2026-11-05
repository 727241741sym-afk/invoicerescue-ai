import { z } from "zod";
import {
  apiError,
  AppError,
  checkMutationOrigin,
  merchantContext,
} from "@/lib/server/db";
import { analyzeInvoice } from "@/lib/server/workspace";

export const maxDuration = 90;
const inputSchema = z
  .object({
    invoiceId: z.uuid(),
    message: z.string().trim().min(5).max(6000),
    receivedAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export async function POST(request: Request) {
  try {
    checkMutationOrigin(request);
    const context = await merchantContext();
    const text = await request.text();
    if (text.length > 30_000)
      throw new AppError("The message is too large.", 413);
    return Response.json(
      await analyzeInvoice(context, inputSchema.parse(JSON.parse(text))),
    );
  } catch (error) {
    return apiError(error);
  }
}
