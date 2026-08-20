# Signature Storage Security

## Storage bucket

Drawn signatures use the private Supabase Storage bucket `consent-signatures`. The bucket is explicitly configured with `public = false`, PNG-only MIME restrictions, and a 1 MiB file-size limit.

## Storage path

The Part 38 client uses:

`<patient-public-id>/<submission-id>/signature.png`

The path contains identifiers only and must not contain patient names, medical answers, or consent wording.

## Upload access

A patient may upload only beneath the first folder that resolves to their authenticated patient record. Storage RLS checks ownership through `current_user_owns_patient`.

## Read access

The patient may read their own signature. Internal signature access is limited to management users with `settings.manage` or clinical users with `clinical_records.view`. Operational staff do not receive signature-object access merely because they can see an assignment status.

## Signed URLs

Private signature display uses short-lived signed URLs generated on demand. Permanent signed URLs are never stored in the database.

## Submission linkage

A drawn signature is uploaded under the UUID that will become the patient form submission ID. The trusted `submit_patient_form_v2` RPC stores that exact path with the immutable submission. If the database submission fails, the client attempts to remove the orphaned upload.

## Deletion restrictions

The final patient form submission is immutable. Routine application flows do not expose deletion of signed submissions or signature artifacts. A legal-retention/deletion workflow must be explicitly designed separately before destructive actions are introduced.

## Audit expectations

Sensitive signed-form/signature view and export actions should be logged when those UI flows are added. Audit metadata should reference submission/form identifiers rather than copying medical answers or full consent text.

## Never public

Do not place signatures, signed consent PDFs, medical history, or full signed-form content in a public bucket, public URL, query string, analytics event, or console log.
