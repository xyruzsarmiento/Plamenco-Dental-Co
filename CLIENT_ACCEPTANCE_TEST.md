# Client Acceptance Test

Release candidate: `1.0.0-rc.1`

Do not pre-mark any test as passed. Record Actual Result, Pass/Fail, Notes, tester and date after execution.

| Test | Expected Result | Actual Result | Pass / Fail | Notes |
|---|---|---|---|---|
| Patient registration → appointment → intake → form → check-in → dentist visit → treatment → billing → payment → recall | Each source workflow persists real state without cross-module fabrication |  |  |  |
| Treatment plan → patient decision → scheduling → treatment → billing | Acceptance remains separate from appointment, completion and payment |  |  |  |
| Inventory receiving → stock movement → usage/adjustment → reconciliation | Ledger and branch stock remain consistent |  |  |  |
| Expense → approval → payment → report | Expense lifecycle and reporting reflect persisted records |  |  |  |
| Management report schedule → run → generation → delivery | Delivery status reflects actual worker/provider evidence only |  |  |  |
| Patient A attempts Patient B resource access | Access denied |  |  |  |
| Staff attempts Super Admin route | Access denied |  |  |  |
| Private document accessed anonymously | Access denied |  |  |  |
| Payment/provider retry | No duplicate financial posting |  |  |  |
| Appointment race for same slot | Conflict protection prevents double booking |  |  |  |
| Signed form history | Signed snapshot remains immutable |  |  |  |
| Finalized clinical record edit | Amendment workflow required |  |  |  |
| 390px patient portal | Core flows remain usable without horizontal overflow |  |  |  |
| 1440px internal portal | Uses desktop width professionally |  |  |  |

## Sign-off
Status: Not signed off.

Choose only after actual review:
- System Accepted
- Accepted With Minor Issues
- Rejected / Requires Fixes

Clinic approver: ____________________
Date: ____________________
Notes: ____________________
