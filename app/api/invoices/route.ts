import {
  apiError,
  AppError,
  checkMutationOrigin,
  merchantContext,
} from "@/lib/server/db";
import { createInvoice, newInvoiceSchema } from "@/lib/server/workspace";

export async function POST(request: Request) {
  try {
    checkMutationOrigin(request);
    const context = await merchantContext();
    const text = await request.text();
    if (text.length > 16_000)
      throw new AppError("The request is too large.", 413);
    return Response.json(
      await createInvoice(context, newInvoiceSchema.parse(JSON.parse(text))),
    );
  } catch (error) {
    return apiError(error);
  }
}
