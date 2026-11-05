import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import fs from "node:fs";

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const existing = await db
  .from("merchant_access")
  .select("user_id")
  .limit(1)
  .maybeSingle();
if (existing.error)
  throw new Error(
    "Apply the database migration before provisioning the merchant.",
  );
if (existing.data) {
  if (process.env.MERCHANT_USER_ID !== existing.data.user_id)
    throw new Error(
      "A merchant is already configured. Use its existing login credentials.",
    );
  console.log("Merchant already provisioned. Credentials unchanged.");
  process.exit(0);
}

const email = process.env.MERCHANT_LOGIN_EMAIL || "merchant@invoicerescue.test";
const password =
  process.env.MERCHANT_LOGIN_PASSWORD ||
  `${randomBytes(24).toString("base64url")}aA1!`;
let userId = process.env.MERCHANT_USER_ID;
if (!userId) {
  const { data, error } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role: "merchant" },
  });
  if (error || !data.user)
    throw new Error("Could not create the application merchant account.");
  userId = data.user.id;
}

let environment = fs.readFileSync(".env.local", "utf8");
for (const [key, value] of Object.entries({
  MERCHANT_USER_ID: userId,
  MERCHANT_LOGIN_EMAIL: email,
  MERCHANT_LOGIN_PASSWORD: password,
})) {
  const pattern = new RegExp(`^${key}=.*$`, "m");
  environment = pattern.test(environment)
    ? environment.replace(pattern, `${key}=${value}`)
    : `${environment.trimEnd()}\n${key}=${value}\n`;
}
fs.writeFileSync(".env.local", environment, { mode: 0o600 });
fs.chmodSync(".env.local", 0o600);
const { error } = await db.from("merchant_access").insert({ user_id: userId });
if (error)
  throw new Error(
    "Merchant credentials were saved locally, but authorization could not be recorded. Retry setup.",
  );
console.log(
  "Application merchant provisioned. Login credentials saved in the ignored .env.local file.",
);
