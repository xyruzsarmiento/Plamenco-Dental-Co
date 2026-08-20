# Plamenco Dental Co. Patient Data Visibility

Patients should see their own care journey, not the clinic's internal operating system.

| Data Area | Patient Visible | Internal Only |
|---|---|---|
| Basic profile | Name, phone, email, address, emergency contact, profile image. | Internal duplicate-review notes, staff-only administrative notes. |
| Appointments | Own appointment date, time, branch, service, dentist, patient-friendly status, patient notes. | Internal notes, staff assignment notes, audit trail, conflict diagnostics. |
| Treatments | Treatment name/description, date, tooth number where appropriate, patient-safe fee snapshot. | Internal clinical deliberation, private provider notes, void/reversal internals. |
| Dental records | Patient-visible summary, recommendations, follow-up date/notes when approved. | Raw internal clinical notes, audit logs, amendments not approved for display. |
| Prescriptions | Medication, dosage, frequency, duration, instructions, prescribing provider, date. | Internal prescribing workflow metadata. |
| Invoices | Own invoice number, date, status, balance, visible line items. | Staff discount approvals, internal void reasons unless approved for patient copy. |
| Payments | Own payments, method label, date, amount, confirmation state. | Gateway secrets, webhook payloads, internal verification notes. |
| Receipts | Receipt number, date, amount, remaining balance, payment acknowledgement. | Internal reconciliation notes and cashier session details. |
| Documents | Documents explicitly attached/shared to the patient record. | Private storage paths, documents not approved for patient visibility. |
| Notifications | Patient-relevant appointment, payment, and follow-up notifications. | Communication retry logs, provider error payloads, worker diagnostics. |
| Staff/clinic operations | Branch contact/location and assigned dentist name where appropriate. | Inventory, expenses, compensation, reports, staff schedules, RLS/audit internals. |

## Security Requirement

Frontend route guards are not enough. Supabase RLS must prove Patient A cannot access Patient B appointments, records, invoices, payments, receipts, documents, or notifications by direct API or manipulated URL.
