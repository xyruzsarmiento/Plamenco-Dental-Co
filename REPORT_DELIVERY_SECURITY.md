# Report Delivery Security

## Private report artifacts

Management financial and operational exports must be stored privately. Do not publish generated reports to public buckets or permanent public URLs. If a secure link is used, it should be short-lived and generated only after current authorization is checked.

## Recipient validation

User-linked recipients must be active and currently authorized for the report type and branch scope at send time. A stored subscription does not permanently authorize future access after a role/branch change.

External email recipients require explicit clinic approval. Merely entering an external address does not prove that sending sensitive reports to it is permitted.

## Data minimization

Scheduled management delivery should prefer aggregate operational/business data. Do not include patient-level medical information, patient names in email subjects, or unnecessary PII.

## Provider credentials

Email/API/service-role credentials remain server-side. No provider secret or Supabase service-role key belongs in the browser bundle.

## Delivery truth

`Queued` means queued. `Sent` requires provider acceptance/send state. `Delivered` requires provider confirmation. Failures and bounces remain visible and must not be converted to success by the UI.

## Attachment handling

If attachments are used, provider size/type rejection must mark the delivery failed. Otherwise use a short-lived signed link to a private report artifact.

## Audit and history

Preserve schedule changes, report generation attempts, resend attempts, provider IDs where safe, timestamps, and failure reasons. Manual regeneration must create a new attempt rather than rewrite the prior artifact/run.

## Retention

No report-file retention duration is assumed. Retention must be decided by the clinic and implemented without silently deleting audit/history required for traceability.
