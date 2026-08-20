# Front Desk Permissions

This document maps Part 34 front-desk actions to the existing RBAC keys. It does not grant new permissions. Actual authorization remains enforced by the application data layer and Supabase/RLS policies.

| Front-desk capability | Existing permission | Staff default | Notes |
|---|---|---:|---|
| View appointments | `appointments.view` | Yes | Must still respect branch/RLS scope. |
| Create appointment / walk-in appointment | `appointments.create` | Yes | Reuse existing appointment model and conflict validation. |
| Approve appointment | `appointments.approve` | Yes | Approval is distinct from patient confirmation/delivery status. |
| Reject appointment | `appointments.reject` | Yes | Reason/audit should be preserved. |
| Reschedule | `appointments.reschedule` | Yes | Must revalidate availability and conflicts. |
| Cancel appointment | `appointments.cancel` | No | Do not expose to default Staff until clinic policy grants it. |
| Assign/change dentist | `appointments.assign_dentist` | No | Do not silently grant for receptionist convenience. |
| Check patient in | `appointments.check_in` | Yes | Sets actual arrival/check-in state through existing transition logic. |
| Start clinical visit | `appointments.start` / clinical permissions | No | Default Staff should hand off to dentist/authorized clinical user. |
| Complete clinical visit | `appointments.complete` / clinical permissions | No | Front desk must not finalize clinical work. |
| Mark no-show | `appointments.mark_no_show` | Yes | Explicit action; lateness alone is insufficient. |
| View patients | `patients.view` | Yes | Quick search must return only authorized records. |
| Create patient | `patients.create` | Yes | Search for duplicates first; portal account is not required for walk-ins. |
| Edit basic patient details | `patients.edit_basic` | Yes | Must not expose protected clinical-note editing. |
| View patient history | `patients.view_history` | No by default | If absent, front desk quick view must limit history to operational data already permitted by other modules. |
| View billing | `billing.view` | No by default | Staff may still see specifically authorized balance/payment surfaces only where backend policy supports it. Do not widen access in React. |
| Create invoice | `billing.create` | No by default | Clinical/billing handoff should not automatically grant this permission. |
| View payments | `payments.view` | Yes | Branch/RLS scope applies. |
| Record manual payment | `payments.record_manual` | Yes | Use existing payment methods and idempotency/invoice logic. |
| Verify/confirm payment | `payments.verify` / `payments.confirm` | No by default | Keep separate from recording a manual payment. |
| Refund payment | `payments.refund` | No by default | Sensitive financial action. |
| Issue/view receipt | Derived from payment/billing authorization | Conditional | Only after trusted payment state supports receipt issuance. |
| View inventory | `inventory.view` | Yes | Branch scope applies. |
| Stock in/out | `inventory.stock_in`, `inventory.stock_out` | Yes | Reuse ledger architecture. |
| View expenses | `expenses.view` | Yes | Branch scope applies. |
| Create expense | `expenses.create` | Yes | Do not expose management-only financial analytics. |
| Send notifications | `notifications.send` | Yes | This is not equivalent to unrestricted provider messaging. |
| Manage patient communications | `communications.manage` | No by default | Manual SMS/email/Messenger actions must remain hidden unless explicitly granted/configured. |
| Access other branch operations | Branch assignment/RLS + role | No by default | Super Admin/Admin may have broader scope according to actual policy. |

## Quick-view privacy rule

Patient search and quick views must never fetch clinic-wide sensitive records and then hide unauthorized rows in React. Queries and related-record lookups must be scoped by the logged-in user's role/branch authorization at the trusted data layer. Basic front-desk information does not imply access to private dentist notes, diagnosis, prescriptions, provider compensation, or unrestricted financial history.

## Current unresolved permission decisions

The clinic still needs to decide whether receptionists may cancel appointments, change the assigned dentist after check-in, apply discounts, view broader patient history, send manual SMS/Messenger messages, and temporarily access another branch. Until those decisions are made, preserve the current least-privilege defaults.
