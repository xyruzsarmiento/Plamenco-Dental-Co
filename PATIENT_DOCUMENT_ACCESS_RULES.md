# Patient Document Access Rules

## Default privacy
Patient documents, signed forms, receipts containing patient data, and clinical attachments are private unless a specific resource is intentionally public. A patient may only access files linked to their authenticated patient identity and explicitly marked/allowed for patient visibility.

## Signed URLs
When a private bucket object must be viewed/downloaded in the browser, generate short-lived signed access only after ownership/permission is verified. Never expose service-role credentials or persist signed URLs as permanent document URLs.

## Signed forms
The patient sees the immutable submission content/version captured at signing time. Signature images belong to that submission and are not reused as profile signatures.

## Receipts
Only confirmed persisted payments may expose a receipt. Internal reconciliation notes, provider compensation, cash-session data, and payment-verification notes remain hidden.

## Clinical attachments
Clinical/staff-only files stay hidden unless the record has an explicit patient-visible rule supported by the existing document architecture.

## Failure handling
If authorization or signed-access generation fails, display an error state. Do not render a fake Download/View success state or fall back to a public URL.

## Audit
Sensitive document view/download events may be audited when the existing audit architecture supports the event. Audit records themselves are not patient-visible.
