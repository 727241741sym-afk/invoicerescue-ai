import "server-only";
import { getVercelOidcToken } from "@vercel/oidc";
import { AppError } from "./db";

export function aiConnection() {
  const baseURL = (
    process.env.OPENAI_BASE_URL || "https://api.openai.com/v1"
  ).replace(/\/+$/, "");
  const gateway = baseURL === "https://ai-gateway.vercel.sh/v1";
  return {
    baseURL,
    gateway,
    model: process.env.OPENAI_MODEL || (gateway ? "" : "gpt-4.1-mini"),
    label: gateway
      ? "Vercel AI Gateway"
      : baseURL.includes("127.0.0.1") || baseURL.includes("localhost")
        ? "Local AI proxy"
        : "Configured AI provider",
  };
}

export async function aiRequestConfig() {
  const connection = aiConnection();
  if (!connection.model)
    throw new AppError("Set OPENAI_MODEL to an available Gateway model ID.", 503);

  let apiKey: string | undefined;
  if (connection.gateway) {
    apiKey = process.env.AI_GATEWAY_API_KEY;
    if (!apiKey) {
      try {
        // Resolve each request's current token; never cache a deployment token.
        apiKey = await getVercelOidcToken();
      } catch {
        throw new AppError(
          "AI Gateway authentication is unavailable. Configure a Gateway key locally or enable Vercel OIDC for this deployment.",
          503,
        );
      }
    }
  } else {
    apiKey = process.env.OPENAI_API_KEY;
  }
  if (!apiKey)
    throw new AppError("The configured AI provider needs authentication.", 503);
  return { ...connection, apiKey };
}
