# Role Access Test Matrix

Legend: Allow, Deny, Conditional, Not Tested. This matrix documents intended access; live RLS tests remain required.

| Area | Super Admin | Admin | Dentist | Associate Dentist | Staff | Patient |
|---|---|---|---|---|---|---|
| System Administration | Allow | Deny | Deny | Deny | Deny | Deny |
| Appointments | Allow | Allow | Conditional | Conditional | Allow | Own only |
| Patients | Allow | Allow | Conditional | Conditional | Allow | Own only |
| Clinical Records | Allow | Allow | Authorized context | Authorized context | Deny/Conditional | Own patient-visible only |
| Treatments | Allow | Allow | Authorized context | Authorized context | Deny | Own patient-visible only |
| Treatment Plans | Allow | Allow | Authorized context | Authorized context | Deny/Conditional | Own presented plans only |
| Billing/Payments | Allow | Allow | Deny/Conditional | Deny | Conditional | Own only |
| Inventory | Allow | Allow | Deny | Deny | Conditional | Deny |
| Expenses | Allow | Allow | Deny | Deny | Conditional | Deny |
| Reports | Allow | Allow | Conditional | Conditional | Limited | Deny |
| Forms & Consent Admin | Allow | Conditional | Deny | Deny | Deny | Deny |
| Assigned Consent | Allow | Allow | Authorized clinical context | Authorized clinical context | Status-only/Conditional | Own only |
| Recall & Follow-Up | Allow | Allow | Authorized provider context | Authorized provider context | Authorized operational context | Own patient-facing only |
| Communications | Allow | Allow | Conditional | Conditional | Conditional | Own preferences/history only |
| Audit Logs | Allow | Conditional | Deny | Deny | Deny | Deny |

## Mandatory live tests
For every Conditional or Own-only cell, test both a permitted and denied direct Supabase request. Hidden navigation is not evidence of access control.
