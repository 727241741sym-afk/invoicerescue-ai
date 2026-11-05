import "server-only";
import { z } from "zod";
import { AppError } from "./db";
import { toCents } from "../policy";
import type { Invoice } from "../types";

const SANDBOX_API = "https://api-m.sandbox.paypal.com";
const amount = z.object({ currency_code: z.string(), value: z.string() });
export const paypalInvoiceSchema = z
  .object({
    id: z.string(),
    status: z.string(),
    amount,
    due_amount: amount.optional(),
    detail: z
      .object({
        invoice_number: z.string().optional(),
        invoice_date: z.string().optional(),
        payment_term: z.object({ due_date: z.string().optional() }).optional(),
        metadata: z
          .object({ recipient_view_url: z.string().optional() })
          .optional(),
      })
      .passthrough(),
    primary_recipients: z
      .array(
        z
          .object({
            billing_info: z
              .object({
                email_address: z.string().optional(),
                business_name: z.string().optional(),
                name: z
                  .object({
                    given_name: z.string().optional(),
                    surname: z.string().optional(),
                  })
                  .optional(),
              })
              .optional(),
          })
          .passthrough(),
      )
      .optional(),
    items: z.array(z.object({ name: z.string() }).passthrough()).optional(),
  })
  .passthrough();
export type PayPalInvoice = z.infer<typeof paypalInvoiceSchema>;

export class PayPalError extends AppError {
  constructor(
    public httpStatus: number,
    public code: string,
  ) {
    super(
      httpStatus === 429
        ? "PayPal's request limit has been reached. Please try later."
        : `PayPal could not confirm this operation (${code}).`,
      502,
    );
  }
}

async function accessToken(fresh = false) {
  const response = await fetch(`${SANDBOX_API}/v1/oauth2/token`, {
    method: "POST",
    cache: "no-store",
    headers: {
      authorization: `Basic ${Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString("base64")}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      ...(fresh ? { ignoreCache: "true" } : {}),
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const data = await response.json();
  if (!response.ok || typeof data.access_token !== "string")
    throw new PayPalError(response.status, "AUTHENTICATION_FAILED");
  if (
    typeof data.scope === "string" &&
    !data.scope.includes("invoicing") &&
    !fresh
  )
    return accessToken(true);
  return data.access_token as string;
}

export async function paypalRequest(
  path: string,
  method = "GET",
  body?: unknown,
  operationId?: string,
): Promise<unknown> {
  if (!/^\/v[12]\/[a-z0-9/_.?=&%-]+$/i.test(path))
    throw new AppError("Invalid Sandbox API path.");
  const token = await accessToken();
  const response = await fetch(`${SANDBOX_API}${path}`, {
    method,
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...(operationId ? { "PayPal-Request-Id": operationId } : {}),
      ...(method === "POST" ? { Prefer: "return=representation" } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok)
    throw new PayPalError(
      response.status,
      typeof data?.name === "string" ? data.name : "REQUEST_FAILED",
    );
  return data;
}

export async function getPayPalInvoice(id: string) {
  if (!/^INV2-[A-Z0-9-]+$/.test(id))
    throw new AppError("Invalid PayPal invoice ID.");
  return paypalInvoiceSchema.parse(
    await paypalRequest(`/v2/invoicing/invoices/${id}`),
  );
}

export function normalizedInvoice(raw: PayPalInvoice, ownerId: string) {
  if (
    raw.amount.currency_code !== "USD" ||
    (raw.due_amount && raw.due_amount.currency_code !== "USD")
  )
    throw new AppError(
      "This MVP supports USD invoices. Other currencies were skipped.",
    );
  const recipient = raw.primary_recipients?.[0]?.billing_info;
  const total = toCents(raw.amount.value);
  const due = raw.due_amount
    ? toCents(raw.due_amount.value)
    : ["PAID", "MARKED_AS_PAID", "REFUNDED", "MARKED_AS_REFUNDED"].includes(
          raw.status,
        )
      ? 0
      : total;
  const link = raw.detail.metadata?.recipient_view_url;
  let paymentUrl: string | null = null;
  if (link) {
    const url = new URL(link);
    if (
      url.protocol === "https:" &&
      ["www.sandbox.paypal.com", "sandbox.paypal.com"].includes(url.hostname)
    )
      paymentUrl = url.href;
  }
  return {
    owner_id: ownerId,
    paypal_id: raw.id,
    number: raw.detail.invoice_number || raw.id,
    customer_name:
      recipient?.business_name ||
      [recipient?.name?.given_name, recipient?.name?.surname]
        .filter(Boolean)
        .join(" ") ||
      recipient?.email_address ||
      "Sandbox customer",
    customer_email: recipient?.email_address || "",
    description:
      raw.items?.map((item) => item.name).join(", ") || "PayPal invoice",
    currency: "USD" as const,
    total_cents: total,
    due_cents: due,
    status: raw.status,
    due_date:
      raw.detail.payment_term?.due_date ||
      raw.detail.invoice_date ||
      new Date().toISOString().slice(0, 10),
    paypal_url: paymentUrl,
  } satisfies Omit<Invoice, "id" | "paused" | "promise_date" | "updated_at">;
}
