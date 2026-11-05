import { describe, expect, it } from "vitest";
import {
  allowedAction,
  dateInZone,
  isSettled,
  reminderBlock,
  statusLabel,
  toCents,
  validPromiseDate,
  validateDraft,
} from "@/lib/policy";
import { demoWorkspace } from "@/lib/demo";

const invoice = demoWorkspace("2026-11-05T03:00:00Z").invoices[0];

describe("payment eligibility", () => {
  it.each([
    "PAID",
    "MARKED_AS_PAID",
    "CANCELLED",
    "REFUNDED",
    "MARKED_AS_REFUNDED",
  ])("blocks reminders for %s", (status) => {
    expect(isSettled({ status })).toBe(true);
    expect(reminderBlock({ ...invoice, status }, "2026-11-05")).toContain(
      "settled or closed",
    );
  });
  it.each(["DRAFT", "SCHEDULED", "PAYMENT_PENDING", "UNKNOWN_NEW_STATUS"])(
    "blocks unconfirmed payable status %s",
    (status) => {
      expect(reminderBlock({ ...invoice, status }, "2026-11-05")).toContain(
        "not in a payable state",
      );
    },
  );
  it("allows only the remaining confirmed partial balance", () => {
    expect(
      reminderBlock(
        { ...invoice, status: "PARTIALLY_PAID", due_cents: 100 },
        "2026-11-05",
      ),
    ).toBeNull();
    expect(
      reminderBlock(
        { ...invoice, status: "PARTIALLY_PAID", due_cents: 0 },
        "2026-11-05",
      ),
    ).toContain("no confirmed");
  });
  it("suppresses reminders through the whole promised date", () => {
    const promised = { ...invoice, promise_date: "2026-11-06" };
    expect(reminderBlock(promised, "2026-11-06")).toContain("active through");
    expect(reminderBlock(promised, "2026-11-07")).toBeNull();
  });
  it("honors merchant pause before outgoing reminders", () =>
    expect(reminderBlock({ ...invoice, paused: true }, "2026-11-05")).toContain(
      "paused",
    ));
  it("keeps pending payments distinct from settled payments", () => {
    expect(isSettled({ status: "PAYMENT_PENDING" })).toBe(false);
    expect(
      statusLabel({ ...invoice, status: "PAYMENT_PENDING" }, "2026-11-05"),
    ).toBe("Payment pending");
  });
});

describe("deterministic AI policy", () => {
  it.each([
    "invoice_dispute",
    "cash_flow_difficulty",
    "already_paid_claim",
    "unknown",
  ] as const)("requires human review for %s", (classification) =>
    expect(allowedAction(classification, 1)).toBe("human_review"),
  );
  it("routes low-confidence decisions to human review", () =>
    expect(allowedAction("forgot_to_pay", 0.64)).toBe("human_review"));
  it("maps a supported blocker to a constrained action", () =>
    expect(allowedAction("missing_payment_link", 0.9)).toBe(
      "resend_payment_link",
    ));
  it("rejects links outside the authoritative invoice URL", () => {
    expect(
      validateDraft(
        "Pay at https://attacker.example",
        "https://sandbox.paypal.com/invoice/p/TEST",
      ),
    ).toContain("verified PayPal");
    expect(validateDraft("Pay at www.attacker.example", null)).toContain(
      "verified PayPal",
    );
    expect(validateDraft("Thank you for your reply.", null)).toBeNull();
    expect(
      validateDraft(
        "https://sandbox.paypal.com/invoice/p/TEST",
        "https://sandbox.paypal.com/invoice/p/TEST",
      ),
    ).toBeNull();
  });
  it("validates calendar dates including impossible dates", () => {
    expect(validPromiseDate("2026-02-30", "2026-02-01")).toBe(false);
    expect(validPromiseDate("2026-11-07", "2026-11-05")).toBe(true);
    expect(validPromiseDate("2026-11-04", "2026-11-05")).toBe(false);
  });
  it("uses merchant date when UTC is still the previous day", () =>
    expect(dateInZone(new Date("2026-11-04T17:00:00Z"), "Asia/Hong_Kong")).toBe(
      "2026-11-05",
    ));
  it("uses integer cents without rounding errors", () => {
    expect(toCents("0.29")).toBe(29);
    expect(toCents("120.5")).toBe(12050);
    expect(() => toCents("0.001")).toThrow();
    expect(() => toCents("-1.00")).toThrow();
  });
});
