# Demonstration script

Target duration is 2 minutes 40 seconds. Record actual application screens. Real USD 1.00 Sandbox buyer payments, manual reconciliation, and hosted signed-payment-webhook reconciliation are verified. Record the current public application at https://invoicerescue-ai.vercel.app/. Keep each narration claim consistent with docs/verification.md.

## 0:00–0:18 · The problem

Show the overview with the environment badge visible.

“For freelancers, an unpaid invoice often comes with an unanswered question. Did the client forget, lose the link, dispute the amount, or need more time? InvoiceRescue AI helps you understand that blocker and choose a considerate next step.”

## 0:18–0:35 · The connected invoice

Open the Sandbox workspace and a real test invoice. Show the PayPal invoice ID and status.

“This workspace is connected to PayPal Sandbox. I can create an invoice here or synchronize existing invoices. PayPal supplies the amount, payment link, and payment status.”

## 0:35–1:10 · Payment Blocker Intelligence

Paste a synthetic customer message saying they cannot find the payment link. Click Analyze payment blocker. Show the completed result and exact supporting quote. Trim idle waiting time transparently if necessary.

“Here, the customer cannot find the payment link. The model receives the invoice context and returns a structured classification, supporting evidence, and a suggested reply. The application checks that the quoted evidence appears in the message. It then maps the result to a permitted action.”

## 1:10–1:32 · Merchant control

Show an eligible sent invoice. Edit the draft, approve its reminder, and show the recorded outcome. Use footage from an actual accepted Sandbox request.

“I can edit or reject the suggestion. Approval rechecks the invoice with PayPal and claims the action in the database. Duplicate and frequency controls apply before a reminder is sent. The outcome is recorded in the activity log.”

## 1:32–1:58 · Different blockers, different actions

Show a dispute example and a payment promise. Keep the Demo mode badge visible if using preset scenarios.

“An amount dispute pauses application reminders for human review. A payment promise records a confirmed date and suppresses premature follow-ups. This resettable demo uses clearly labeled synthetic scenarios, while the Sandbox workspace runs the connected services.”

## 1:58–2:23 · Payment closes the loop

Show verified paid invoice IR-E3B7428F in the hosted workspace and its blocked-reminder notice; docs/screenshots/cloud-webhook-paid.jpg records the observed result. Show its actual Activity log transition. The signed INVOICING.INVOICE.PAID event was processed and changed the database without a manual PayPal refresh. Use existing actual payment footage if available; otherwise show the verified result and describe the completed test. Do not simulate payment while presenting the shot as a real buyer payment.

“The Sandbox buyer completed this payment. A verified PayPal webhook automatically reconciled the hosted invoice. Payment events can include partial or pending payments, so the current invoice determines the result. Once it is settled, pending reminders are blocked.”

## 2:23–2:40 · Safe boundaries and ending

Show the completed prompt-injection analysis, then return to the overview.

“Customer messages are treated as untrusted data. This malicious instruction is routed to human review. The model cannot mark an invoice paid or obtain payment credentials. InvoiceRescue AI gives independent businesses a clearer path from an unpaid invoice to the right next conversation.”

## Recording preparation

- Use a clean browser window and keep the environment badge visible.
- Use synthetic customer text and Sandbox accounts.
- Hide credential fields, account passwords, authentication headers, and environment files.
- Record at 1920×1080 when possible. Use readable zoom and crop only where needed.
- Use original narration and cleared assets. Keep the final export below three minutes.
- Upload the final video publicly on YouTube and verify it in a signed-out browser.
