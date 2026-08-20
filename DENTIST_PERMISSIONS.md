# Plamenco Dental Co. Dentist Permissions

This document reflects the existing frontend RBAC model and the intended Part 35 clinical boundaries. Trusted backend/RLS rules remain authoritative; hiding a button is not sufficient authorization.

## Dentist

Current default role permissions include:

- appointments.view
- appointments.view_assigned
- appointments.update_clinical_status
- appointments.start
- appointments.complete
- patients.view
- patients.view_history
- clinical_records.view
- clinical_records.create
- clinical_records.edit
- clinical_records.edit_draft
- clinical_records.finalize
- clinical_records.amend
- treatments.view
- treatments.create
- treatments.edit
- treatments.complete
- prescriptions.view
- prescriptions.create
- prescriptions.edit
- documents.view
- documents.upload
- schedule.view_own
- schedule.manage_own
- notifications.view

Dentists do not automatically receive clinic-wide expenses, cash reconciliation, staff management, provider compensation of other dentists, full financial analytics, or system administration.

## Associate Dentist

Current default role permissions include:

- appointments.view
- appointments.view_assigned
- appointments.update_clinical_status
- patients.view
- patients.view_history
- clinical_records.view
- clinical_records.create
- clinical_records.edit_draft
- clinical_records.finalize
- clinical_records.amend
- treatments.view
- treatments.create
- treatments.edit
- prescriptions.view
- prescriptions.create
- documents.view
- schedule.view_own
- notifications.view

Notably, the default Associate Dentist role does not include `appointments.start`, `appointments.complete`, `treatments.complete`, `prescriptions.edit`, `documents.upload`, or `schedule.manage_own` unless an explicit extra permission is granted.

## Admin / Super Admin

Management roles currently receive broad permissions in the frontend role matrix. Clinical access must still respect database RLS, auditability, branch rules, and the principle that management access should not rewrite clinical authorship.

## Staff

Staff may handle operational patient, appointment and payment tasks according to their role but must not be granted clinical-record authoring or private provider-note access merely because the UI can navigate to a patient.

## Patient

Patient portal permissions are own-record permissions. Patient-visible clinical content must come only from fields/documents intentionally designed for patient visibility. Internal clinical notes must not be exposed.

## Provider ownership

Part 35 Today workspace resolves the logged-in dentist to an existing provider profile and filters the operational queue to that provider. A dentist must not switch provider identity in the UI to bypass assigned clinical work.

## Branch access

Provider branch assignments determine valid clinic context. Missing historical branch/provider attribution remains `Unknown / Unmapped`; the application must not silently assign Pulilan or the current dentist.

## Backend audit requirement

The existing clinical-record migration currently contains broad authenticated policies for prescriptions/amendments. Before Part 35 is considered fully production-ready, trusted policies must be reconciled with the role/permission model so direct API calls cannot bypass the UI restrictions documented here.
