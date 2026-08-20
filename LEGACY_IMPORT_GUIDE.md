# Legacy Patient Import V2

Part 26 keeps legacy migration controlled and reviewable.

## Import Flow

Upload workbook -> choose sheet -> analyze columns -> map fields -> validate -> dry run -> review duplicates/errors -> confirm import -> review batch report.

The importer accepts `.xlsx` and `.csv`. Legacy `.xls` files must be saved as `.xlsx` or exported as CSV before import.

## Auth Safety

Legacy imports create patient records only. They do not create Supabase Auth users, fake passwords, or random `auth_user_id` values.

Imported patients can later claim or link a portal account through a separate verified workflow. Matching must not rely on name alone.

## Patient Number Preservation

If the spreadsheet contains a patient number and it does not collide with an existing patient number, the importer preserves it as `patients.patient_id`.

If the number already exists, the row is blocked for review.

## Historical Data

Legacy clinical, appointment, treatment, payment, balance, and notes columns are preserved in import row staging metadata. They are not blindly converted into clinical, appointment, or billing records until the clinic approves explicit mapping rules.

## Rollback

Rollback removes only patient records created by the selected import batch. It is blocked if any imported patient now has appointments, treatments, or invoices.
