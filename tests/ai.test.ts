import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { demoWorkspace } from "@/lib/demo";

const { create } = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("openai", () => ({
  default: class {
    responses = { create };
  },
}));

import { analyzeMessage } from "@/lib/server/ai";
const invoice = demoWorkspace("2026-11-05T03:00:00Z").invoices[0];
const message = "I cannot find the payment link.";
const result = {
  classification: "missing_payment_link",
  confidence: 0.93,
  evidence: [message],
  draft: "Thanks for letting me know. Here is the invoice payment link.",
  promise_date: null,
  reason: "Customer cannot locate the link.",
};

beforeEach(() => {
  create.mockReset();
  vi.stubEnv("OPENAI_BASE_URL", "http://127.0.0.1:8317/v1");
  vi.stubEnv("OPENAI_API_KEY", "test-provider-key");
});

afterEach(() => vi.unstubAllEnvs());

describe("AI response validation", () => {
  it.each([401, 402, 403, 429])("explains actionable Gateway errors without exposing provider details (%s)", async (status) => {
    vi.stubEnv("OPENAI_BASE_URL", "https://ai-gateway.vercel.sh/v1");
    vi.stubEnv("OPENAI_MODEL", "openai/gpt-6-luna");
    vi.stubEnv("AI_GATEWAY_API_KEY", "test-gateway-key");
    create.mockRejectedValue({ status, message: "private provider details" });
    await expect(
      analyzeMessage(invoice, message, "2026-11-05T03:00:00Z"),
    ).rejects.toThrow("AI Gateway");
  });
  it("converts evidence-backed output into a constrained action", async () => {
    create.mockResolvedValue({
      status: "completed",
      output_text: JSON.stringify(result),
    });
    expect(
      (await analyzeMessage(invoice, message, "2026-11-05T03:00:00Z")).action,
    ).toBe("resend_payment_link");
  });
  it("rejects invented customer evidence", async () => {
    create.mockResolvedValue({
      status: "completed",
      output_text: JSON.stringify({
        ...result,
        evidence: ["The customer paid already"],
      }),
    });
    await expect(
      analyzeMessage(invoice, message, "2026-11-05T03:00:00Z"),
    ).rejects.toThrow("did not match");
  });
  it("rejects an injected unrestricted action field", async () => {
    create.mockResolvedValue({
      status: "completed",
      output_text: JSON.stringify({ ...result, action: "mark_paid" }),
    });
    await expect(
      analyzeMessage(invoice, message, "2026-11-05T03:00:00Z"),
    ).rejects.toThrow("required format");
  });
  it("routes model-generated external links to human review", async () => {
    create.mockResolvedValue({
      status: "completed",
      output_text: JSON.stringify({
        ...result,
        draft: "Pay at https://attacker.example",
      }),
    });
    expect(
      (await analyzeMessage(invoice, message, "2026-11-05T03:00:00Z")).action,
    ).toBe("human_review");
  });
  it("rejects truncated or incomplete model output", async () => {
    create.mockResolvedValue({ status: "incomplete", output_text: "{}" });
    await expect(
      analyzeMessage(invoice, message, "2026-11-05T03:00:00Z"),
    ).rejects.toThrow("could not complete");
  });
});
