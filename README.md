# InvoiceRescue AI

Understand what is holding up payment, approve a considerate next step, and collect through PayPal Sandbox.

InvoiceRescue AI combines customer replies with authoritative invoice context. Its Payment Blocker Intelligence identifies eight payment blockers, quotes supporting evidence, proposes a reply, and routes the result through a deterministic approval policy.

## Live release

- [Public interactive demo](https://invoicerescue-ai.vercel.app/)
- [Source repository](https://github.com/727241741sym-afk/invoicerescue-ai)

The public entry is a clearly labeled synthetic demo. The connected Sandbox workspace requires the authorized merchant login. The hosted application uses Vercel AI Gateway with openai/gpt-4.1-mini and request-scoped OIDC authentication. A complete hosted analysis and database save have been verified. PayPal Sandbox buyer payment and manual reconciliation have also been verified; see [verification evidence](docs/verification.md) for the separate webhook status.

## Run locally

Use Node.js 22 or later and pnpm 11.25.0. This project has been exercised with Node.js 24.22.1.

```sh
pnpm install --frozen-lockfile
cp .env.example .env.local
```

Fill the environment file using the instructions below. Create a dedicated Supabase project and apply every SQL file in `supabase/migrations/` in filename order through the project's SQL Editor, or apply the migrations using a linked Supabase CLI.

Provision the single application merchant, then start the app.

```sh
pnpm setup:merchant
pnpm dev
```

Open [the local app](http://127.0.0.1:3000). The default page is a browser-local synthetic demo. Choose **Open Sandbox** to sign in to the connected merchant workspace.

The setup command generates an application login and stores its email and password in the ignored `.env.local` file. Local development offers a server-side button that signs in with this test account. Production requires the email and password form. The test merchant's Supabase account is distinct from PayPal buyer and seller accounts.

## Configuration

| Variable | Purpose |
| --- | --- |
| `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` | Credentials for one PayPal Sandbox REST app with Invoicing enabled |
| `PAYPAL_MERCHANT_EMAIL` | Optional Sandbox Business seller email matching the REST app |
| `PAYPAL_WEBHOOK_ID` | ID of the registered Sandbox webhook |
| `AI_GATEWAY_API_KEY` | Optional Gateway key for local/external runtimes; Vercel deployments use request-scoped OIDC |
| `OPENAI_API_KEY` | API key for other compatible providers; never used to authenticate to Gateway |
| `OPENAI_BASE_URL` | OpenAI-compatible API base, including `/v1` |
| `OPENAI_MODEL` | A model supporting the Responses API and strict JSON schema output |
| `NEXT_PUBLIC_SUPABASE_URL` | Dedicated Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Modern publishable key |
| `SUPABASE_SECRET_KEY` | Server secret used after application authorization |
| `APP_URL` | Exact application origin, such as `http://127.0.0.1:3000` |
| `MERCHANT_TIMEZONE` | Business calendar timezone, default `Asia/Hong_Kong` |

The selected hosted AI provider is Vercel AI Gateway. Set `OPENAI_BASE_URL=https://ai-gateway.vercel.sh/v1` and `OPENAI_MODEL=openai/gpt-4.1-mini`. This model was verified as eligible for free credits, and a live Responses API strict-schema request completed successfully on November 5, 2026. The initially considered openai/gpt-6-luna returned 403 because it is unavailable on the free tier. Confirm current availability before configuring a new environment.

Vercel deployments use `@vercel/oidc` to obtain the current request token on each analysis. No provider API key is required on that path. Local development can use `AI_GATEWAY_API_KEY` or a linked project's OIDC token. Follow [Gateway authentication](https://vercel.com/docs/ai-gateway/authentication-and-byok) and keep the team's Gateway credits/budget available. When pulling environment variables, write them to a separate ignored file first and preserve the existing local credentials. OIDC tokens pulled locally expire and need refreshing.

The existing local installation still uses CLIProxyAPI at `http://127.0.0.1:8317/v1` and its advertised `gpt-6-luna` model alias until Gateway credentials are available and a live migration check succeeds. Its Responses API and structured output have been tested. The local proxy key stays associated with that endpoint; Gateway uses its own key or Vercel identity.

Store secrets in `.env.local` and deployment secret settings. The example file contains placeholders. Public repository access should include all source and setup instructions. Give judges only the dedicated test access they need through the submission's testing instructions.

## PayPal Sandbox setup

1. Sign in to [PayPal Developer](https://developer.paypal.com/dashboard/).
2. Under **Testing Tools → Sandbox Accounts**, obtain a Business seller and a Personal buyer.
3. Under **Apps & Credentials → Sandbox**, select a REST app associated with that seller.
4. Enable **Invoicing** and save the settings. Copy its client ID and secret into `.env.local`.
5. Sign in to the app, create a USD draft for your test buyer, and review it.
6. Approve sending the invoice. Open the returned Sandbox payment page and use the Personal buyer to pay.
7. Synchronize the invoice to confirm the authoritative status.

If permissions were enabled after an access token was issued, the app requests a fresh token when the returned scope lacks Invoicing. All PayPal API traffic uses a fixed Sandbox host.

## Webhook setup

Deploy the app to a reachable HTTPS origin. In the same PayPal Sandbox REST app, register

```text
https://YOUR_HOST/api/paypal/webhook
```

Subscribe to available invoice events, including invoice paid, updated, cancelled, and refunded. Copy the returned ID to `PAYPAL_WEBHOOK_ID`, set `APP_URL` to the deployed origin, and redeploy.

The handler verifies the event through PayPal, acquires a durable event lease, and fetches the current invoice. An invoice-paid event can include partial or pending payments, so reconciliation uses the fetched state and balance. The dashboard refreshes its database view every 15 seconds while visible.

Duplicate processed events return success. Concurrent duplicates request another delivery. Failed or abandoned processing can retry after the lease. The database rejects stale reconciliation attempts and prevents terminal invoices from reopening into an unconfirmed unpaid state.

PayPal's standalone webhook simulator has different verification behavior. Final payment verification must use an actual Sandbox invoice payment and its registered-app event. Keep the hosted app and testing access available through the hackathon's judging period.

## Demo and real workflow

The demo uses six synthetic scenarios, preset analyses, simulated approval outcomes, and browser-local persistence. Use **Reset demo** to restore the initial data. It exercises missed payments, missing links, disputes, promises, paid claims, and prompt injection.

The Sandbox workspace stores real test invoices and customer messages in Supabase. AI analysis uses the configured provider and exact evidence validation. All external reminders require merchant approval. A dispute, cash flow difficulty, or paid claim immediately pauses application reminders while awaiting human review. Payment promises suppress application reminders through the promised date.

Information-request actions save an editable draft that can be copied to the merchant's communication channel. The app records invoice state from PayPal and preserves manual external-payment statuses separately from payments actually received through PayPal.

## Reliability and access control

- Supabase Auth identifies the merchant. A singleton server-managed allowlist grants access to the configured PayPal seller.
- Browser database access is read-only and restricted by ownership RLS. Internal functions and write privileges are reserved for the server role.
- Approval claims, operation IDs, reminder budgets, state changes, and audit records are persisted in PostgreSQL.
- The app permits at most two reminder attempts per merchant in a rolling 24 hours and one per invoice in 12 hours. Started, successful, and uncertain reminders consume that budget. PayPal can apply additional limits.
- A timeout retains an uncertain outcome. Refresh the invoice and inspect the provider before deciding on another action.
- The app re-fetches PayPal invoice status immediately before approved outgoing actions. There remains a small interval between that read and the external notification request, which PayPal controls.
- AI confidence is an uncalibrated model estimate. Low-confidence, disputed, or unsupported situations require human review.
- Every user write checks the configured origin and an authorized merchant session.

## Verification

```sh
pnpm typecheck
pnpm test
pnpm build
```

With the local server running, execute Playwright API entry-point tests.

```sh
pnpm test:e2e
```

These cover the demo response, anonymous workspace denial, cross-origin write rejection, authentication on mutations, and unsigned webhook denial. Browser interactions are additionally verified using the desktop browser automation tools.

Run `tests/database-regressions.sql` through a privileged SQL connection in a test project with a configured merchant. It uses a rollback-only transaction to check duplicate claims, payload conflicts, reminder cooldown after uncertain outcomes, pending and paid reconciliation, stale events, webhook retries, and internal access restrictions.

See [verification evidence](docs/verification.md) and [current status](STATUS.md) for observed results and outstanding release dependencies.

## Submission materials

- [Project description](submission/devpost.md)
- [Demonstration script and shot list](submission/demo-script.md)
- [Submission checklist](submission/checklist.md)
- [Architecture](docs/architecture.md)

MIT licensed. The current MVP supports one configured merchant, USD invoices, and manually pasted customer messages. Public multimerchant onboarding, mailbox integrations, calibrated confidence, and automated scheduling are future work.
