import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { oidc } = vi.hoisted(() => ({ oidc: vi.fn() }));
vi.mock("@vercel/oidc", () => ({ getVercelOidcToken: oidc }));
import { aiRequestConfig } from "@/lib/server/ai-config";

beforeEach(() => {
  oidc.mockReset();
  vi.stubEnv("OPENAI_BASE_URL", "https://ai-gateway.vercel.sh/v1");
  vi.stubEnv("OPENAI_MODEL", "openai/gpt-6-luna");
  vi.stubEnv("OPENAI_API_KEY", "unrelated-local-proxy-key");
  vi.stubEnv("AI_GATEWAY_API_KEY", "");
});
afterEach(() => vi.unstubAllEnvs());

describe("AI Gateway authentication boundaries", () => {
  it("prefers a Gateway key over OIDC and the unrelated provider key", async () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "test-gateway-key");
    expect((await aiRequestConfig()).apiKey).toBe("test-gateway-key");
    expect(oidc).not.toHaveBeenCalled();
  });

  it("retrieves the current OIDC token on every request", async () => {
    oidc.mockResolvedValueOnce("first-token").mockResolvedValueOnce("next-token");
    expect((await aiRequestConfig()).apiKey).toBe("first-token");
    expect((await aiRequestConfig()).apiKey).toBe("next-token");
    expect(oidc).toHaveBeenCalledTimes(2);
  });

  it("does not fall back to the local proxy key when Gateway authentication fails", async () => {
    oidc.mockRejectedValue(new Error("private credential failure details"));
    await expect(aiRequestConfig()).rejects.toThrow("AI Gateway authentication is unavailable");
  });

  it("keeps Gateway credentials away from other provider endpoints", async () => {
    vi.stubEnv("OPENAI_BASE_URL", "http://127.0.0.1:8317/v1");
    vi.stubEnv("AI_GATEWAY_API_KEY", "test-gateway-key");
    expect((await aiRequestConfig()).apiKey).toBe("unrelated-local-proxy-key");
    expect(oidc).not.toHaveBeenCalled();
  });

  it("requires an explicitly configured Gateway model", async () => {
    vi.stubEnv("OPENAI_MODEL", "");
    await expect(aiRequestConfig()).rejects.toThrow("Set OPENAI_MODEL");
    expect(oidc).not.toHaveBeenCalled();
  });
});
