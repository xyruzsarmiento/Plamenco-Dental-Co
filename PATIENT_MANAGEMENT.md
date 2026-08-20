# Plamenco Dental Co. Patient Management

## Patient Master Record

The canonical clinic patient record is `patients`. A patient may have no portal account or one linked Supabase Auth account through `auth_user_id`. Staff-created, walk-in, elderly, and historical Excel patients remain valid patients even when `auth_user_id` is empty.

`patient_id` is the stable staff-facing patient number. It must stay unique, searchable, and unchanged after import or edit. Database UUIDs are implementation identifiers and should not replace patient numbers in clinic workflows.

## Patient 360

Patient 360 is an aggregation workspace, not a duplicate patient database. It reads existing appointments, appointment status history, clinical visits, treatments, prescriptions, invoices, payments, receipts, refunds, private documents, communication logs, branches, providers, and patient audit activity.

The current workspace tabs are:

- Overview
- Appointments
- Treatments
- Clinical Records
- Prescriptions
- Billing & Payments
- Documents
- Communications
- Activity

The sticky header keeps patient identity visible while switching tabs and shows patient number, returning/new context, age, contact, preferred branch, portal link state, next appointment, last visit, outstanding balance, and recent dentist.

## Demographics And Contact

Supported fields come from the existing patient schema: name, date of birth, sex, phone, email, address, city, province, emergency contact, emergency relationship, preferred branch, origin, status, profile image, medical notes, and administrative notes. Age is calculated dynamically from date of birth.

Email is optional for walk-in and staff-created patients. Phone and email are normalized for search and duplicate checks where supported.

## Clinical And Treatment History

Clinical visits are listed chronologically using `dental_records`. Treatments use `treatments` and preserve historical `price_snapshot_cents`, so old treatment prices do not change if the current service price changes. Provider attribution preserves appointment dentist, clinical visit provider, and performing dentist fields where they differ.

The odontogram/dental chart remains intentionally removed. Optional tooth or area references are displayed textually when present.

## Billing

Patient 360 reuses the billing store definitions for invoices, payments, receipts, refunds, ledger, and outstanding balance. It does not create a separate patient balance formula.

The billing tab shows total billed, paid, refunds, outstanding balance, invoice rows, ledger rows, and recent payments.

## Documents

Patient documents remain private and are read from the existing document store. Rows show filename, category/kind, upload date, uploader, and related visit or treatment when present. Upload and deletion permissions should follow the existing document policies.

## Communications

The communication tab uses centralized communication preferences and delivery logs. Delivery status reflects the provider state recorded by the communication system; Patient 360 must not claim delivery unless the provider recorded it.

## Activity Timeline

Patient activity is an operational timeline, not a raw security audit feed. It translates existing events into clinic-facing labels such as Patient information updated, Appointment confirmed, Treatment recorded, Invoice created, Payment recorded, Receipt generated, Document uploaded, and Communication sent or failed.

## Historical Imports

Historical Excel records appear as normal patient records with subtle provenance. Import batch, source row, and original imported name are shown only where useful and should not make imported records look invalid.

## Duplicate Management

Duplicate detection is advisory. Signals include patient number, phone, email, name plus date of birth, and name plus phone. Matches are potential duplicates only.

Patient merge is high-risk and is not automatic. A safe merge workflow must preview primary patient, duplicate patient, and related records to move before any change. If both records have portal accounts, authentication identities must be flagged for manual review.

## Permissions And RLS

Frontend visibility follows existing role permissions. Supabase RLS remains the security boundary for direct API/database access. Patient portal users may only access their linked patient and safe related records. Internal notes, audit logs, staff-only notes, unrelated staff actions, other patients, provider performance, and clinic analytics must not appear in the patient portal.

## Archive Behavior

Patients with appointments, clinical records, invoices, payments, treatments, or documents should generally be inactivated rather than hard-deleted. Destructive deletion must remain restricted and auditable.

## Query Support

`supabase/migrations/20260818_016_patient_360_query_support.sql` adds patient-centric indexes for patient number, auth linkage, normalized search helpers, appointment history, billing history, documents, communications, and optional audit-log lookup.
