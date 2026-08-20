# Plamenco Dental Co. Clinic Workflow Audit

Audit date: 2026-08-18

## Current Workflow Map

The system now connects the normal daily path through existing modules:

Patient arrives -> Today's Patient Flow -> Check In -> Waiting -> Start Visit -> Clinical Workspace -> Record Treatments -> Complete Visit -> For Billing -> Invoice/Payment -> Receipt -> Follow-up scheduling.

No new database model was added. The workflow uses appointment status, appointment operational timestamps, dental records, treatments, charges, invoices, payments, receipts, branch IDs, and audit logs already present in Parts 1-30.

## Findings

| Workflow | Problem | Impact | Severity | Resolution |
|---|---|---|---|---|
| Staff daily start | Dashboard showed useful metrics, but the operational queue was secondary. | Receptionist had to move to Appointments to answer what is happening now. | HIGH | Dashboard now prioritizes Today's Patient Flow with branch/search filters and direct actions. |
| Scheduled check-in | Check-in existed in Appointment Details, but daily dashboard did not expose it. | Extra clicks during morning front-desk rush. | MEDIUM | Added dashboard Check In action for confirmed appointments. |
| Waiting queue | Waiting and checked-in counts existed, but the scan view was fragmented. | Staff/dentist could miss who is physically waiting. | HIGH | Added queue rows with scheduled time, patient number, service, dentist, status, and waiting time. |
| Dentist handoff | Dentist could start visit from appointment page, but dashboard did not surface active chairside queue. | Dentist may need to search instead of opening today's assigned patient. | MEDIUM | Added Dentist Queue section and Start Visit action from daily home. |
| Clinical context | Clinical workspace already preserved appointment/patient/provider/branch context. | Good existing behavior. | LOW | Verified and documented; no duplicate patient selection added. |
| Treatment to billing | Completed treatment and billing modules existed but handoff relied on staff navigation. | Cashier may re-enter treatments or miss billing need. | HIGH | Added For Billing queue and billing-preparation action derived from completed appointments, treatments, charges, and open invoices. |
| Walk-in | Appointment model supports `bookingSource: walk_in`, but dashboard action still opens the appointment module rather than a single guided wizard. | Acceptable for now, but still more clicks than ideal. | MEDIUM | Added dashboard Walk-In shortcut; dedicated guided flow remains a follow-up. |
| Follow-up | Patient detail and appointment creation exist, but no one-click follow-up prefill from completed visit yet. | Staff may re-enter patient/branch details. | MEDIUM | Documented as remaining workflow improvement. |
| No-show | No-show status and history exist. | Staff can mark no-show, but clinic policy timing is not finalized. | MEDIUM | Keep manual no-show decision; clinic must define late/no-show rules. |
| Payment duplication | Billing store validates overpayment and gateway events are idempotent; manual UI still needs double-click/concurrency proof. | Financial integrity risk if real multi-user concurrency is not tested. | CRITICAL | Must be tested in staging with two users and Supabase writes. |
| Branch operations | Branch filters exist, but actual branch assignment enforcement depends on Supabase RLS tests. | Pulilan/Plaridel isolation must be proven server-side. | CRITICAL | Keep Part 29 RLS/staging tests as launch blocker. |
| Outage behavior | Local fallback storage can keep UI usable, but production staff must not assume failed remote writes succeeded. | Operational data risk during connectivity loss. | HIGH | Remains covered by production outage/DR docs; needs UI-level sync-state hardening later. |

## Interaction Count Estimate

| Workflow | Before | After Part 31 | Notes |
|---|---:|---:|---|
| Scheduled patient check-in | 3-5 clicks | 1-2 clicks | Dashboard row -> Check In. |
| Move patient to waiting | 3-5 clicks | 1-2 clicks | Dashboard row -> Waiting. |
| Dentist start visit | 4-6 clicks | 2-3 clicks | Dashboard row -> Start Visit -> Appointments/clinical context. |
| Complete visit | 3-5 clicks | 1-2 clicks | Dashboard row -> Complete. |
| Billing handoff | 4-8 clicks | 1-2 clicks | Dashboard For Billing -> creates invoice from existing treatment charges where allowed. |
| Find existing patient | 2-4 clicks | 1-2 clicks | Dashboard search/Find Patient shortcut. |
| Walk-in | 5-8 clicks | 4-7 clicks | Shortcut added; guided wizard still needed. |
| Follow-up scheduling | 5-8 clicks | 5-8 clicks | Not solved yet without broader form prefill route state. |

## 20 Operational Scenarios

| Scenario | Status | Notes |
|---|---|---|
| 8:00 Pulilan receptionist opens daily queue. | PARTIAL | Dashboard now defaults to today's flow; real branch assignment still needs staging user data. |
| Scheduled patient arrives and is checked in. | PASS LOCAL | Check In action uses existing transition/timestamp history. |
| Existing walk-in arrives. | PARTIAL | Shortcut exists; full guided find/create/assign/check-in wizard remains open. |
| New walk-in arrives. | PARTIAL | Patient duplicate prevention exists on Patients page; single walk-in wizard remains open. |
| Dentist opens waiting queue. | PASS LOCAL | Dentist Queue section shows checked-in/waiting/in-progress patients. |
| Dentist starts visit. | PASS LOCAL | Start Visit transitions appointment and creates/reuses clinical visit. |
| Multiple treatments recorded. | PASS LOCAL | Clinical workspace supports repeated treatment entry from appointment context. |
| Treatment completed and billing sees handoff. | PASS LOCAL | For Billing queue derives from completed visits/open balances/unbilled treatments. |
| Patient pays cash. | NOT RUN | Billing supports manual payments; needs staging/user test. |
| Patient needs follow-up. | PARTIAL | Manual scheduling exists; direct completed-visit prefill remains open. |
| Patient no-shows. | PASS LOCAL | No Show action exists; clinic timing policy unresolved. |
| Patient reschedules. | PASS LOCAL | Existing appointment workflow preserves history and conflict checks. |
| Pulilan delivery is received. | NOT RUN | Inventory module supports branch stock/ledger; needs branch test. |
| Plaridel Meralco bill is paid. | NOT RUN | Expenses module supports branch expenses; needs branch test. |
| Pulilan end of day. | PARTIAL | Reports/cashier/session docs exist; real reconciliation needs UAT. |
| Super Admin reviews both branches. | PARTIAL | Executive dashboard exists; needs real data verification. |
| Internet fails while cashier records payment. | NOT RUN | Needs remote write failure test. |
| Two staff perform same operation. | NOT RUN | Needs Supabase concurrency/RLS test. |
| SMS provider unavailable. | PARTIAL | Outbox retry/failure architecture exists; provider test not configured. |
| Dentist switches branch schedule. | NOT RUN | Needs provider branch assignment test. |

## Remaining High-Value Improvements

- Guided walk-in drawer from daily dashboard.
- Follow-up scheduling with patient/branch/service context prefilled.
- Billing page deep-link filters for patient or appointment context.
- App-native confirmation modals replacing browser prompts for high-impact actions.
- Explicit remote sync failure banner so database errors never look like an empty clinic.
