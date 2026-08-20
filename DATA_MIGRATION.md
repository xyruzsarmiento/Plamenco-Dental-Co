# Plamenco Dental Co. Data Migration

This project now has a production-grade migration workspace for inspecting and importing historical clinic data without assuming the client's final Excel format.

## Supported Formats

- `.xlsx`
- `.csv`

Legacy `.xls` files should be saved as `.xlsx` or exported to CSV before upload. Clinic workbooks can contain patient data and must not be committed to Git.

## Import Workflow

1. Upload a workbook.
2. Inspect detected sheets and row counts.
3. Select the sheet to migrate.
4. Review suggested column mappings.
5. Validate rows.
6. Resolve duplicates and possible matches.
7. Run the dry-run summary.
8. Confirm import.
9. Review import history and reconciliation.
10. Roll back only when imported records have no dependent operational activity.

## Patient Mapping

Patient import maps source columns into the existing patient model. Historical patients are normal `patients` records with `origin = historical_import`; they do not automatically receive Supabase Auth accounts.

Supported patient fields include patient number, full name, first/middle/last name, date of birth, sex, phone, email, address, city, province, emergency contact details, preferred branch, historical last visit, dentist, procedure, balance, and notes.

## Duplicate Rules

Duplicate detection uses multiple signals:

- Existing patient number
- Email
- Phone
- First name + last name + date of birth
- First name + last name + phone
- Full name + date of birth
- Duplicate rows inside the uploaded workbook

Matches are classified as exact, likely, possible, or no match. Possible matches are not merged automatically.

## Branch Mapping

Branch values are compared against existing branch IDs, codes, names, and cities. Unknown branches are flagged for review and are not defaulted to Pulilan or Plaridel.

## Provider And Service Mapping

Historical dentist and treatment/service labels are checked against existing providers and services. Unknown values are preserved as historical text and flagged for confirmation instead of being forced into an unrelated current provider or service.

## Historical Dates

The importer handles ISO dates, unambiguous slash dates, and Excel serial dates. Ambiguous values such as `04/05/1990` are flagged instead of guessed.

## Rollback Rules

Rollback removes only patient records created by the selected import batch. Rollback is blocked when those patients already have dependent appointments, treatments, or billing activity.

## Permissions

The workspace is protected by `patients.import`. Super Admin can manage it through the normal permission model; ordinary staff should not receive migration access unless explicitly authorized.

## Privacy

Do not upload real client workbooks to public storage, `public/`, `assets/`, or Git. Error and result exports include only rows from the current migration preview and protect CSV values that could be interpreted as spreadsheet formulas.

## Future Import Types

The workspace is structured for future appointment, treatment, payment, and inventory migration, but only patient import is executable until the real workbook structure is inspected and mappings are approved.

## Real Client Workbook Procedure

When the real Excel file is available, first inspect sheet names, headers, row counts, sample value formats, duplicate patterns, date formats, phone formats, branch labels, provider labels, service labels, and financial completeness. Do not finalize mappings until that review is complete.
