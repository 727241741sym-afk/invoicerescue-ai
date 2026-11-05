# Verification evidence

Verified on November 5, 2026. Public release: https://invoicerescue-ai.vercel.app/. Source: https://github.com/727241741sym-afk/invoicerescue-ai.

## Automated checks

| Check | Observed result |
| --- | --- |
| `pnpm typecheck` | Passed after the final webhook correction |
| `pnpm test` | 51 passed across 5 files |
| `pnpm build` | Passed after the final webhook correction |
| Cloud production build | READY with Node.js 24.x, pnpm 11.25.0 and pinned dependencies |
| `pnpm test:e2e` on the public domain | 5 passed without Vercel bypass credentials |
| `tests/database-regressions.sql` | Passed, with synthetic regression rows rolled back |
| Source secret scan | No exact configured secret values in published source |
| Production runtime error/fatal scan | No matching records in the checked release window |

The five public API checks cover the synthetic demo, anonymous merchant-read denial, cross-site write denial, same-origin unauthenticated denial, and unsigned-webhook rejection. A staged cloud check additionally signed in with the dedicated merchant, loaded the real workspace, verified the existing paid invoice, ran a full Gateway analysis, and confirmed its evidence-backed recommendation was saved in Supabase.

## Browser and service checks

| Flow | Evidence |
| --- | --- |
| Public demo | Rendered synthetic invoices, preset recommendations, filters, approval controls, and explicit simulation labels |
| Hosted merchant entry | Open Sandbox redirected to the app login; the dedicated merchant signed in and opened the hosted workspace |
| Hosted Gateway connection | Connections displayed Vercel AI Gateway and openai/gpt-4.1-mini |
| Real invoice creation | The app created USD 25.00 fictional-recipient draft IR-A38C19CA and the USD 1.00 designated-buyer test invoices |
| Invoice sending | Approved send succeeded for IR-5E03FECA and, with separate explicit approval, IR-E3B7428F |
| Reminder acceptance | A real missing-link analysis was approved; PayPal accepted the reminder, the operation became succeeded, and the recommendation became executed |
| First buyer payment | The user paid IR-5E03FECA; manual Refresh status reconciled it to PAID and zero outstanding |
| Hosted automatic payment update | The user paid IR-E3B7428F; the signed PAID webhook reconciled it to PAID and zero outstanding without a manual PayPal sync |
| Settled reminder protection | Hosted invoice details displayed the blocked-reminder notice after settlement |
| Earlier local injection check | A real provider returned unknown, low confidence, and human review; approving review paused app reminders |
| Earlier local payment promise | A real provider identified 2026-11-13; approval persisted that date and the UI displayed suppression through it |
| Desktop and mobile | Checked at 1440×1000 and 390×844; the corrected mobile layout had matching scroll/content width |

The UI uses browser-local synthetic records only in Demo mode. Sandbox records are real test API records. The fictional-recipient drafts remain unsent and are not presented as collected revenue. The two completed USD 1.00 payments are Sandbox funds. Recipient delivery of the reminder notification was not independently checked.

## AI provider verification

Earlier local development exercised the user's CLIProxyAPI at http://127.0.0.1:8317/v1 using its advertised gpt-6-luna alias. Those checks established functional structured output, not the proxy's underlying model identity. The local proxy key is not an official-provider key and was not uploaded to Vercel.

The hosted release uses Vercel AI Gateway and per-request OIDC through @vercel/oidc 4.0.6. The live model catalog contained openai/gpt-6-luna, but a request returned 403 because that model was excluded from free-credit access. The official directory marked openai/gpt-4.1-mini eligible. A strict-schema request to that model completed with missing_payment_link and an exact synthetic-message quote (69 input and 19 output tokens).

The full hosted app then ran its complete analysis schema, Zod validation, exact quote checking, backend action mapping, and database save successfully. Tests cover key separation, current-token retrieval on each request, missing authentication, explicit Gateway model configuration, and sanitized actionable service errors. No permanent Gateway key was created. Gateway dashboard-log inspection is separate from the observed API and application checks.

## Real webhook verification

The same PayPal Sandbox REST application has an HTTPS listener at https://invoicerescue-ai.vercel.app/api/paypal/webhook, registered for eight invoice event types.

The first signed CREATED notification exposed a mismatch in the initial fixture: the real invoice ID is nested in resource.invoice.id. The original handler acknowledged that initial creation event without reconciliation. The corrected handler extracts the nested ID, retains support for direct shapes, and returns a retryable error if a verified invoice event lacks a valid ID. Regression tests cover the observed shape and the missing-ID failure.

The final deployed handler processed these real events:

| Event | Invoice | Observed result |
| --- | --- | --- |
| CREATED · WH-7DD50607LT7651225-7WF89690HX837863V | IR-97AEC7C5 | Signature verified, event processed, reconciliation timestamp advanced |
| SENT · WH-9N2926799R233300R-9GB32318E6838644G | IR-E3B7428F | Signature verified, authoritative SENT status fetched |
| PAID · WH-6HA39187SC552270U-8B5100327D495590W | IR-E3B7428F | Signature verified, current PayPal invoice fetched, database changed to PAID with due_cents = 0 |

The PAID reconciliation timestamp was 08:33:39.242 UTC; the event's processed_at was 08:33:41.033 UTC. A read-only database query and the hosted browser confirmed the result before any manual PayPal sync. The browser was reloaded to read database state; the app also polls workspace reads every 15 seconds while visible.

PayPal accepted real CREATED and PAID replay requests with HTTP 202. Follow-up database reads retained one event row and the original processed_at/reconciled_at values. Final paid balance remained zero. The unit/database tests additionally exercise concurrent duplicates, failed retries, lease expiry, and stale state protection.

Actual partial-payment, pending-payment, and out-of-order live PayPal events were not separately generated. Their mappings and transitions were tested through policy and rollback-only database regressions. Preserve that distinction in the demonstration.

## Source and deployment boundaries

The user explicitly authorized sending existing PayPal Sandbox and Supabase server credentials to the production environment of the exact invoicerescue-ai Vercel project. Private values are stored as Secrets; public connection values are Config. Preview deployments were not given these credentials. No merchant login password was uploaded. Deployment dry-run excluded local environment files, account screenshots, build output, and internal status. Local secret files remain ignored and mode 600.

The GitHub connector could read the new repository but rejected a tree write. The previously configured official GitHub CLI was restored, and source publication succeeded through the user's existing keyring login. The public repository was verified to use the MIT license. No new GitHub token or broader integration permission was created.

## Observed advisories and remaining submission work

- Internal ai_runs and webhook_events tables intentionally have RLS with no browser grants/policies.
- Supabase leaked-password protection is disabled in the project's default Auth settings. Review it before broader account onboarding.
- Four composite foreign-key index opportunities and unused indexes were reported for the small new database.
- The public YouTube demonstration video, entrant eligibility/team details, private judge-testing access, and actual Devpost form are not completed by this release verification.
- Keep the application and required services available throughout judging.

Screenshots are retained locally under docs/screenshots, including cloud-demo.jpg, cloud-paid.jpg, and cloud-webhook-paid.jpg. Account/billing screenshots and local environment values are excluded from the public source.
