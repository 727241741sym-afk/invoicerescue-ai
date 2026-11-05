export const classifications = [
  "forgot_to_pay",
  "missing_payment_link",
  "missing_invoice_information",
  "invoice_dispute",
  "cash_flow_difficulty",
  "promise_to_pay",
  "already_paid_claim",
  "unknown",
] as const;
export const actionTypes = [
  "resend_payment_link",
  "prepare_reminder",
  "request_information",
  "record_promise",
  "pause_reminders",
  "human_review",
  "no_action",
] as const;
export type Classification = (typeof classifications)[number];
export type ActionType = (typeof actionTypes)[number];
export type RecommendationStatus =
  | "pending"
  | "executing"
  | "executed"
  | "rejected"
  | "blocked"
  | "uncertain"
  | "failed";

export type Invoice = {
  id: string;
  owner_id: string;
  paypal_id: string | null;
  number: string;
  customer_name: string;
  customer_email: string;
  description: string;
  currency: "USD";
  total_cents: number;
  due_cents: number;
  status: string;
  due_date: string;
  paypal_url: string | null;
  paused: boolean;
  promise_date: string | null;
  updated_at: string;
};

export type Recommendation = {
  id: string;
  owner_id: string;
  invoice_id: string;
  message_id: string | null;
  classification: Classification;
  confidence: number;
  evidence: string[];
  action: ActionType;
  draft: string;
  promise_date: string | null;
  status: RecommendationStatus;
  reason: string;
  created_at: string;
};

export type AuditEntry = {
  id: string;
  invoice_id: string | null;
  title: string;
  detail: string;
  created_at: string;
};
export type WorkspaceData = {
  invoices: Invoice[];
  recommendations: Recommendation[];
  audit: AuditEntry[];
};

export const classificationLabels: Record<Classification, string> = {
  forgot_to_pay: "Forgot to pay",
  missing_payment_link: "Missing payment link",
  missing_invoice_information: "Missing invoice details",
  invoice_dispute: "Invoice dispute",
  cash_flow_difficulty: "Cash flow difficulty",
  promise_to_pay: "Promise to pay",
  already_paid_claim: "Payment needs checking",
  unknown: "Needs more context",
};

export const actionLabels: Record<ActionType, string> = {
  resend_payment_link: "Share payment link",
  prepare_reminder: "Send a polite reminder",
  request_information: "Request missing information",
  record_promise: "Record payment promise",
  pause_reminders: "Pause reminders",
  human_review: "Review with a human",
  no_action: "Take no action",
};
