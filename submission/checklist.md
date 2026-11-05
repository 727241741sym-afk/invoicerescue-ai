# Submission checklist

## Repository

- [x] Application source, exact dependencies, and lockfile prepared.
- [x] MIT license included.
- [x] README, environment template, architecture, and test instructions prepared.
- [x] Create a public GitHub repository and push the reviewed source.
- [x] Confirm GitHub identifies the MIT license and the published README.
- [x] Scan the published source for configured credentials; exclude test login details, environment values, and account screenshots.

## Functional release

- [x] PayPal Sandbox OAuth and invoice read verified.
- [x] Create a real Sandbox invoice through the application UI.
- [x] Run real AI analysis through the configured local provider.
- [x] Validate supporting quotes and reject unsupported model output.
- [x] Exercise prompt injection and human-review approval in the UI.
- [x] Verify synthetic paid scenario blocks further reminders.
- [x] Run typecheck, Vitest, Playwright API tests, and database regressions.
- [x] Run a production build.
- [x] Finish real Sandbox invoice send and reminder acceptance verification.
- [x] Complete a payment with the Sandbox Personal buyer; manually reconcile PAID, zero outstanding, and blocked further reminders.
- [x] Register a reachable HTTPS webhook endpoint on the correct PayPal app.
- [x] Verify a real invoice-payment event passes signature verification and automatically updates the hosted invoice and dashboard. Real-event replay requests were accepted and subsequent database reads showed no repeated reconciliation.
- [x] Complete responsive and production-browser checks after final changes.
- [x] Deploy the connected app to Vercel and verify hosted Gateway analysis plus database persistence.
- [ ] Keep application and testing access available through the judging period.

## Devpost

- [x] English project copy prepared in `devpost.md`.
- [x] English script and shot list prepared for a 2 minute 40 second demonstration.
- [x] Entrant supplied personal/eligibility responses; technical sponsor/tool responses were saved. Final Rules/Terms acceptance remains with the entrant.
- [x] Enter and save project name and elevator pitch in the existing Devpost draft.
- [x] Save the public project story and technology tags; prepare private testing instructions.
- [x] Save the public repository and hosted demo URLs in Project details.
- [x] Save owner-authorized dedicated application test access in the private judge-testing field.
- [x] Upload one actual application screenshot containing explicitly synthetic demo data.
- [ ] Record and upload a public YouTube video shorter than three minutes.
- [ ] Add the video URL and verify it without the owner's login.
- [ ] Compare every claim with `docs/verification.md` and the final release.
- [ ] Complete and submit all actual fields in the Devpost form before the official deadline.

## Release links to fill

| Item | Value |
| --- | --- |
| Public repository | https://github.com/727241741sym-afk/invoicerescue-ai |
| Functional demo | https://invoicerescue-ai.vercel.app/ |
| Public YouTube video | Pending recording and upload |
| Devpost project | https://devpost.com/software/invoicerescue-ai (incomplete submission) |

The competition website displayed a submission deadline of November 12, 2026 at noon PST when checked, corresponding to November 13 at 04:00 in Hong Kong. Recheck the official schedule before submitting.
