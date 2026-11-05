import { describe, expect, it } from "vitest";
import { normalizedInvoice, paypalInvoiceSchema } from "@/lib/server/paypal";

const source = {
  id: "INV2-AAAA-BBBB-CCCC-DDDD",
  status: "PARTIALLY_PAID",
  amount: { currency_code: "USD", value: "100.00" },
  due_amount: { currency_code: "USD", value: "40.00" },
  detail: {
    invoice_number: "TEST-1",
    invoice_date: "2026-11-01",
    payment_term: { due_date: "2026-11-07" },
    metadata: {
      recipient_view_url: "https://www.sandbox.paypal.com/invoice/p/TEST",
    },
  },
  primary_recipients: [
    {
      billing_info: {
        business_name: "Test buyer",
        email_address: "buyer@example.com",
      },
    },
  ],
  items: [{ name: "Design services" }],
};

describe("PayPal authoritative mapping", () => {
  it("preserves partial balances", () => {
    const invoice = normalizedInvoice(
      paypalInvoiceSchema.parse(source),
      "owner",
    );
    expect(invoice.total_cents).toBe(10000);
    expect(invoice.due_cents).toBe(4000);
    expect(invoice.status).toBe("PARTIALLY_PAID");
  });
  it("preserves pending payment status", () =>
    expect(
      normalizedInvoice(
        paypalInvoiceSchema.parse({ ...source, status: "PAYMENT_PENDING" }),
        "owner",
      ).status,
    ).toBe("PAYMENT_PENDING"));
  it("rejects unsupported currencies", () =>
    expect(() =>
      normalizedInvoice(
        paypalInvoiceSchema.parse({
          ...source,
          amount: { currency_code: "EUR", value: "100.00" },
        }),
        "owner",
      ),
    ).toThrow("USD"));
  it.each([
    "https://paypal.com.attacker.example/pay",
    "https://www.paypal.com/invoice/p/LIVE",
    "http://www.sandbox.paypal.com/pay",
  ])("rejects unsafe payment URL %s", (url) => {
    const invoice = normalizedInvoice(
      paypalInvoiceSchema.parse({
        ...source,
        detail: { ...source.detail, metadata: { recipient_view_url: url } },
      }),
      "owner",
    );
    expect(invoice.paypal_url).toBeNull();
  });
});
