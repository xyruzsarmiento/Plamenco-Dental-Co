# Plamenco Dental Co. Patient Journey Audit

Audit date: 2026-08-18

## Journey Map

Public website -> Book Appointment -> Branch -> Service -> Dentist preference -> Date -> Time -> Patient details -> Confirmation -> Clinic confirmation/reminders -> Visit -> Treatment -> Billing/payment -> Receipt -> Portal history -> Follow-up/recall.

## Findings

| Stage | Current Experience | Problem | Severity | Resolution |
|---|---|---|---|---|
| Landing to booking | Public CTA routes to `/book`. | Route is live. | LOW | Verified during route smoke checks. |
| Public booking | Booking previously allowed service/date/time without branch context. | Could imply fake or branch-agnostic availability. | HIGH | Public booking now requires branch and uses branch/provider-aware availability. |
| Dentist preference | Portal supported dentist preference; public booking did not. | New patients had less control than returning patients. | MEDIUM | Public booking now offers dentist preference and Any available dentist. |
| Service pricing | Prices come from configured service records. | Zero/unconfigured prices needed friendlier wording. | MEDIUM | Patient UI shows price available upon consultation when price is not configured. |
| Booking conflict | Existing appointment creation and availability checks validate the slot again. | Needs server-side Supabase staging proof. | HIGH | Store now rechecks branch/provider availability before public booking creation. |
| New patient public booking | Store created placeholder DOB/medical values. | Fake medical/profile data could pollute patient records. | HIGH | Removed fake DOB, address, emergency, allergy, and medical defaults. |
| Existing patient match | Public booking reuses exact email or phone match. | Portal account linking still requires stronger verified workflow for imported/walk-in records. | CRITICAL | Documented as launch blocker; do not link by name alone. |
| Patient portal statuses | Some raw statuses appeared in appointment/treatment/payment lists. | Patient saw internal terms. | MEDIUM | Added patient-friendly status labels. |
| Clinical privacy | Dental records show patient summary/recommendations, not audit logs or internal notes. | Needs RLS proof in Supabase. | HIGH | Documented visibility matrix and staging RLS requirement. |
| Online payment | Portal can initiate online payment architecture but gateway is not configured. | Must not claim paid from frontend redirect. | CRITICAL | Existing UI warns gateway secrets are needed; provider sandbox remains blocker. |
| Mobile | Portal has mobile sidebar and responsive booking layout. | Needs device/browser test at 390px and 430px. | MEDIUM | Added to QA/known issues. |

## Scenario Status

| Scenario | Status | Notes |
|---|---|---|
| New patient books from website. | PASS LOCAL | Branch/service/dentist/date/time/details/review flow exists. |
| Existing imported patient registers. | BLOCKED | Safe account linking workflow requires clinic verification rules and staging Auth. |
| Existing walk-in patient registers. | BLOCKED | Same as imported patient linking. |
| Patient with upcoming appointment logs in. | PASS LOCAL | Portal dashboard and appointment tab show upcoming records. |
| Patient reschedules. | PARTIAL | Staff/internal reschedule exists; patient self-reschedule rules undecided. |
| Patient cancels. | PARTIAL | Internal cancellation exists; patient self-cancel rules undecided. |
| Patient misses appointment. | PARTIAL | No-show status displays as missed appointment; recovery automation needs provider config. |
| Patient completes treatment. | PASS LOCAL | Patient-facing history reads treatment/dental record summaries. |
| Patient pays cash at clinic. | PASS LOCAL | Manual payments appear in portal when recorded. |
| Patient pays online. | NOT RUN | Requires payment gateway sandbox/live config. |
| Payment webhook delayed. | NOT RUN | Requires provider sandbox webhook test. |
| Follow-up recommended. | PARTIAL | Follow-up fields display; one-click schedule follow-up remains open. |
| Recall due. | NOT BUILT | Recall rules not approved. |
| Patient changes phone. | PARTIAL | Profile edit exists; verification policy undecided. |
| Patient tries another patient's URL. | PASS LOCAL | Frontend route guard redirects mismatched portal route; RLS still must be tested. |
| Patient double-clicks booking confirm. | PARTIAL | Store conflict protection exists; UI-level submit lock should be added to public booking. |
| Patient double-clicks pay. | PARTIAL | Payment store has safeguards; gateway idempotency needs staging/provider test. |
| Slot becomes unavailable. | PASS LOCAL | Friendly slot unavailable message used. |
| SMS fails. | PARTIAL | Outbox failure architecture exists; provider test not configured. |
| Mobile patient completes journey. | NOT RUN | Needs real viewport QA. |
