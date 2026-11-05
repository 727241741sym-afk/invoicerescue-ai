import { z } from "zod";
import { adminDb, assertDb } from "@/lib/server/db";
import { paypalRequest } from "@/lib/server/paypal";
import { webhookReconcile } from "@/lib/server/workspace";

export const maxDuration = 60;
const eventSchema = z
  .object({
    id: z.string().min(1).max(200),
    event_type: z.string(),
    resource: z
      .object({
        id: z.string().optional(),
        invoice_id: z.string().optional(),
        invoice: z.object({ id: z.string() }).passthrough().optional(),
      })
      .passthrough(),
  })
  .passthrough();

export async function POST(request: Request) {
  if (!process.env.PAYPAL_WEBHOOK_ID)
    return Response.json(
      { error: "Webhook registration is required." },
      { status: 503 },
    );
  let eventId: string | undefined;
  const db = adminDb();
  try {
    const raw = await request.text();
    if (raw.length > 1_000_000) return new Response(null, { status: 413 });
    const payload = JSON.parse(raw);
    const event = eventSchema.parse(payload);
    const headerNames = [
      "paypal-auth-algo",
      "paypal-cert-url",
      "paypal-transmission-id",
      "paypal-transmission-sig",
      "paypal-transmission-time",
    ];
    if (headerNames.some((name) => !request.headers.get(name)))
      return new Response(null, { status: 400 });
    const certificate = new URL(request.headers.get("paypal-cert-url")!);
    if (
      certificate.protocol !== "https:" ||
      ![
        "api.paypal.com",
        "api.sandbox.paypal.com",
        "api-m.paypal.com",
        "api-m.sandbox.paypal.com",
      ].includes(certificate.hostname)
    )
      return new Response(null, { status: 400 });
    const verification = z.object({ verification_status: z.string() }).parse(
      await paypalRequest(
        "/v1/notifications/verify-webhook-signature",
        "POST",
        {
          auth_algo: request.headers.get("paypal-auth-algo"),
          cert_url: certificate.href,
          transmission_id: request.headers.get("paypal-transmission-id"),
          transmission_sig: request.headers.get("paypal-transmission-sig"),
          transmission_time: request.headers.get("paypal-transmission-time"),
          webhook_id: process.env.PAYPAL_WEBHOOK_ID,
          webhook_event: payload,
        },
      ),
    );
    if (verification.verification_status !== "SUCCESS")
      return new Response(null, { status: 400 });
    const claim = await db.rpc("claim_webhook", {
      p_event_id: event.id,
      p_payload: payload,
    });
    assertDb(claim.error);
    if (!claim.data) {
      const { data, error } = await db
        .from("webhook_events")
        .select("state")
        .eq("id", event.id)
        .single();
      assertDb(error);
      return Response.json(
        { duplicate: true },
        { status: data?.state === "processed" ? 200 : 503 },
      );
    }
    eventId = event.id;
    if (event.event_type.startsWith("INVOICING.INVOICE.")) {
      // Actual Invoicing notifications wrap the invoice in resource.invoice.
      // Older/direct payload shapes remain accepted after signature verification.
      const paypalId = [
        event.resource.invoice?.id,
        event.resource.id,
        event.resource.invoice_id,
      ].find((id) => id && /^INV2-[A-Z0-9-]+$/.test(id));
      if (!paypalId) throw new Error("Invoice notification has no invoice ID");
      await webhookReconcile(paypalId);
    }
    assertDb(
      (
        await db
          .from("webhook_events")
          .update({
            state: "processed",
            processed_at: new Date().toISOString(),
          })
          .eq("id", event.id)
      ).error,
    );
    return Response.json({ received: true });
  } catch {
    if (eventId)
      await db
        .from("webhook_events")
        .update({ state: "failed" })
        .eq("id", eventId);
    return Response.json(
      { error: "Webhook could not be processed. Delivery should be retried." },
      { status: 503 },
    );
  }
}
