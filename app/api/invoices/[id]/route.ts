import { z } from "zod";
import {
  apiError,
  assertDb,
  checkMutationOrigin,
  merchantContext,
} from "@/lib/server/db";
import {
  audit,
  invoiceFor,
  reconcileInvoice,
  sendInvoice,
} from "@/lib/server/workspace";

const inputSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("sync") }).strict(),
  z.object({ action: z.literal("send"), operationId: z.uuid() }).strict(),
  z.object({ action: z.enum(["pause", "resume"]) }).strict(),
]);

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
    if (input.action === "sync")
      return Response.json(
        await reconcileInvoice(context, await invoiceFor(context, id)),
      );
    if (input.action === "send")
      return Response.json(await sendInvoice(context, id, input.operationId));
    await invoiceFor(context, id);
    const paused = input.action === "pause";
    assertDb(
      (
        await context.db
          .from("invoices")
          .update({ paused, updated_at: new Date().toISOString() })
          .eq("id", id)
          .eq("owner_id", context.ownerId)
      ).error,
    );
    await audit(
      context,
      id,
      paused ? "Application reminders paused" : "Application reminders resumed",
      "Merchant changed the application reminder policy. Existing payment promises still apply.",
    );
    return Response.json({ paused });
  } catch (error) {
    return apiError(error);
  }
}
