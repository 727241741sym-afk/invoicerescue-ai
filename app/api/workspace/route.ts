import { apiError, merchantContext } from "@/lib/server/db";
import { workspaceData } from "@/lib/server/workspace";

export async function GET() {
  try {
    return Response.json(await workspaceData(await merchantContext()), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}
