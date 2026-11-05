# Devpost Additional info

Draft entry: https://devpost.com/submit-to/31302-paypal-ai-hackathon/manage/submissions/1281416-invoicerescue-ai/additional-info/edit

The technical responses below are prepared for the form. Personal identity, eligibility, feedback preferences, subjective ratings, and learning responses belong to the entrant. Do not put account passwords in this public file.

## Project age

New. N/A — this is a new project built during the hackathon submission period.

## Main technology requirement

PayPal Invoicing REST API v2 in Sandbox is central to the workflow: server-side OAuth, invoice creation, invoice retrieval, sending, reminders, and authoritative status reconciliation. The hosted PayPal webhook verifies signatures, deduplicates events, and fetches the current invoice before updating balances or blocking reminders. Real Sandbox creation, send, reminder acceptance, buyer payment, and signed payment-webhook reconciliation have been tested.

Vercel AI Gateway routes the hosted analysis to OpenAI GPT-4.1 mini using short-lived Vercel OIDC authentication. The model classifies a manually pasted customer reply and returns strict-schema evidence and a suggested message. Zod checks the structure, exact quotes must match the input, and backend policy decides which actions are permitted. Merchant approval is required before any notification. Codex assisted with implementation, debugging, tests, and documentation.

## Additional sponsor tools

None, used other AI tools.

AG Grid, APIMatic, and the other listed optional sponsor tools were not used. Vercel AI Gateway and OpenAI are explained in the technology response.

## Public code repository

https://github.com/727241741sym-afk/invoicerescue-ai

## Hosted application

https://invoicerescue-ai.vercel.app/

## Testing instructions

Open the hosted application for the resettable synthetic demo. Open an invoice, select a customer-message scenario, inspect evidence and a proposed next step, and approve or reject a simulated action. Demo changes stay in the browser.

The connected Sandbox workspace requires the dedicated application merchant account. Supply any owner-authorized credentials only in Devpost's private testing-access field. The PayPal buyer password and service API secrets are unnecessary for judging the public demo and must remain private.

The README contains complete local setup instructions for reviewers using their own Sandbox and AI configuration. A connected reviewer can inspect the existing Paid test records, run analysis on a synthetic message, and test approval restrictions without sending a notification.

## AI tools used

Runtime AI: OpenAI GPT-4.1 mini through Vercel AI Gateway, using the Responses API format, strict JSON schema, Zod validation, and exact supporting quotes. AI classifies payment blockers and prepares merchant-reviewable suggestions.

Codex assisted with application implementation, debugging, testing, and documentation. An OpenAI-compatible local CLIProxyAPI endpoint was used for earlier development checks; the hosted release uses Vercel AI Gateway.

## Entrant-owned responses

The entrant must answer these truthfully:

- Individual, team, or organization; actual residence; Canadian province if applicable; organization name if applicable.
- Overall PayPal experience rating and explanation.
- Permission for organizers to contact the entrant for feedback.
- Learning level and whether the project supplied useful career AI value.
- Age, jurisdiction, and employment/affiliation eligibility declarations.

A public YouTube demonstration shorter than three minutes is still required for the Project details step. The prepared recording script is demo-script.md. Verify all personal declarations and the complete entry before final submission.
