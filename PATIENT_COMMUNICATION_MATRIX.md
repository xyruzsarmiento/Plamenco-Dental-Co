# Plamenco Dental Co. Patient Communication Matrix

This matrix documents intended patient communications. Provider delivery must not be claimed until SMS, email, Messenger, and webhook credentials are configured and tested.

| Event | Trigger | Audience | SMS | Email | Messenger | Portal Notification | Template / Source | Idempotency |
|---|---|---|---|---|---|---|---|---|
| Registration | Patient creates portal account. | Patient | Optional | Yes if Auth email enabled | No | Account state only | Supabase Auth email / clinic copy | Supabase Auth token flow. |
| Booking request | Public or portal booking submitted. | Patient, clinic staff | Optional | Optional | Optional | Appointment appears in portal | `appointment_requested` or booking log | Appointment ID and communication log. |
| Appointment confirmed | Staff approves appointment. | Patient | Yes if consent/configured | Yes if configured | If eligible/configured | Yes | `appointment_confirmed` | Recent-message guard and delivery log idempotency. |
| Reminder | Scheduled reminder job. | Patient | Yes if consent/configured | Yes if configured | If eligible/configured | Yes | `appointment_reminder` | Outbox entry, appointment/time/channel key, cron `CRON_SECRET`. |
| Reschedule | Staff or approved patient reschedule. | Patient | Optional | Optional | Optional | Yes | `appointment_rescheduled` | Appointment history and duplicate-send guard. |
| Cancellation | Staff or approved patient cancellation. | Patient | Optional | Optional | Optional | Yes | `appointment_cancelled` if configured | Appointment transition/history. |
| No-show recovery | Staff marks no-show. | Patient | Optional | Optional | Optional | Yes | No-show/reschedule invitation template if configured | One message per appointment/status event. |
| Payment recorded | Cashier records manual payment. | Patient | Optional receipt notice | Optional receipt notice | No unless configured | Yes | Financial notification | Payment/receipt ID. |
| Online payment initiated | Patient starts online payment. | Patient | No | Optional | No | Payment pending state | Payment gateway flow | Gateway event ID and payment ID. |
| Online payment confirmed | Verified webhook applies payment. | Patient | Optional | Optional receipt notice | Optional | Yes | Payment confirmation | `payment_gateway_events(provider,event_id)`. |
| Follow-up | Dentist marks follow-up needed. | Patient | Optional | Optional | Optional | Yes | Follow-up reminder | Clinical visit/follow-up date key. |
| Recall | Clinic-approved recall rule. | Patient | Optional | Optional | Optional | Yes | Not finalized | Requires recall policy before implementation. |

## Channel Rules

- Use patient communication preferences and available contact details.
- Do not send staging messages to real patients.
- Do not expose technical delivery logs in the patient portal.
- Messenger requires actual Facebook Page authorization and messaging eligibility.
