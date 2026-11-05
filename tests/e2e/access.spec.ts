import { test, expect } from "@playwright/test";

test("demo entry point renders without merchant credentials", async ({
  request,
}) => {
  const response = await request.get("/");
  expect(response.status()).toBe(200);
  const html = await response.text();
  expect(html).toContain("A little clarity. Better cash flow.");
  expect(html).toContain("Synthetic demo data");
});

test("anonymous clients cannot read the merchant workspace", async ({
  request,
}) => {
  const response = await request.get("/api/workspace");
  expect(response.status()).toBe(401);
  expect((await response.json()).error).toContain("Sign in");
});

test("cross-site writes are rejected before authentication or service calls", async ({
  request,
}) => {
  const response = await request.post("/api/invoices", {
    headers: { origin: "https://attacker.example" },
    data: {},
  });
  expect(response.status()).toBe(403);
});

test("same-origin writes still require merchant authentication", async ({
  request,
  baseURL,
}) => {
  const response = await request.post("/api/analyze", {
    headers: { origin: new URL(baseURL!).origin },
    data: {},
  });
  expect(response.status()).toBe(401);
});

test("an unsigned webhook never succeeds", async ({ request }) => {
  const response = await request.post("/api/paypal/webhook", {
    data: {
      id: "UNSIGNED-TEST",
      event_type: "INVOICING.INVOICE.PAID",
      resource: { id: "INV2-UNSIGNED-TEST" },
    },
  });
  expect([400, 503]).toContain(response.status());
});
