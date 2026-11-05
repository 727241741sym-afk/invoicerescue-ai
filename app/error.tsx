"use client";

import { Button } from "@/components/ui/button";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="login-page">
      <section className="login-card">
        <p className="eyebrow">WORKSPACE CONNECTION</p>
        <h1>Let’s reconnect.</h1>
        <p className="muted">
          The workspace could not load. Check the service configuration and try
          again.
        </p>
        <Button onClick={reset}>Try again</Button>
        <a href="/">Open the demo workspace</a>
      </section>
    </main>
  );
}
