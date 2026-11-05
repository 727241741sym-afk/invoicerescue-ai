# Verification evidence

Verified on November 5, 2026, in the local desktop workspace.

## Automated checks

| Check | Observed result |
| --- | --- |
| `pnpm typecheck` | Passed |
| `pnpm test` | 51 passed across 5 files |
| `pnpm build` | Passed, including all pages, API routes, and session proxy |
| `pnpm test:e2e` against production | 5 passed |
| `tests/database-regressions.sql` | Passed, with all synthetic records rolled back |
| Source secret scan | Passed for the configured PayPal secret, AI key, Supabase server key, and application login password |

The first restricted build attempt could not open a local port used by the stylesheet compiler. Running the build with the required local process permissions succeeded. API request tests were repeated against the built production server after the final code changes.

## Browser and service checks

| Flow | Evidence |
| --- | --- |
| Public demo | Rendered six synthetic invoices, preset recommendations, filters, and approval controls |
| Merchant login | Local development sign-in opened the authorized workspace. The same session opened the production workspace |
| Real Sandbox invoice creation | Application UI created draft IR-A38C19CA with PayPal ID INV2-GSQZ-2UEH-ZCDD-APY9 and USD 25.00 |
| Designated buyer invoice | Application UI created USD 1.00 invoice IR-5E03FECA, PayPal ID INV2-VCPS-53TD-8U6J-LWWU, for the supplied Sandbox Personal buyer |
| Real invoice sending | Merchant-approved send succeeded and PayPal returned SENT |
| Real reminder acceptance | A real missing-link analysis was approved through the UI. PayPal accepted the reminder, the operation became succeeded, and the recommendation became executed |
| Real buyer payment | User completed the USD 1.00 Sandbox payment. PayPal's hosted page displayed payment success |
| Real paid reconciliation | Refresh status in the production app fetched PAID and USD 0.00 outstanding. UI displayed that further reminders are blocked. An independent database read confirmed status PAID and due_cents = 0 |
| Real missing-link analysis | Model returned missing_payment_link, exact customer evidence, and resend_payment_link |
| Draft reminder protection | Reminder approval was disabled while the invoice remained DRAFT |
| Real prompt-injection analysis | Model returned unknown, confidence 0.12, and human review. The invoice remained DRAFT with the same amount |
| Human-review approval | Activity log recorded merchant approval, and the invoice's application reminder state became paused |
| Real payment promise | Model identified 2026-11-13. Approval saved it, and the production UI showed suppression through that date |
| Synthetic paid scenario | Demo invoice changed to Paid, due amount became zero, pending suggestion became blocked, and reminder approval was disabled |
| Desktop layout | Checked at 1440×1000 |
| Mobile layout | Checked at 390×844. Content scroll width matched client width after correcting an escaped table accessibility label |

The earlier USD 25 Sandbox draft's recipient, buyer@example.com, is fictional. It remains unsent. The later USD 1 invoice uses the buyer designated by the user and has verified send, reminder acceptance, buyer payment, and manual reconciliation to PAID. Recipient delivery of the notification has not been independently checked. The payment update was retrieved by the app's Refresh status action, rather than a real webhook event.

The AI endpoint used for the exercised connected analyses is local CLIProxyAPI using its advertised gpt-6-luna alias. Those live tests confirm functional structured output through that endpoint. They do not independently establish the proxy's upstream model identity.

The user selected Vercel AI Gateway for deployment. The initial catalog check found openai/gpt-6-luna, but a live call established that it is unavailable on the free tier. The selected hosted model is now the verified free-tier-eligible openai/gpt-4.1-mini. Gateway integration uses a dedicated key or the current request's OIDC token through @vercel/oidc 4.0.6. Tests cover credential separation, fresh token retrieval, missing authentication, explicit model configuration, and sanitized actionable provider errors. Typecheck, all 51 unit tests, and the production build passed after the integration change. The model-level live Gateway check below passed after deployment-tool login. The working local proxy configuration is preserved pending full application verification. Dashboard-log inspection remains pending. The user completed free-credit activation and the dashboard displayed USD 5.00 Free Credit. Project invoicerescue-ai was created with OIDC enabled. The initial smoke test failed while refreshing the old local token. After the user refreshed the CLI login, the subsequent live request and usage were verified as described below.

## Database regression coverage

The rollback-only script checks first and duplicate operation claims, conflicting payloads, duplicate approvals, uncertain reminder outcomes, cooldown consumption, pending-payment protection, settled-state protection, out-of-order reconciliation, event deduplication, failed event retry, processed-event idempotency, browser role restrictions, atomic replacement of older pending analyses, and dispute-driven pauses.

The webhook unit tests mock PayPal signature verification to exercise invalid signatures, arbitrary certificate hosts, processed duplicates, concurrent duplicates, and reconciliation using current invoice state. A real registered-app event has not yet been received by a hosted endpoint.

## Observed advisories

- The internal ai_runs and webhook_events tables have RLS enabled with no policies. Browser roles have no grants on them. Internal server calls use the service role.
- Supabase reports that leaked-password protection is disabled in this project's default Auth configuration. Review the [password protection setting](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) before broader account access.
- Supabase reports four remaining composite foreign-key index opportunities and unused indexes in the small new database. See its [foreign-key index guidance](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys). Current policy and state tests passed.
- A transient development hot-reload promise error was observed during code replacement. Production pages were reloaded and exercised after a successful build.

## Remaining verification

A verified real payment webhook and the final cloud deployment remain to be exercised. These are recorded as pending in the submission checklist. Public repository and YouTube URLs are also pending.

## Screenshots

Screenshots named in this record are retained as local verification artifacts. The public source excludes account and billing screenshots. Review the live application for the current public interface.

## Live Gateway check

After the user refreshed the official CLI login, project/team OIDC authentication succeeded. openai/gpt-6-luna returned a free-tier model-access 403. The official directory marked openai/gpt-4.1-mini as free-tier eligible. A subsequent real strict-schema Responses request to that model completed with classification missing_payment_link and an exact synthetic-message quote (69 input and 19 output tokens). Full application analysis through Gateway, production deployment, and dashboard-log inspection remain pending. Deploy dry-run excluded all local environment files and screenshots. Transferring PayPal/Supabase secrets to the precise Vercel production destination requires explicit user authorization after the automatic approval review rejection.

## Hosted release verification

The public application is https://invoicerescue-ai.vercel.app/. The staged production build passed anonymous access denial, cross-site mutation denial, authenticated workspace loading, preservation of the paid USD 1 invoice, and a full Gateway analysis that saved exact evidence in Supabase. All five Playwright API entry checks passed against the public domain without deployment-protection bypass credentials. Browser checks opened the public synthetic demo, followed Open Sandbox to the application login, signed in with the dedicated merchant, and confirmed the hosted Gateway model plus Paid/zero outstanding/reminder blocking. Screenshots are cloud-demo.jpg and cloud-paid.jpg.

The PayPal webhook was registered on the same Sandbox application for eight Invoicing invoice event types. The first real CREATED event passed signature verification and was persisted, but exposed a nested resource.invoice.id shape absent from the earlier test fixture. That initial event was acknowledged without reconciliation. The handler was corrected to extract the nested invoice ID and to leave an invoice event retryable if no valid invoice ID exists. Two regression tests were added; typecheck, all 51 unit tests, and the production build passed. A new live-event check of the corrected handler is in progress. An actual paid webhook remains unverified until the buyer pays a newly sent test invoice.
