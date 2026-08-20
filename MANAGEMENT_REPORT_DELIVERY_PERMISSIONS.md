# Management Report Delivery Permissions

This matrix describes the Part 43 foundation. Existing RBAC remains authoritative.

| Role | View Schedules/Runs | Manage Schedules | View Financial Reports | Branch Scope | Receive Scheduled Financial Reports |
|---|---|---|---|---|---|
| Patient | Deny | Deny | Deny | None | Deny |
| Staff | Conditional on report permissions | Deny by default | Deny unless explicitly granted | Assigned/authorized branch | Deny unless explicitly authorized |
| Dentist | Conditional for authorized operational/provider reporting | Deny by default | Deny by default | Authorized provider/branch context | Only explicitly configured non-financial scope |
| Associate Dentist | Conditional for authorized operational/provider reporting | Deny by default | Deny by default | Authorized provider/branch context | Only explicitly configured non-financial scope |
| Admin | Allow according to existing report permissions | Allow through management authorization | Allow when `reports.view_financial` applies | Authorized/management scope | Conditional on configured recipient authorization |
| Super Admin | Allow | Allow | Allow | Clinic-wide | Conditional on configured recipient authorization |

## Actions

- View Schedule / View Runs: requires internal profile plus existing report permissions and branch scope.
- Create / Edit / Enable / Disable: restricted to management authorization in the current foundation.
- Download Report: must also respect report/file privacy and the existing export permissions.
- Resend / Regenerate: should be management-only and produce new historical attempts rather than overwrite history.
- Manage Recipients: management-only; user-linked recipient authorization must be revalidated before each send.

Frontend navigation is not a security boundary. RLS and trusted server-side operations must enforce the same restrictions.
