# Consent Form Lifecycle

## Template states

- `draft`: editable clinic template; not used for new patient assignments until published.
- `published`: active template metadata. Each published content revision lives in `form_template_versions`.
- `archived`: no new use by policy; historical assignments/submissions remain available.

## Versioning

A version is immutable from the perspective of signed history. New wording requires a new `form_template_versions` row with a new `version_number`. Existing patient submissions reference the original version and also persist `form_content_snapshot`, so later template changes cannot rewrite what the patient saw.

## Assignment states

`assigned` → `viewed` → `in_progress` where needed → `signed` or `declined`. `superseded` is reserved for a clinic-approved replacement workflow and must not be applied automatically without policy.

## Signature method

`form_template_versions.signature_method` is clinic-configured: `none`, `typed_acknowledgement`, or `drawn`. The system must not infer a legally accepted signature method from the fact that a form requires a signature. Guardian/minor rules remain an unresolved clinic decision.

## Submission immutability

`patient_form_submissions` intentionally has no UPDATE or DELETE RLS policy for patients. A completed signed/declined submission is historical evidence. Corrections require a new assignment/version or an explicitly designed amendment/void process.

## Audit requirements

Important lifecycle events should be attributable to actor and timestamp. Generic audit metadata should contain identifiers rather than full medical answers or full signed form content.
