# Appointment Status Matrix

This matrix documents the appointment statuses that already exist in `appointmentTypes.ts`. It does not introduce new queue or checkout statuses.

| Status | Meaning | Typical setters | Allowed next states in current workflow | Queue behavior | Communication / billing notes |
|---|---|---|---|---|---|
| `pending` | Booking/request exists but has not been approved. | Staff/Admin/Super Admin according to RBAC | `confirmed`, `rejected`, `cancelled` where permitted | Not an arrived patient | Request/approval communication may apply; not billable merely because it exists. |
| `confirmed` | Clinic-approved scheduled appointment. | Authorized appointment approver | `checked_in`, `rescheduled`, `cancelled`, `no_show` | Scheduled, not yet physically arrived | Confirmation/reminder communications may apply. |
| `checked_in` | Patient has physically arrived. | User with `appointments.check_in` | `waiting`, `in_progress` where permitted | Active front-desk queue; `checkedInAt` is arrival evidence | Does not itself mean treatment or payment is complete. |
| `waiting` | Patient is waiting for the provider. | Authorized workflow user | `in_progress` | Active waiting queue; waiting duration should use stored arrival/wait timestamp | No billing implication by itself. |
| `in_progress` | Clinical visit is underway. | Authorized clinical/appointment user | `completed` | Removed from waiting; shown as with provider / in treatment | Clinical record/treatment workflow controls what is billable. |
| `completed` | Appointment/clinical visit workflow has been completed by an authorized user. | Authorized clinical/appointment user | Normally terminal; corrections require the established audited workflow | Not waiting; may appear in billing handoff if invoices/charges remain open | Completion is not equivalent to paid. Billing/payment stays separate. |
| `rescheduled` | Historical appointment instance/state was rescheduled according to existing implementation. | User with reschedule permission | Follow established reschedule implementation; do not reuse as a new active slot without validation | Not an active queue entry | Reschedule communication should be idempotent. |
| `cancelled` | Appointment was cancelled. | User with cancellation permission | Normally terminal | Removed from active schedule/queue | Cancellation communication may apply; do not delete history. |
| `no_show` | Authorized user explicitly marked that the patient did not attend. | User with `appointments.mark_no_show` | Normally terminal; rescheduling creates/uses the established audited workflow | Removed from active queue | May trigger no-show follow-up once. Lateness alone must not set this state. |
| `rejected` | Appointment request was not approved. | User with `appointments.reject` | Normally terminal | Not in active queue | Rejection communication may apply. |

## Core transition rules

- Frontend button visibility is convenience only; trusted backend/database authorization remains authoritative.
- `completed → checked_in` and similar backwards transitions must not be offered as normal workflow actions.
- `confirmed → no_show` is an explicit authorized action. Time passing alone must not cause it.
- Rescheduling must validate branch, provider, schedule blocks, service duration, and conflicts before the new schedule is accepted.
- `completed` must never be interpreted as `paid`; billing and payment records are separate sources of truth.
- Queue labels such as “For Billing” or “Ready for Checkout” should be derived from clinical/billing state where possible instead of adding another appointment enum.

## Timestamp expectations

Where existing fields are present, transitions should maintain the corresponding audit timestamp and actor fields such as `checkedInAt`, `waitingAt`, `startedAt`, `completedAt`, `cancelledAt`, `noShowAt`, and `rescheduledAt`. The status-history/audit log should remain attributable to the acting user.
