# Patient Portal Permission Matrix

| Entity | Patient | Internal roles |
|---|---|---|
| Patient Profile | View/update own allowed fields | According to patient-management permissions |
| Appointment | View/create own; reschedule/cancel only when clinic policy enables trusted mutation | Existing appointment permissions |
| Medical History | Own intake/history fields only through existing workflow | Clinical permissions |
| Form Assignment | View own assigned version | Operational/clinical consent permissions |
| Signed Form | View own immutable submission | Authorized operational/clinical access |
| Treatment Plan | View/respond to own presented plans where enabled | Existing treatment-plan permissions |
| Treatment | View own patient-visible completed treatment history | Clinical permissions |
| Invoice | View own | Billing permissions |
| Payment | View own persisted payment state; initiate allowed payment flow | Payment permissions |
| Receipt | View/download own confirmed receipt where patient-visible | Billing/payment permissions |
| Document | Own explicitly patient-visible documents only | Document permissions |
| Recall | Own patient-facing recall/follow-up data | Part 39 operational/clinical permissions |
| Notification | Own notifications | Notification permissions |
| Communication Preference | View/update own allowed preferences | Communications permissions |
| Operational Task | No direct access | Part 41 task permissions |
| Audit Log | No access | Audit-log permission only |

## Security rule
Frontend route or ID filtering is never sufficient. Patient ownership must be enforced by RLS/trusted backend functions. A patient-supplied ID never grants access to another patient's resource.
