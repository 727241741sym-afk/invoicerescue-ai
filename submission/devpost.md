# Devpost project content

This draft describes the implemented MVP. Complete the release links and hosted-webhook verification items in `checklist.md` before submitting. Use `docs/verification.md` to distinguish exercised integrations from code that still needs a hosted test.

## Project name

InvoiceRescue AI

## Tagline

Understand why invoices go unpaid. Approve the right next step. Get paid through PayPal.

## Inspiration

A freelancer can deliver excellent work and still spend evenings chasing an invoice. The next reminder is often written without understanding what is blocking payment. A client may have lost a link, need an invoice detail, disagree with the scope, or be waiting for a payment run. Each situation deserves a different response.

We built InvoiceRescue AI to put that context into the collection workflow. The goal is to help independent professionals act with clarity while preserving the client relationship.

## What it does

InvoiceRescue AI brings together a PayPal invoice, a customer reply, an AI explanation, and a merchant-approved next step.

The merchant creates or synchronizes USD invoices from PayPal Sandbox, then pastes a customer message. Payment Blocker Intelligence classifies the reply into one of eight categories, quotes supporting evidence, and prepares a concise message draft. A deterministic policy maps the classification to a permitted action.

The merchant reviews and edits the recommendation before approving it. Supported outcomes include a PayPal reminder, sharing the existing invoice payment link through a reminder, saving an information-request draft, recording a payment promise, and pausing follow-ups for human review.

PayPal remains the source of invoice payment status. The application rechecks that status before an outgoing reminder. It also contains a verified-webhook processing path that reconciles invoice state, deduplicates events, and blocks pending reminders when the fetched state is settled, closed, or payment-pending.

A separate interactive demo contains synthetic invoices and preset analyses. It is clearly labeled, can be reset, and keeps changes in the visitor's browser.

## How we built it

The application uses Next.js App Router, TypeScript, Tailwind CSS, a shadcn-style button component, and Lucide icons. Supabase provides PostgreSQL and merchant authentication. Ownership-based row-level security restricts browser reads, while server authorization gates writes and internal database functions.

PayPal Invoicing REST API v2 supplies real Sandbox invoice creation, retrieval, synchronization, sending, and reminder operations. The webhook handler uses PayPal signature verification before processing events. A real Sandbox creation event exposed the nested invoice payload shape, which was added to the handler and regression tests. Payment-event verification is tracked separately in the verification record.

AI analysis uses the OpenAI Responses API format with a strict JSON schema and Zod validation. The hosted build connects to Vercel AI Gateway using `openai/gpt-4.1-mini` with request-scoped OIDC authentication. A real hosted analysis and database save have been verified. The provider endpoint and model remain configurable for local development. Supporting quotes must exactly match the supplied message, and backend code controls the available actions.

Codex assisted with implementation, debugging, test creation, and documentation. Runtime AI analyzes customer messages and prepares recommendations. Merchant approval remains part of the product workflow.

## Challenges we ran into

Payment events require careful interpretation. An invoice-paid event can involve partial or pending payment, so the handler fetches the current invoice before deciding what changed.

Retries and concurrent clicks create a second challenge. We persist operation IDs, payload hashes, approval claims, reminder budgets, and uncertain outcomes in PostgreSQL. Database functions use locks to keep repeated approvals and event deliveries consistent.

Moving from local development to a hosted app introduced a provider boundary: the local AI proxy could not be reached by a cloud server. We connected the hosted app to Vercel AI Gateway, verified a model eligible for the free-credit tier, and used short-lived Vercel identity tokens to authenticate requests.

## Accomplishments that we're proud of

We connected a working interface to PayPal Sandbox invoice creation and real AI analysis, with exact supporting evidence visible to the merchant. We also completed a USD 1.00 Sandbox buyer payment and manually reconciled the invoice to Paid with zero outstanding and further reminders blocked. The application makes a recommendation reviewable before it can produce an external action.

We also built and exercised policy tests, webhook boundary tests, entry-point access tests, and rollback-only database regression checks. The tests cover pending and partial payments, payment promises, invented evidence, malicious links, duplicate claims, uncertain outcomes, and stale reconciliation.

The interface presents synthetic demo behavior and connected Sandbox behavior explicitly, helping a reviewer understand which service produced each result.

## What we learned

A collection assistant needs to reason about uncertainty in both conversation and payment processing. A client's claim that they paid should trigger reconciliation. A request timeout should remain unresolved until its outcome can be checked. A promise to pay needs a calendar date and a policy that respects it.

AI is most helpful here when its explanation is inspectable and its proposed action passes through a small, explicit set of business rules.

## What's next for InvoiceRescue AI

We plan to add secure mailbox connections, merchant onboarding, additional currencies, and a richer evaluation set for payment-blocker classification. We also want to test the workflow with freelancers and measure time spent on follow-ups and invoice resolution, using consented data and clearly defined baselines.

## Built with

PayPal Sandbox, PayPal Invoicing REST API v2, PayPal Webhooks, Next.js, React, TypeScript, Tailwind CSS, Supabase, PostgreSQL, Supabase Auth, Vercel AI Gateway, OpenAI GPT-4.1 mini, OpenAI Responses API format, Zod, Radix UI, Vitest, Playwright, Codex.

## Judge testing instructions

Open https://invoicerescue-ai.vercel.app/ or follow https://github.com/727241741sym-afk/invoicerescue-ai to run the app locally. The default page opens a resettable synthetic demo.

1. Open an invoice and choose a preset scenario. Review its blocker, supporting quote, and suggested reply.
2. Approve or reject the simulated recommendation and inspect Activity log.
3. Simulate payment. The invoice becomes paid and further reminders are blocked in the demo.
4. To test connected functionality, open the Sandbox workspace using the dedicated application test account supplied in the submission's testing instructions.
5. Create a USD invoice for a PayPal Sandbox buyer. Paste a customer message to run the configured AI provider.
6. Review the draft and approve the permitted action. An unsent draft blocks outgoing reminders until it has been sent.
7. For the payment scenario, use a Sandbox Personal buyer. Synchronize the invoice or observe the configured webhook update after payment.

Keep the AI service, hosted application, and test access available for the complete judging period. Credentials required by a particular environment must be supplied through the designated testing-access mechanism.
