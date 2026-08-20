# Form Versioning Rules

## Draft edits

Draft versions may be edited by authorized form administrators. They are not assignable and are not treated as valid patient consent.

## Publishing

Publishing changes a version from `draft` to `published`, records `published_at` and `published_by`, and sets `form_templates.current_version_id`. Published content, signature configuration, version number, effective date, and publisher metadata are protected from mutation.

## Material changes

Any change to patient-visible wording, required-signature behavior, signature method, or other material patient-facing terms requires a new version. A new draft is cloned from the latest version and receives the next deterministic integer version number.

## Non-material metadata

Administrative metadata that does not alter the patient's signed record may be maintained separately, but it must never rewrite the signed content snapshot.

## Signed record behavior

Every completed patient form submission stores its exact `template_version_id` and `form_content_snapshot`. Final signed/declined submissions are immutable. A current template change cannot modify historical submissions.

## Superseding and reassignment

Publishing a new version does not automatically invalidate old signed submissions or mass-assign the new version. Re-sign rules are a clinic decision. When re-signing is required, create a new assignment referencing the new version; preserve the previous assignment and submission.

## Archive

Archiving a form stops new assignment of that template but does not remove published versions or patient history.

## Concurrency

An assignment always points to one exact version. A patient must not have the version content silently swapped while reviewing it. If an assignment is explicitly superseded, the patient should be directed to the current assignment rather than submitting the obsolete one.
