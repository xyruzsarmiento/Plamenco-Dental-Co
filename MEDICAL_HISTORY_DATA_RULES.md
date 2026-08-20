# Medical History Data Rules

## Current patient fields

The existing `patients` record remains the current operational snapshot for allergies, medical conditions, current medications, previous surgeries, and medical notes. Part 36 does not create a second patient record.

## Revision history

Every patient medical-history submission creates a `medical_history_revisions` row containing the submitted values, source, actor, and timestamp. The current patient snapshot is then updated. This preserves provenance without making the dentist reconstruct the latest state from a long event stream.

## Provenance

Supported sources are `patient`, `staff`, `dentist`, `associate_dentist`, and `historical_import`. Patient-submitted data must never be presented as dentist-authored clinical judgment.

## Allergy semantics

An empty allergy field means `No allergies recorded` unless the latest revision explicitly has `confirmed_no_allergies = true`. The UI must not infer `No known allergies` from a blank field.

## Confirmation timestamp

`patient_intakes.medical_history_confirmed_at` records when the current intake medical history was confirmed/submitted. No freshness expiration is assumed. A stale/needs-update rule requires explicit clinic policy.

## Staff editing

Staff administrative access does not imply authority to rewrite medical answers. Any future staff medical-history editing flow must preserve source/actor provenance and use the trusted RLS/permission path.

## Dentist review

Dentists may view medically relevant information only for authorized patient context. A future `reviewed` or acknowledged state is audit evidence only and must not be labelled medical clearance.

## Privacy

Do not put full medical answers in URLs, generic audit metadata, console logs, public analytics, or public storage. Detailed medical history should load only when an authorized patient/clinical view needs it.
