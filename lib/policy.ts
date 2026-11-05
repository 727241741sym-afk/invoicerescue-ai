import type { ActionType, Classification, Invoice } from "./types";

export function money(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

export function dateInZone(date = new Date(), timezone = "Asia/Hong_Kong") {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function toCents(value: string) {
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(value))
    throw new Error("Invalid USD amount");
  const [whole, decimals = ""] = value.split(".");
  const result = Number(whole) * 100 + Number(decimals.padEnd(2, "0"));
  if (!Number.isSafeInteger(result)) throw new Error("Amount is too large");
  return result;
}

export function isSettled(invoice: Pick<Invoice, "status">) {
  return [
    "PAID",
    "MARKED_AS_PAID",
    "CANCELLED",
    "REFUNDED",
    "MARKED_AS_REFUNDED",
  ].includes(invoice.status);
}

export function daysOverdue(invoice: Invoice, today: string) {
  if (
    isSettled(invoice) ||
    invoice.status === "DRAFT" ||
    invoice.status === "SCHEDULED"
  )
    return 0;
  return Math.max(
    0,
    Math.floor((Date.parse(today) - Date.parse(invoice.due_date)) / 86_400_000),
  );
}

export function reminderBlock(invoice: Invoice, today: string) {
  if (isSettled(invoice))
    return "This invoice is settled or closed. Further reminders are blocked.";
  if (!["SENT", "UNPAID", "PARTIALLY_PAID"].includes(invoice.status))
    return "The invoice is not in a payable state. Check its PayPal status first.";
  if (invoice.due_cents <= 0)
    return "There is no confirmed outstanding balance.";
  if (invoice.paused) return "Reminders are paused for this invoice.";
  if (invoice.promise_date && today <= invoice.promise_date)
    return `A payment promise is active through ${invoice.promise_date}.`;
  return null;
}

export function allowedAction(
  classification: Classification,
  confidence: number,
): ActionType {
  if (confidence < 0.65) return "human_review";
  const actions: Record<Classification, ActionType> = {
    forgot_to_pay: "prepare_reminder",
    missing_payment_link: "resend_payment_link",
    missing_invoice_information: "request_information",
    invoice_dispute: "human_review",
    cash_flow_difficulty: "human_review",
    promise_to_pay: "record_promise",
    already_paid_claim: "human_review",
    unknown: "human_review",
  };
  return actions[classification];
}

export function validateDraft(draft: string, canonicalUrl: string | null) {
  if (!draft.trim() || draft.length > 1800)
    return "Use a message between 1 and 1,800 characters.";
  const urls = draft.match(/https?:\/\/[^\s<>]+|www\.[^\s<>]+/gi) || [];
  if (urls.some((url) => url.replace(/[.,!?)]+$/, "") !== canonicalUrl))
    return "Messages may contain only the verified PayPal payment link.";
  return null;
}

export function validPromiseDate(value: string | null, today: string) {
  return Boolean(
    value &&
      /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      Number.isFinite(Date.parse(value)) &&
      new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value &&
      value >= today,
  );
}

export function statusLabel(invoice: Invoice, today: string) {
  if (invoice.status === "PAID") return "Paid";
  if (invoice.status === "MARKED_AS_PAID") return "Recorded paid";
  if (invoice.status === "PAYMENT_PENDING") return "Payment pending";
  if (invoice.status === "PARTIALLY_PAID") return "Partially paid";
  if (invoice.status === "DRAFT") return "Draft";
  if (isSettled(invoice)) return "Closed";
  if (invoice.paused) return "On hold";
  if (invoice.promise_date && today <= invoice.promise_date)
    return "Promise to pay";
  if (daysOverdue(invoice, today)) return "Overdue";
  return invoice.status === "SCHEDULED" ? "Scheduled" : "Awaiting payment";
}
