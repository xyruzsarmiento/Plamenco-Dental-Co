# Plamenco Dental Co. UAT Checklist

Status values: `PASS`, `FAIL`, `BLOCKED`, `NOT TESTABLE`, `NOT IMPLEMENTED`.

Severity values: `P0 CRITICAL`, `P1 HIGH`, `P2 MEDIUM`, `P3 LOW`, `N/A`.

This checklist is for clinic user acceptance testing. Do not mark live operational workflows as `PASS` until they are verified by the correct role against an approved development, staging, or production test environment.

| Test ID | Module | Role | Branch | Scenario | Preconditions | Steps | Expected Result | Actual Result | Status | Severity | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| UAT-001 | App Shell | Any | All | Direct route loading | Local Vite server available | Open `/`, `/login`, `/app`, `/app/data-import`, `/app/system-admin` | SPA routes load without server 404 | Local route smoke returned HTTP 200 | PASS | N/A | Auth-gated routes still require valid user in browser |
| UAT-002 | Authentication | Patient | All | Patient registration | Supabase Auth configured with email redirects | Register patient, confirm email, log in | Patient profile created and portal route opens | Code reviewed; live email confirmation not available | NOT TESTABLE | P1 HIGH | Requires Supabase project and email configuration |
| UAT-003 | Authentication | Staff | All | Staff login | Real staff account exists | Log in as Staff | Staff reaches app without Super Admin controls | No real staff account available | NOT TESTABLE | P1 HIGH | Test with clinic-approved staging account |
| UAT-004 | Authentication | Dentist | All | Dentist login | Real dentist account exists | Log in as Dentist | Dentist sees clinical workflow, not admin/security controls | No real dentist account available | NOT TESTABLE | P1 HIGH | Test with assigned provider profile |
| UAT-005 | Authentication | Associate Dentist | All | Limited clinical login | Associate dentist account exists | Log in and inspect reports/settings/staff | Clinic-wide financial/security controls are unavailable | No real associate account available | NOT TESTABLE | P1 HIGH | Permission model exists; role UAT required |
| UAT-006 | Authentication | Super Admin | All | Super Admin login | Real super admin account exists | Log in and open `/app/system-admin` | System Administration opens | Route smoke passed; role session not available | BLOCKED | P1 HIGH | Requires super admin credentials |
| UAT-007 | Dashboard | Staff | Pulilan | Clinic opening dashboard | Appointments, pending requests, payments, inventory warnings exist | Open dashboard at start of day | Staff can see today's operational priorities | Code reviewed only | NOT TESTABLE | P2 MEDIUM | Requires realistic staging dataset |
| UAT-008 | Dashboard | Staff | Plaridel | Branch opening dashboard | Plaridel appointments and inventory exist | Filter/scope dashboard if supported | Branch-specific priorities are visible | Code reviewed only | NOT TESTABLE | P2 MEDIUM | Requires branch-scoped test data |
| UAT-009 | Online Booking | Patient | Pulilan | Patient requests appointment | Patient account and Pulilan schedules/services configured | Select branch, service, date, slot, submit | Request is pending and visible to staff | Code reviewed; no live user/session | NOT TESTABLE | P1 HIGH | Must verify slot engine with real schedules |
| UAT-010 | Online Booking | Patient | Plaridel | Patient requests appointment | Patient account and Plaridel schedules/services configured | Select branch, service, date, slot, submit | Request is pending and visible to staff | Code reviewed; no live user/session | NOT TESTABLE | P1 HIGH | Must verify branch separation |
| UAT-011 | Appointments | Staff | All | Booking review details | Pending appointment exists | Open appointment details | Patient, contact, branch, service, date/time, price, provider, payment state, notes show where available | Code reviewed; route smoke passed | NOT TESTABLE | P2 MEDIUM | Requires sample appointment |
| UAT-012 | Appointments | Staff | All | Provider assignment | Providers have branch/schedule assignments | Assign provider to request | Only eligible providers appear and conflicts are blocked | Code reviewed only | NOT TESTABLE | P1 HIGH | Requires realistic schedule data |
| UAT-013 | Appointments | Staff | All | Confirm appointment | Pending request exists | Confirm request | Status, calendar, portal, history, notification event update | Code path exists; delivery requires config | NOT TESTABLE | P1 HIGH | External SMS/email/Messenger not live verified |
| UAT-014 | Calendar | Staff | All | Calendar navigation | Appointments exist | Use month/today/filter/date click/appointment click | Calendar remains usable and details open | Route smoke only | NOT TESTABLE | P2 MEDIUM | Browser interaction pass required |
| UAT-015 | Queue | Staff/Dentist | All | Check-in to waiting | Confirmed appointment exists | Check in, move to waiting | Arrival/waiting status appears to staff and dentist | Code reviewed only | NOT TESTABLE | P1 HIGH | Requires authenticated role test |
| UAT-016 | Walk-In | Staff | All | Existing patient walk-in | Existing patient available | Search patient, create walk-in appointment | Patient record reused; booking source is walk-in | Code reviewed only | NOT TESTABLE | P1 HIGH | Must test duplicate prevention |
| UAT-017 | Walk-In | Staff | All | New patient walk-in | No matching patient exists | Create essential patient record and appointment | Patient record created without portal account | Code reviewed; patient/Auth separation exists | NOT TESTABLE | P1 HIGH | Needs role/session UAT |
| UAT-018 | Patients | Staff | All | Duplicate prevention | Existing patients available | Try same phone/email/name+DOB | Possible duplicate is shown, legitimate person can proceed | Duplicate code reviewed | NOT TESTABLE | P2 MEDIUM | Needs hands-on test data |
| UAT-019 | Clinical | Dentist | All | Start visit | Waiting appointment exists | Open patient, start visit | Appointment and clinical visit synchronize | Code reviewed only | NOT TESTABLE | P1 HIGH | Requires dentist session |
| UAT-020 | Clinical | Dentist | All | Save clinical notes | Clinical visit open | Enter notes, save, refresh | Notes persist with provider/date relationship | Build passed | NOT TESTABLE | P1 HIGH | Requires browser/session test |
| UAT-021 | Treatments | Dentist | All | Record treatment | Clinical visit open, services configured | Add treatment | Treatment has provider, service, price snapshot, notes | Code reviewed only | NOT TESTABLE | P1 HIGH | Verify with configured prices |
| UAT-022 | Treatments | Dentist | All | Multiple treatments | Clinical visit open | Add two treatments | Billing totals reflect both treatments | Code reviewed only | NOT TESTABLE | P1 HIGH | Needs data test |
| UAT-023 | Prescriptions | Dentist | All | Prescription creation | Patient/visit exists | Create, view/print prescription | Patient-safe content visible where allowed | Code reviewed only | NOT TESTABLE | P2 MEDIUM | Needs clinical UAT |
| UAT-024 | Billing | Staff | All | Invoice after treatment | Completed treatments exist | Create/view invoice | Patient, branch, services/treatments, provider, totals display | Build passed | NOT TESTABLE | P1 HIGH | Needs connected scenario |
| UAT-025 | Billing | Staff | All | Manual partial payment | Invoice with balance exists | Record partial payment | Invoice status becomes partially paid with correct balance | Store tests exist; full UAT not run | NOT TESTABLE | P1 HIGH | Existing tests not wired to npm script |
| UAT-026 | Billing | Staff | All | Full payment and receipt | Partially paid invoice exists | Record remaining payment | Invoice paid, receipt available, report updates | Store tests exist; full UAT not run | NOT TESTABLE | P1 HIGH | Requires real workflow data |
| UAT-027 | Billing | Patient | All | Pay online | Gateway sandbox configured | Initiate online payment and process verified webhook | Payment remains processing until server verification | Architecture implemented; no gateway creds | BLOCKED | P0 CRITICAL | Must sandbox test before go-live |
| UAT-028 | Billing | Staff | All | Refund | Completed payment exists | Create refund | Original payment preserved and refund logged | Code reviewed only | NOT TESTABLE | P1 HIGH | External refund not implemented |
| UAT-029 | Inventory | Staff | Pulilan | Stock in/out | Item/supplier configured | Stock in and stock out | Pulilan stock changes only | Store tests exist; full UAT not run | NOT TESTABLE | P1 HIGH | Needs browser role test |
| UAT-030 | Inventory | Staff | Plaridel | Branch-specific stock | Same item exists in both branches | Compare quantities | Branch counts remain separate | Code reviewed only | NOT TESTABLE | P1 HIGH | Requires branch data |
| UAT-031 | Inventory | Staff | All | Purchase receive | PO exists | Receive purchase | PO alone does not increase stock; receipt does | Store tests exist; full UAT not run | NOT TESTABLE | P1 HIGH | Needs transaction UAT |
| UAT-032 | Expenses | Staff/Admin | Pulilan | Branch expense | Expense categories exist | Create Pulilan utility expense | Expense is scoped to Pulilan | Store tests exist; full UAT not run | NOT TESTABLE | P2 MEDIUM | Needs data test |
| UAT-033 | Expenses | Staff/Admin | Plaridel | Branch expense | Expense categories exist | Create Plaridel utility expense | Expense is scoped to Plaridel | Store tests exist; full UAT not run | NOT TESTABLE | P2 MEDIUM | Needs data test |
| UAT-034 | Communications | Staff | All | Appointment communication | Preferences and provider config exist | Confirm/resend appointment communication | In-app works; external channels log sent/failed/skipped accurately | Provider credentials unavailable | BLOCKED | P1 HIGH | Do not mark external delivery PASS without credentials |
| UAT-035 | Communications | Scheduler | All | Appointment reminders | Supabase scheduled function configured | Run reminder scheduler | Eligible confirmed appointments get reminder logs/outbox entries | Edge Function created; not deployed | BLOCKED | P1 HIGH | Requires Supabase scheduled execution |
| UAT-036 | Reports | Admin | All | End-of-day report | Operational records exist | Filter day/branch/provider; export PDF/Excel | KPIs, table, exports reconcile | Build passed; no real data UAT | NOT TESTABLE | P1 HIGH | Needs sample day data |
| UAT-037 | Data Import | Admin/Super Admin | All | Import workspace route | User has `patients.import` | Open `/app/data-import` | Guided migration workspace loads | Local route smoke returned HTTP 200 | PASS | N/A | Real workbook not provided |
| UAT-038 | Data Import | Admin/Super Admin | All | Real workbook migration | Client workbook available | Upload, inspect, map, validate, dry run | All rows accounted for before import | No real workbook provided | BLOCKED | P1 HIGH | Import infrastructure ready, migration not performed |
| UAT-039 | Security | Patient | All | Patient data isolation | Two patient accounts exist | Patient A opens Patient B portal URL | Redirect/unauthorized, no data exposure | Code reviewed only | NOT TESTABLE | P0 CRITICAL | Must test with real auth |
| UAT-040 | Security | Staff | All | Permission enforcement | Staff without admin permissions exists | Attempt settings/system-admin/data-import | Access denied | Code reviewed only | NOT TESTABLE | P0 CRITICAL | Must test with real auth |
| UAT-041 | Production Config | Super Admin | All | Env/secret handling | Production deployment prepared | Search frontend for secret env usage | No forbidden frontend secret names found in last scan | Pattern scan passed previously | PASS | N/A | Edge Function secrets still need Supabase config |
| UAT-042 | Build | Developer | All | Production build | Dependencies installed | Run `npm.cmd run build` | Build completes | Build passed | PASS | N/A | Vite bundle-size warning remains |
| UAT-043 | Lint | Developer | All | Static lint | Dependencies installed | Run `npm.cmd run lint` | Lint completes | Lint passed | PASS | N/A | No npm test script exists |

