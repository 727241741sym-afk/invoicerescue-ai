import Link from "next/link";
import { ArrowLeft, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { login, localLogin } from "./actions";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const local =
    process.env.NODE_ENV === "development" &&
    Boolean(process.env.MERCHANT_LOGIN_EMAIL);
  return (
    <main className="login-page">
      <Link href="/" className="back-link">
        <ArrowLeft size={16} /> Back to demo
      </Link>
      <section className="login-card">
        <div className="brand-mark">
          <Sparkles size={24} />
        </div>
        <p className="eyebrow">INVOICERESCUE AI</p>
        <h1>
          Your cash flow,
          <br />
          back in focus.
        </h1>
        <p className="muted">
          Sign in to manage your connected PayPal Sandbox invoices.
        </p>
        {error ? (
          <div role="alert" className="notice notice-error">
            {error}
          </div>
        ) : null}
        <form action={login} className="form-stack">
          <label>
            Email address
            <input
              name="email"
              type="email"
              autoComplete="username"
              required
              placeholder="you@yourbusiness.com"
            />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              minLength={8}
            />
          </label>
          <Button type="submit">Sign in to workspace</Button>
        </form>
        {local ? (
          <form action={localLogin}>
            <div className="login-divider">LOCAL DEVELOPMENT</div>
            <Button variant="outline" type="submit" className="full-width">
              Open local merchant workspace
            </Button>
            <p className="fine-print">
              Uses the test merchant account stored on this computer. Available
              in local development.
            </p>
          </form>
        ) : null}
        <p className="security-note">
          <ShieldCheck size={16} /> Sandbox payments · Merchant approval
          required
        </p>
      </section>
    </main>
  );
}
