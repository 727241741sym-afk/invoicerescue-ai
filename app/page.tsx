import { redirect } from "next/navigation";
import { Dashboard } from "@/components/dashboard";
import { demoWorkspace } from "@/lib/demo";
import { merchantContext, AppError } from "@/lib/server/db";
import { workspaceData } from "@/lib/server/workspace";
import { dateInZone } from "@/lib/policy";
import { aiConnection } from "@/lib/server/ai-config";

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ workspace?: string }>;
}) {
  const sandbox = (await searchParams).workspace === "sandbox";
  let initialData = demoWorkspace(new Date().toISOString());
  if (sandbox) {
    try {
      initialData = await workspaceData(await merchantContext());
    } catch (error) {
      if (error instanceof AppError && [401, 403].includes(error.status))
        redirect("/login");
      throw error;
    }
  }
  const ai = aiConnection();
  return (
    <Dashboard
      initialData={initialData}
      mode={sandbox ? "sandbox" : "demo"}
      today={dateInZone(new Date(), process.env.MERCHANT_TIMEZONE)}
      connections={{
        ai: ai.label,
        model: ai.model || "Not configured",
        webhook: Boolean(process.env.PAYPAL_WEBHOOK_ID),
      }}
    />
  );
}
