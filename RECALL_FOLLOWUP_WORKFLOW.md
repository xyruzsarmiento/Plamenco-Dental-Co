# Recall & Follow-Up Workflow

## Sources
A recall/follow-up must come from an explicit clinical recommendation, completed treatment rule, configured service rule, manual staff entry, treatment-plan follow-up, historical import, or another configured rule. The system must not infer a due date from visit history alone.

## Lifecycle
Operational states are `open`, `contacted`, `waiting_patient`, `booked`, `needs_rescheduling`, `completed`, `dismissed`, and `cancelled`. Due Today / Upcoming / Overdue are derived from the recorded due date in Asia/Manila and are not medical urgency classifications.

## Clinical follow-up
A finalized clinical visit may create a follow-up only when a real due date and reason are present. `create_clinical_follow_up_recall` is idempotent for the same patient, clinical source, and due date.

## Contact workflow
Manual calls/walk-in outcomes are stored in `recall_contact_attempts`. External SMS/email/Messenger/in-app sends continue to use the existing communication delivery log/outbox; Part 39 only adds `recall_id` linkage. Sent/delivered states must come from the communication provider pipeline, not from a UI click.

## Appointment booking
The existing appointment engine remains the source of truth for availability and conflicts. A recall can only be linked to an appointment after that appointment exists. Linking sets the operational recall state to `booked`; it does not create an appointment.

## Completion / cancellation / no-show
Completion is explicit. A cancelled or no-show appointment must not complete a recall. The operator may return it to a rescheduling state when clinic policy is defined.

## Dismissal
Dismissal preserves the record, actor, timestamp, and reason. No hard delete is part of this workflow.

## Historical records
Unknown due dates remain unrecorded; unknown provider/branch stays Unknown / Unmapped. Import execution date is never substituted as a clinical due date.
