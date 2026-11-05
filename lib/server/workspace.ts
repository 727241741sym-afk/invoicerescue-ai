import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { adminDb, AppError, assertDb, merchantContext } from "./db";
import {
  getPayPalInvoice,
  normalizedInvoice,
  paypalRequest,
  PayPalError,
} from "./paypal";
import { analyzeMessage } from "./ai";
import {
  dateInZone,
  reminderBlock,
  validPromiseDate,
  validateDraft,
} from "../policy";
import type {
  AuditEntry,
  Invoice,
  Recommendation,
  WorkspaceData,
} from "../types";

type Context = Awaited<ReturnType<typeof merchantContext>>;

export async function workspaceData(context: Context): Promise<WorkspaceData> {
  const { db, ownerId } = context;
  const results = await Promise.all([
    db
      .from("invoices")
      .select("*")
      .eq("owner_id", ownerId)
      .order("created_at", { ascending: false }),
    db
      .from("recommendations")
      .select("*")
      .eq("owner_id", ownerId)
      .order("created_at", { ascending: false })
      .limit(200),
    db
      .from("audit_log")
      .select("id,invoice_id,title,detail,created_at")
      .eq("owner_id", ownerId)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);
  results.forEach((result) => assertDb(result.error));
  return {
    invoices: results[0].data as Invoice[],
    recommendations: results[1].data as Recommendation[],
    audit: results[2].data as AuditEntry[],
  };
}

export async function invoiceFor(context: Context, invoiceId: string) {
  const { data, error } = await context.db
    .from("invoices")
    .select("*")
    .eq("owner_id", context.ownerId)
    .eq("id", invoiceId)
    .maybeSingle();
  assertDb(error);
  if (!data) throw new AppError("Invoice not found.", 404);
  return data as Invoice;
}

export async function audit(
  context: Context,
  invoiceId: string | null,
  title: string,
  detail: string,
) {
  assertDb(
    (
      await context.db
        .from("audit_log")
        .insert({
          owner_id: context.ownerId,
          invoice_id: invoiceId,
          title,
          detail,
        })
    ).error,
  );
}

export async function reconcileInvoice(context: Context, invoice: Invoice) {
  if (!invoice.paypal_id)
    throw new AppError("This invoice does not have a PayPal ID.");
  const startedAt = new Date().toISOString();
  const raw = await getPayPalInvoice(invoice.paypal_id);
  const normalized = normalizedInvoice(raw, context.ownerId);
  const { data, error } = await context.db.rpc("reconcile_invoice", {
    p_owner_id: context.ownerId,
    p_invoice_id: invoice.id,
    p_data: normalized,
    p_started_at: startedAt,
  });
  assertDb(error);
  return data as Invoice;
}

export async function syncInvoices(context: Context) {
  let page = 1;
  let count = 0;
  let skipped = 0;
  while (page <= 1000) {
    const raw = z
      .object({
        items: z.array(z.object({ id: z.string() }).passthrough()).default([]),
        total_pages: z.number().optional(),
      })
      .parse(
        await paypalRequest(
          `/v2/invoicing/invoices?page=${page}&page_size=100&total_required=true`,
        ),
      );
    for (const item of raw.items) {
      const { data: existing, error: lookupError } = await context.db
        .from("invoices")
        .select("*")
        .eq("paypal_id", item.id)
        .eq("owner_id", context.ownerId)
        .maybeSingle();
      assertDb(lookupError);
      if (existing) await reconcileInvoice(context, existing as Invoice);
      else {
        const invoice = await getPayPalInvoice(item.id);
        if (invoice.amount.currency_code !== "USD") {
          skipped++;
          continue;
        }
        assertDb(
          (
            await context.db
              .from("invoices")
              .upsert(
                {
                  ...normalizedInvoice(invoice, context.ownerId),
                  reconciled_at: new Date().toISOString(),
                },
                { onConflict: "paypal_id", ignoreDuplicates: true },
              )
          ).error,
        );
      }
      count++;
    }
    if (raw.items.length < 100 || (raw.total_pages && page >= raw.total_pages))
      break;
    page++;
  }
  await audit(
    context,
    null,
    "PayPal invoices synchronized",
    `${count} USD invoice(s) checked. ${skipped} non-USD invoice(s) skipped.`,
  );
  return { count, skipped };
}

export const newInvoiceSchema = z
  .object({
    operationId: z.uuid(),
    customerName: z.string().trim().min(1).max(100),
    customerEmail: z.email().max(200),
    description: z.string().trim().min(1).max(200),
    amount: z
      .string()
      .regex(/^\d{1,7}(\.\d{1,2})?$/)
      .refine(
        (value) => Number(value) > 0 && Number(value) <= 100000,
        "Use an amount up to $100,000.",
      ),
    dueDate: z.iso.date(),
  })
  .strict();

async function claimOperation(
  context: Context,
  operationId: string,
  kind: string,
  invoiceId: string | null,
  payload: unknown,
) {
  const hash = createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");
  const { data, error } = await context.db.rpc("claim_operation", {
    p_owner_id: context.ownerId,
    p_key: operationId,
    p_kind: kind,
    p_invoice_id: invoiceId,
    p_payload_hash: hash,
  });
  if (error)
    throw new AppError(
      "This operation conflicts with a previous request. Refresh the workspace.",
      409,
    );
  const result = data as { fresh: boolean; state: string; result: unknown };
  if (!result.fresh && result.state !== "succeeded")
    throw new AppError(
      "This request was already attempted. Synchronize with PayPal before creating another request.",
      409,
    );
  return result;
}

async function finishOperation(
  context: Context,
  operationId: string,
  state: string,
  result: unknown,
) {
  assertDb(
    (
      await context.db
        .from("operations")
        .update({ state, result, updated_at: new Date().toISOString() })
        .eq("id", operationId)
        .eq("owner_id", context.ownerId)
    ).error,
  );
}

function failureState(error: unknown) {
  return error instanceof PayPalError &&
    error.httpStatus >= 400 &&
    error.httpStatus < 500
    ? "failed"
    : "uncertain";
}

export async function createInvoice(
  context: Context,
  input: z.infer<typeof newInvoiceSchema>,
) {
  const today = dateInZone(new Date(), process.env.MERCHANT_TIMEZONE);
  if (input.dueDate < today)
    throw new AppError("Choose today or a future due date.");
  const claim = await claimOperation(
    context,
    input.operationId,
    "create",
    null,
    input,
  );
  if (!claim.fresh) return claim.result;
  try {
    const payload = {
      detail: {
        invoice_number: `IR-${input.operationId.slice(0, 8).toUpperCase()}`,
        invoice_date: today,
        currency_code: "USD",
        payment_term: {
          term_type: "DUE_ON_DATE_SPECIFIED",
          due_date: input.dueDate,
        },
      },
      ...(process.env.PAYPAL_MERCHANT_EMAIL
        ? { invoicer: { email_address: process.env.PAYPAL_MERCHANT_EMAIL } }
        : {}),
      primary_recipients: [
        {
          billing_info: {
            email_address: input.customerEmail,
            business_name: input.customerName,
          },
        },
      ],
      items: [
        {
          name: input.description,
          quantity: "1",
          unit_amount: {
            currency_code: "USD",
            value: Number(input.amount).toFixed(2),
          },
        },
      ],
      configuration: {
        allow_tip: false,
        partial_payment: { allow_partial_payment: true },
      },
    };
    const created = z
      .object({ id: z.string() })
      .parse(
        await paypalRequest(
          "/v2/invoicing/invoices",
          "POST",
          payload,
          input.operationId,
        ),
      );
    const raw = await getPayPalInvoice(created.id);
    const { data, error } = await context.db
      .from("invoices")
      .upsert(
        {
          ...normalizedInvoice(raw, context.ownerId),
          reconciled_at: new Date().toISOString(),
        },
        { onConflict: "paypal_id" },
      )
      .select()
      .single();
    assertDb(error);
    await finishOperation(context, input.operationId, "succeeded", data);
    await audit(
      context,
      data.id,
      "Sandbox draft created",
      `${data.number} · PayPal ${created.id}`,
    );
    return data;
  } catch (error) {
    await finishOperation(context, input.operationId, failureState(error), {
      error: "Refresh PayPal status before retrying.",
    });
    throw error;
  }
}

export async function sendInvoice(
  context: Context,
  invoiceId: string,
  operationId: string,
) {
  const invoice = await reconcileInvoice(
    context,
    await invoiceFor(context, invoiceId),
  );
  if (invoice.status !== "DRAFT")
    throw new AppError(
      "Only a draft invoice can be sent. Refresh the invoice status.",
      409,
    );
  const claim = await claimOperation(context, operationId, "send", invoiceId, {
    invoiceId,
  });
  if (!claim.fresh) return claim.result;
  try {
    await paypalRequest(
      `/v2/invoicing/invoices/${invoice.paypal_id}/send`,
      "POST",
      { send_to_recipient: true, send_to_invoicer: false },
      operationId,
    );
    const updated = await reconcileInvoice(context, invoice);
    await finishOperation(context, operationId, "succeeded", updated);
    await audit(
      context,
      invoiceId,
      "Sandbox invoice sent",
      "Merchant approved sending through PayPal. PayPal accepted the request.",
    );
    return updated;
  } catch (error) {
    await finishOperation(context, operationId, failureState(error), {
      error: "Synchronize this invoice before attempting another send.",
    });
    throw error;
  }
}

export async function analyzeInvoice(
  context: Context,
  input: { invoiceId: string; message: string; receivedAt: string },
) {
  const invoice = await reconcileInvoice(
    context,
    await invoiceFor(context, input.invoiceId),
  );
  const reservation = await context.db.rpc("reserve_ai_analysis", {
    p_owner_id: context.ownerId,
  });
  if (reservation.error)
    throw new AppError(
      "The workspace's daily AI analysis limit has been reached.",
      429,
    );
  const analysis = await analyzeMessage(
    invoice,
    input.message,
    input.receivedAt,
  );
  const { data, error } = await context.db.rpc("save_analysis", {
    p_owner_id: context.ownerId,
    p_invoice_id: invoice.id,
    p_message: input.message,
    p_received_at: input.receivedAt,
    p_analysis: analysis,
  });
  assertDb(error);
  return data;
}

export async function decideRecommendation(
  context: Context,
  id: string,
  decision: "approve" | "reject",
  draft: string,
  promiseDate: string | null,
) {
  const { data: record, error } = await context.db
    .from("recommendations")
    .select("*")
    .eq("owner_id", context.ownerId)
    .eq("id", id)
    .maybeSingle();
  assertDb(error);
  if (!record) throw new AppError("Recommendation not found.", 404);
  const recommendation = record as Recommendation;
  if (recommendation.status === "executed" && decision === "approve")
    return { status: "executed" };
  if (recommendation.status !== "pending")
    throw new AppError(
      "This recommendation has already been reviewed. Refresh the workspace.",
      409,
    );
  if (decision === "reject") {
    const update = await context.db
      .from("recommendations")
      .update({ status: "rejected" })
      .eq("id", id)
      .eq("owner_id", context.ownerId)
      .eq("status", "pending")
      .select("id");
    assertDb(update.error);
    if (!update.data?.length)
      throw new AppError("This recommendation has already been reviewed.", 409);
    await audit(
      context,
      recommendation.invoice_id,
      "Recommendation rejected",
      "Merchant rejected this proposed action.",
    );
    return { status: "rejected" };
  }
  const invoice = await reconcileInvoice(
    context,
    await invoiceFor(context, recommendation.invoice_id),
  );
  const today = dateInZone(new Date(), process.env.MERCHANT_TIMEZONE);
  const outgoing = ["prepare_reminder", "resend_payment_link"].includes(
    recommendation.action,
  );
  if (outgoing) {
    const blocked =
      reminderBlock(invoice, today) || validateDraft(draft, invoice.paypal_url);
    if (blocked) throw new AppError(blocked, 409);
    if (recommendation.action === "resend_payment_link" && !invoice.paypal_url)
      throw new AppError(
        "PayPal has not provided a Sandbox payment link yet.",
        409,
      );
  }
  if (
    recommendation.action === "record_promise" &&
    !validPromiseDate(promiseDate, today)
  )
    throw new AppError("Confirm a valid future payment date.");
  const claimed = await context.db.rpc("claim_recommendation", {
    p_owner_id: context.ownerId,
    p_recommendation_id: id,
    p_draft: draft,
    p_promise_date: promiseDate,
    p_today: today,
  });
  if (claimed.error)
    throw new AppError(
      "The action is no longer eligible, or the reminder limit has been reached. Refresh the workspace.",
      409,
    );
  if (!outgoing) return { status: "executed" };
  try {
    const note =
      recommendation.action === "resend_payment_link"
        ? `${draft}\n\n${invoice.paypal_url}`
        : draft;
    await paypalRequest(
      `/v2/invoicing/invoices/${invoice.paypal_id}/remind`,
      "POST",
      { note, send_to_payer: true, send_to_invoicer: false },
      id,
    );
    const finished = await context.db.rpc("finish_recommendation", {
      p_owner_id: context.ownerId,
      p_recommendation_id: id,
      p_state: "succeeded",
    });
    assertDb(finished.error);
    return { status: "executed" };
  } catch (error) {
    const state = failureState(error);
    assertDb(
      (
        await context.db.rpc("finish_recommendation", {
          p_owner_id: context.ownerId,
          p_recommendation_id: id,
          p_state: state,
        })
      ).error,
    );
    throw error;
  }
}

export async function webhookReconcile(paypalId: string) {
  const db = adminDb();
  const { data, error } = await db
    .from("invoices")
    .select("*")
    .eq("paypal_id", paypalId)
    .maybeSingle();
  assertDb(error);
  if (!data) return false;
  await reconcileInvoice({ db, ownerId: data.owner_id }, data as Invoice);
  return true;
}
