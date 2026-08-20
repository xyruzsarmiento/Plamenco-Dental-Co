# Plamenco Dental Co. E2E Test Matrix

Status values: `PASS`, `FAIL`, `NOT RUN`, `NOT CONFIGURED`, `BLOCKED`.

## Public

| Scenario | Expected Result | Status | Notes |
|---|---|---|---|
| Landing page loads at `/` | Public SEO page renders with Pulilan/Plaridel metadata. | NOT RUN | Route exists; browser visual QA still required. |
| Public booking request | Patient can request appointment without creating duplicate confirmed booking. | NOT RUN | Must verify provider/branch availability and pending status. |
| Register patient | Supabase Auth user created; patient row linked by `auth_user_id`; success text requires email confirmation. | NOT RUN | Requires production/staging Supabase email config. |
| Forgot/reset password | Reset URL uses deployed origin and does not leak account existence. | NOT RUN | Requires Supabase Auth redirect verification. |

## Patient

| Scenario | Expected Result | Status | Notes |
|---|---|---|---|
| Login and portal redirect | Patient lands on `/portal/{ownPatientId}` only. | NOT RUN | Frontend guard redirects mismatched route IDs. RLS test still required. |
| IDOR direct patient URL | Patient A cannot access Patient B profile, appointments, documents, invoices, payments, or communications. | BLOCKED | Requires two real Supabase patient accounts. |
| Book appointment | Availability, branch, provider, date, time, and service are preserved. | NOT RUN | Must verify no duplicate reminders. |
| View billing/payment history | Only own invoices, payments, receipts are visible. | BLOCKED | Requires RLS API/direct URL test. |
| Logout/session refresh | Session clears and protected portal redirects to login. | NOT RUN | Browser E2E required. |

## Staff

| Scenario | Expected Result | Status | Notes |
|---|---|---|---|
| Staff login | Supabase Auth/profile role controls access. | BLOCKED | Production local-password fallback is now disabled unless dev flag is enabled. |
| Patient search/create | No duplicate patient created from whitespace or direct ID manipulation. | NOT RUN | Needs seeded staging data or real clinic UAT data. |
| Appointment check-in workflow | Pending to approved/confirmed, checked-in, waiting/in-progress, completed follows allowed transitions. | NOT RUN | Store has transition guards; UI/E2E still required. |
| Manual payment | Authorized staff records amount, method, date, reference, and actor. | NOT RUN | Needs role and RLS verification. |
| Inventory branch operation | Pulilan stock changes do not alter Plaridel stock. | NOT RUN | Store checks branch stock; database concurrency needs verification. |

## Dentist

| Scenario | Expected Result | Status | Notes |
|---|---|---|---|
| Dentist login | Dentist/associate role reaches permitted workspace only. | BLOCKED | Requires real Supabase dentist profile. |
| Assigned appointments | Dentist sees authorized appointment/patient context. | NOT RUN | Must verify direct API access to unassigned records is denied. |
| Clinical record workflow | Draft, finalize, amend, prescription, document permissions respected. | NOT RUN | No destructive delete of finalized history. |
| Treatment and performing provider | Performing provider can differ from assigned dentist and is preserved for billing/compensation. | NOT RUN | Business scenario test required. |

## Super Admin

| Scenario | Expected Result | Status | Notes |
|---|---|---|---|
| System Administration | Only Super Admin reaches `/app/system-admin`. | NOT RUN | Frontend guard exists; backend policy verification still required. |
| User invitation | Edge Function uses server-side service role and checks inviter permission. | NOT RUN | Requires deployed function/secrets. |
| Reports/export | Financial/report permissions enforced and exports match filters. | NOT RUN | Needs production-sized data and reconciliation. |
| Backup/restore dashboard | Shows unknown/not configured when status cannot be verified; no fake restore button. | PASS | Implemented as registry/evidence and restore planning only. |
| Audit log review | Human-readable audit labels display; raw event names are not primary UI. | NOT RUN | Spot checks required across pages. |

## Cross-Branch

| Scenario | Expected Result | Status | Notes |
|---|---|---|---|
| Pulilan-only staff direct access to Plaridel records | Denied server-side. | BLOCKED | Current policy coverage needs real branch-assigned accounts. |
| Multi-branch provider | Sees both authorized branches and no unauthorized branches. | BLOCKED | Needs configured provider assignments. |
| Super Admin global view | Can view cross-branch information and filters do not hide required global data. | NOT RUN | UAT required. |
