# Task Permission Matrix

Task access is internal-only. Patient-facing reminders remain in the Patient Portal, forms, notifications, recalls, and other source modules.

| Action | Patient | Staff | Dentist | Associate Dentist | Admin | Super Admin |
|---|---|---|---|---|---|---|
| View own internal tasks | Deny | Conditional | Conditional | Conditional | Allow | Allow |
| View branch tasks | Deny | Conditional by branch | Conditional by provider/branch | Conditional by provider/branch | Allow | Allow |
| View all tasks | Deny | Deny unless explicitly granted | Deny unless explicitly granted | Deny unless explicitly granted | Allow | Allow |
| Create manual task | Deny | Pending clinic decision / explicit permission | Pending clinic decision / explicit permission | Pending clinic decision / explicit permission | Allow | Allow |
| Claim task | Deny | Conditional / explicit permission | Conditional / explicit permission | Conditional / explicit permission | Allow | Allow |
| Assign / reassign | Deny | Pending clinic decision / explicit permission | Usually deny unless explicitly granted | Usually deny unless explicitly granted | Allow | Allow |
| Update status | Deny | Conditional on authorized task | Conditional on authorized provider task | Conditional on authorized provider task | Allow | Allow |
| Complete | Deny | Conditional on source resolution | Conditional on source resolution | Conditional on source resolution | Allow | Allow |
| Cancel | Deny | Pending clinic decision | Pending clinic decision | Pending clinic decision | Allow | Allow |
| Reopen | Deny | Pending clinic decision | Pending clinic decision | Pending clinic decision | Allow | Allow |
| Manage automation rules | Deny | Deny | Deny | Deny | Conditional / clinic policy | Allow |
| View internal notes | Deny | Conditional on authorized task | Conditional on authorized task | Conditional on authorized task | Allow | Allow |

RLS is authoritative. Frontend navigation and hidden buttons are convenience controls only. Patient role has no direct read policy on operational task tables.
