import { afterEach, describe, expect, it, vi } from "vitest";

const { rpc, paypal, reconcile, from } = vi.hoisted(() => ({
  rpc: vi.fn(),
  paypal: vi.fn(),
  reconcile: vi.fn(),
  from: vi.fn(),
}));
vi.mock("@/lib/server/db", () => ({
  adminDb: () => ({ rpc, from }),
  assertDb: (error: unknown) => {
    if (error) throw new Error("DB failure");
  },
}));
vi.mock("@/lib/server/paypal", () => ({ paypalRequest: paypal }));
vi.mock("@/lib/server/workspace", () => ({ webhookReconcile: reconcile }));
import { POST } from "@/app/api/paypal/webhook/route";

const event = {
  id: "WH-TEST",
  event_type: "INVOICING.INVOICE.PAID",
  resource: { id: "INV2-AAAA-BBBB-CCCC-DDDD", status: "PAID" },
};
const headers = {
  "paypal-auth-algo": "SHA256withRSA",
  "paypal-cert-url":
    "https://api.sandbox.paypal.com/v1/notifications/certs/CERT-TEST",
  "paypal-transmission-id": "transmission",
  "paypal-transmission-sig": "signature",
  "paypal-transmission-time": "2026-11-05T05:00:00Z",
};
const request = (overrides = {}, payload: unknown = event) =>
  new Request("http://127.0.0.1:3000/api/paypal/webhook", {
    method: "POST",
    headers: { ...headers, ...overrides },
    body: JSON.stringify(payload),
  });
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});

describe("verified webhook boundary", () => {
  it("fails closed when registration is missing", async () => {
    vi.stubEnv("PAYPAL_WEBHOOK_ID", "");
    expect((await POST(request())).status).toBe(503);
    expect(paypal).not.toHaveBeenCalled();
  });
  it("rejects invalid signatures before any database mutation", async () => {
    vi.stubEnv("PAYPAL_WEBHOOK_ID", "registered-id");
    paypal.mockResolvedValue({ verification_status: "FAILURE" });
    expect((await POST(request())).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
    expect(reconcile).not.toHaveBeenCalled();
  });
  it("rejects arbitrary certificate hosts", async () => {
    vi.stubEnv("PAYPAL_WEBHOOK_ID", "registered-id");
    expect(
      (
        await POST(
          request({ "paypal-cert-url": "https://attacker.example/cert" }),
        )
      ).status,
    ).toBe(400);
    expect(paypal).not.toHaveBeenCalled();
  });
  it("reconciles with PayPal instead of trusting the event's PAID label", async () => {
    vi.stubEnv("PAYPAL_WEBHOOK_ID", "registered-id");
    paypal.mockResolvedValue({ verification_status: "SUCCESS" });
    rpc.mockResolvedValue({ data: true, error: null });
    from.mockReturnValue({
      update: () => ({ eq: async () => ({ error: null }) }),
    });
    reconcile.mockResolvedValue(true);
    expect((await POST(request())).status).toBe(200);
    expect(reconcile).toHaveBeenCalledWith("INV2-AAAA-BBBB-CCCC-DDDD");
  });
  it("acknowledges processed duplicates without reconciling again", async () => {
    vi.stubEnv("PAYPAL_WEBHOOK_ID", "registered-id");
    paypal.mockResolvedValue({ verification_status: "SUCCESS" });
    rpc.mockResolvedValue({ data: false, error: null });
    from.mockReturnValue({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: { state: "processed" }, error: null }),
        }),
      }),
    });
    expect((await POST(request())).status).toBe(200);
    expect(reconcile).not.toHaveBeenCalled();
  });
  it("reconciles the nested invoice shape observed in a real Sandbox notification", async () => {
    vi.stubEnv("PAYPAL_WEBHOOK_ID", "registered-id");
    paypal.mockResolvedValue({ verification_status: "SUCCESS" });
    rpc.mockResolvedValue({ data: true, error: null });
    from.mockReturnValue({ update: () => ({ eq: async () => ({ error: null }) }) });
    const response = await POST(request({}, {
      ...event,
      resource: { invoice: { id: "INV2-PF2A-NK8Q-VUZM-Z5BS", status: "DRAFT" } },
    }));
    expect(response.status).toBe(200);
    expect(reconcile).toHaveBeenCalledWith("INV2-PF2A-NK8Q-VUZM-Z5BS");
  });
  it("keeps a verified invoice event retryable when its invoice ID is missing", async () => {
    vi.stubEnv("PAYPAL_WEBHOOK_ID", "registered-id");
    paypal.mockResolvedValue({ verification_status: "SUCCESS" });
    rpc.mockResolvedValue({ data: true, error: null });
    const update = vi.fn(() => ({ eq: async () => ({ error: null }) }));
    from.mockReturnValue({ update });
    const response = await POST(request({}, { ...event, resource: {} }));
    expect(response.status).toBe(503);
    expect(update).toHaveBeenCalledWith({ state: "failed" });
    expect(reconcile).not.toHaveBeenCalled();
  });
  it("asks PayPal to retry a concurrent duplicate still in processing", async () => {
    vi.stubEnv("PAYPAL_WEBHOOK_ID", "registered-id");
    paypal.mockResolvedValue({ verification_status: "SUCCESS" });
    rpc.mockResolvedValue({ data: false, error: null });
    from.mockReturnValue({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: { state: "processing" }, error: null }),
        }),
      }),
    });
    expect((await POST(request())).status).toBe(503);
    expect(reconcile).not.toHaveBeenCalled();
  });
});
