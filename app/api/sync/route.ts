import {
  apiError,
  checkMutationOrigin,
  merchantContext,
} from "@/lib/server/db";
import { syncInvoices } from "@/lib/server/workspace";

export const maxDuration = 60;
export async function POST(request: Request) {
  try {
    checkMutationOrigin(request);
    return Response.json(await syncInvoices(await merchantContext()));
  } catch (error) {
    return apiError(error);
  }
}
