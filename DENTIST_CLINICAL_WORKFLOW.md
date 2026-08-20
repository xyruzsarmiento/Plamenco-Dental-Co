# Plamenco Dental Co. Dentist Clinical Workflow

## Start of day

1. Dentist authenticates with their own account.
2. The application resolves the provider profile from the authenticated profile ID, with email only as a compatibility fallback.
3. Today workspace shows only appointments assigned to that provider and branch assignments available to that provider.
4. Scheduled appointments are not treated as physically present until front desk records check-in/waiting state.

## Patient arrival

Front desk owns arrival/check-in workflow. Dentist Today uses the existing appointment states:

`confirmed -> checked_in -> waiting -> in_progress -> completed`

Cancelled, rejected, rescheduled and no-show appointments are excluded from the active clinical queue.

Waiting duration uses `waitingAt` or `checkedInAt`; appointment start time is never used as a substitute for arrival time.

## Open patient

Before treatment, the dentist can open the patient record and review actual stored information including:

- patient identity
- reason/service
- allergies
- medical conditions
- current medications
- relevant prior clinical/treatment history

Missing allergy data is described as `No allergies recorded`; the application does not claim medical certainty.

## Start visit

A dentist with `appointments.start` may start an appointment only from an allowed operational state. The existing appointment transition service remains authoritative and records the start timestamp/audit event.

Starting the visit creates or reuses the one existing clinical visit linked to the appointment. It does not create a second clinical-record system.

## Clinical documentation

The existing clinical record remains the source of truth. Draft documentation may contain:

- chief complaint
- clinical findings
- assessment
- treatment performed
- recommendations
- internal clinical notes
- patient-visible summary
- follow-up recommendation

Draft UI must not claim `Saved` until persistence succeeds.

## Treatments

Treatments use the existing treatment architecture. A newly performed treatment snapshots the configured price at the time it is recorded. Historical treatment value must come from the stored snapshot and never be recalculated using the current service catalog price.

Planned/recommended treatment is not automatically billed as performed treatment.

## Prescriptions

Prescriptions use the existing prescription module. Medication, dosage, frequency, duration and instructions are explicitly entered by an authorized dentist. The system does not generate medication instructions or clinical defaults.

## Documents

Clinical documents use the existing document/private-storage architecture. Protected patient documents must not be placed in public storage. Upload success is shown only after persistence succeeds.

## Follow-up

A follow-up recommendation is clinical guidance, not an appointment. The dentist records the recommendation; front desk/patient selects a real available appointment through the existing scheduling workflow.

## Finalize record

Finalization is a significant action. A finalized record becomes immutable through the normal edit path. Later corrections use the existing amendment workflow so author, reason and timestamp remain attributable.

## Clinical completion and front-desk handoff

Completing clinical work does not collect money. The existing treatment/charge/billing workflow prepares the financial handoff while front desk handles billing, payment and follow-up scheduling.

The system should derive front-desk readiness from clinical/treatment/appointment state rather than introduce a duplicate `ready_for_checkout` appointment status unless a later schema decision explicitly requires it.

## End of visit

Dentist verifies that clinical work is saved/finalized as required, leaves patient-visible instructions only in patient-visible fields, and moves to the next assigned patient.

## Explicit exclusions

Part 35 does not surface or rebuild the odontogram/dental chart. It also does not add AI diagnosis, AI treatment recommendations, generated prescriptions, automated clinical risk scoring or new billing/payment systems.
