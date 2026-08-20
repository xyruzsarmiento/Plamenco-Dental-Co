# Front Desk Workflow

This guide documents the operational path for Plamenco Dental Co. front-desk users. It reuses the existing patient, appointment, billing, payment, communication, and audit models; it does not define parallel records.

## Start of day

1. Sign in with the staff account assigned to the working branch.
2. Open the Today / Appointments workspace.
3. Review today's confirmed and pending appointments, checked-in/waiting patients, in-treatment visits, no-shows, and completed visits requiring billing review.
4. Review provider schedules and real appointment/blocked-time data. A provider should only be described as available when the scheduling data supports that statement.
5. Review unconfirmed appointments and failed appointment communications before the first patient arrives.

## Scheduled patient arrival

1. Locate the appointment by patient name, patient number, phone, or appointment number.
2. Open the appointment detail and confirm the patient, branch, service, dentist, and schedule.
3. Use **Check In** only when the patient is physically present.
4. The stored `checkedInAt` timestamp is the arrival source for queue/wait calculations.
5. Move the patient to Waiting when the clinic workflow calls for it. Do not create another appointment or visit merely to represent queue state.

## Walk-in

1. Search existing patients first using patient number, name, phone, or email.
2. If a likely duplicate is found, review it instead of creating a second record.
3. If no record exists, create only the basic patient information required by the current patient schema and clinic policy. A portal account is not required for a walk-in.
4. Create the visit through the existing appointment model with `bookingSource = walk_in` when supported by the active form/workflow.
5. Default the branch from the authorized front-desk context, choose a real service/provider slot, then use Add and Check In when the patient is already present.

## Caller / message booking

1. Search for the patient before creating a record.
2. Review upcoming appointments to avoid duplicate bookings.
3. Select service, branch, provider preference, date, and a slot returned by the existing availability engine.
4. Final creation must pass the same conflict checks as patient-portal booking.
5. Confirmation/reminder communications are created by the existing communication workflow, not by a separate front-desk message table.

## Queue

The operational queue uses existing appointment states and timestamps:

- `confirmed` — scheduled / not checked in.
- `checked_in` — physically arrived.
- `waiting` — waiting for provider.
- `in_progress` — clinical visit underway.
- `completed` — clinical appointment completed; billing may still need review.
- `no_show` — explicitly marked no-show by an authorized user.

Late is a derived indicator only. Do not automatically convert a late appointment to `no_show`; the threshold remains a clinic decision.

## Rescheduling

1. Open the existing appointment.
2. Choose a new date/time/provider using the scheduling engine.
3. Revalidate provider, branch, blocked time, appointment overlap, and other configured scheduling resources before saving.
4. Preserve appointment history/audit information.
5. Queue the configured reschedule communication once. A retry must not create duplicate business events.

Drag-and-drop rescheduling is optional. It must never bypass the same server/database validation used by the normal reschedule flow.

## Cancellation and no-show

Cancellation and no-show are explicit actions and must respect role permissions and the appointment transition rules.

- Cancellation should capture a reason when clinic policy requires it and release the slot.
- No-show must not be inferred solely from lateness.
- A no-show follow-up message may be queued according to clinic communication settings, with idempotency protection.

## Clinical handoff

Front-desk staff do not finalize dentist clinical notes. The intended handoff is:

Clinical work completed by an authorized clinical user → visit/treatment finalized → billing ready → front desk reviews charges/balance → payment or remaining balance recorded → follow-up scheduled if required → front-desk workflow complete.

## Billing and payment

1. Use the existing invoice/charge source of truth.
2. Never calculate a front-desk balance independently from treatment prices.
3. If an online payment is still pending trusted confirmation, show it as pending; do not mark it paid from a browser redirect.
4. Manual payments use the existing payment workflow and configured methods.
5. A confirmed payment updates the same invoice/payment records visible in the patient portal and reports.
6. Issue/view a receipt only after the payment state supports it.

## Follow-up

When a dentist has recorded a follow-up recommendation, the front desk may schedule the next appointment without re-entering the patient. Patient, branch, service/reason, and provider context may be prefilled where appropriate, but the new slot must still pass availability checks.

## End of day

Review remaining operational exceptions: appointments still in active treatment states, patients needing billing review, pending/failed communications, unresolved payments, no-shows, and branch cash-session exceptions where the existing financial workflow applies. Do not alter clinical or financial records simply to make the dashboard look complete.

## Security rules

Front-desk search and quick views may only return records the logged-in user is authorized to access. Branch restriction and patient-data authorization must be enforced by the trusted data layer/RLS; filtering rows after a clinic-wide browser fetch is not an authorization mechanism.