## Launch Blockers

- P0: Payment gateway sandbox/live verification is blocked until provider credentials and webhook URLs are configured.
- P0: Patient data isolation and permission enforcement require real Supabase Auth test accounts before launch.
- P1: End-to-end clinic-day workflow needs a safe staging dataset covering Pulilan and Plaridel.
- P1: External SMS, email, and Messenger delivery cannot be accepted until provider credentials are configured and delivery/failure logs are verified.
- P1: Supabase migrations, RLS policies, Edge Functions, scheduled functions, and storage policies must be applied and tested in the actual Supabase project.
- P1: Real historical workbook migration is blocked until the client provides the actual Excel/CSV files for inspection.

## Clinic-Day UAT Script

1. Super Admin verifies branches, providers, schedules, services, payment methods, notification settings, and migration settings.
2. Staff opens the dashboard and reviews today's appointments, requests, queue, payment alerts, low-stock items, and notifications.
3. Patient requests appointments for Pulilan and Plaridel through the patient portal or public booking route.
4. Staff reviews pending requests, assigns eligible providers, resolves conflicts, and confirms appointments.
5. Staff checks in arriving patients and moves them through waiting status.
6. Dentist opens waiting patient, starts visit, records notes, treatments, prescriptions/documents if applicable, and completes the visit.
7. Staff creates invoice, records partial and full payments, verifies receipts, and tests refund workflow.
8. Staff processes inventory stock in/out, purchase receiving, and branch transfer.
9. Admin records operating expenses and verifies branch-scoped expense reporting.
10. Admin runs end-of-day reports and compares dashboard KPIs, detailed tables, PDF, and Excel exports.

## Acceptance Rule

Do not approve go-live until every P0 and P1 item is `PASS` or formally accepted by the clinic owner with a documented mitigation.
