# Patient Intake Permissions

Part 36 relies on trusted database authorization. Hiding UI controls is never sufficient.

| Capability | Patient | Staff | Dentist / Associate | Admin / Super Admin |
|---|---|---|---|---|
| View own intake | Own record only | When `patients.view` permits | When `clinical_records.view` or patient access permits | According to management permissions |
| Edit demographics | Own patient profile under existing patient RLS | Only existing patient-edit permission | Not automatically | Existing patient management permission |
| Submit medical history | Own record | Not automatically | Not through patient submission flow | Not through patient submission flow |
| View medical history | Own record | Only authorized patient context | Authorized clinical context | Authorized management/clinical context |
| Assign consent forms | No | Requires patient/appointment management permission | Not automatically | Appropriate management permission |
| Sign/decline assigned form | Own assigned forms | No | No | No |
| Manage form templates/versions | No | No by default | No by default | `settings.manage` |
| View signed submission | Own record | Authorized operational context | Authorized clinical context | Authorized management context |
| Modify signed submission | No | No | No | No direct update; use future clinic-approved amendment/void workflow |

## Patient ownership

`current_user_owns_patient(patient_id)` verifies `patients.auth_user_id = auth.uid()` and accepts either canonical row UUID text or patient number. Route parameters are not authorization.

## RLS helpers

- `can_view_patient_intake(patient_id)` permits patient ownership or explicit `patients.view` / `clinical_records.view` permission.
- `can_manage_patient_intake(patient_id)` permits patient ownership or explicit edit permission.

These helpers are used by intake/history/form policies instead of `auth.role() = 'authenticated'` blanket access.

## Signed submissions

The patient submission table has SELECT and INSERT policies but intentionally no patient UPDATE/DELETE policy. Unique assignment submission prevents repeated clicks from creating duplicate signed records.

## Template visibility

Patients cannot browse the form-template catalog. They can read template/version data only when an RLS-authorized assignment connects that version to their patient record.
