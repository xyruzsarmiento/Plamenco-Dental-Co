# Plamenco Dental Co. Clinical Record Lifecycle

The existing `DentalRecordStatus` model is retained. Part 35 does not introduce a second visit/record state machine.

## Draft

Purpose: editable clinical documentation while the visit is being documented.

- Created from an appointment only when the clinical workflow actually starts or the authorized user explicitly creates a clinical record.
- Editable through the existing draft update path.
- `createdBy` and provider attribution are preserved.
- `lastUpdatedBy` may change as authorized draft edits occur.
- UI may display `Draft — Not Finalized`.
- Deleting a draft is possible only where the existing application permits it; finalized history is never deleted through draft operations.

## Finalized

Purpose: completed clinical documentation that forms part of the patient's permanent clinical history.

- Created by finalizing a draft.
- Records `finalizedAt` and `finalizedBy`.
- Normal update path rejects edits to finalized records.
- Finalization must be attributable in the audit trail.
- Patient-visible information remains separate from internal clinical notes.

## Amended

Purpose: preserve a finalized record while attaching a documented correction or clarification.

- An amendment contains amendment text, reason, author, provider where available, and created timestamp.
- The original finalized content is not silently replaced.
- Record status may become `amended` after an amendment is added.
- Amendments remain audit-visible.

## Voided

The status exists in the current schema. Part 35 does not invent new void authority or business rules. Any production UI for voiding a clinical record must wait for a documented clinic decision and trusted authorization path.

## Legacy compatibility statuses

The type/schema still recognize historical `active`, `follow_up`, and `completed` values for compatibility. The current store normalizes these legacy values into the draft lifecycle rather than presenting them as new competing clinical workflow states.

## Appointment relationship

A clinical record may store `relatedAppointmentId`. Part 35 reuses that relation and must not create multiple parallel clinical records for the same appointment unless explicit versioning architecture is introduced later.

## Provider and branch attribution

Clinical records preserve their stored provider and branch. Missing historical provider/branch data is displayed as `Unknown / Unmapped`; it must not be reassigned to the logged-in dentist or Pulilan.

## Required audit behavior

Important events include:

- clinical record created
- draft updated
- record finalized
- amendment added
- treatment linked/updated
- prescription created
- clinical document uploaded
- visit completed
- follow-up recommended

User-facing audit/history views must translate technical event keys into readable clinic activity.
