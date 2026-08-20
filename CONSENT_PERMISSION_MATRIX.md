# Consent Permission Matrix

This document describes the implemented Part 38 baseline. Clinic policy may narrow permissions further.

| Capability | Patient | Staff | Dentist / Associate Dentist | Admin | Super Admin |
| --- | --- | --- | --- | --- | --- |
| View own assigned form metadata | Own only | Operational patient context | Authorized clinical patient context | Yes | Yes |
| View full form content | Own assigned versions only | Not granted by status-only access | Authorized clinical context | Yes | Yes |
| Create/edit draft template | No | No | No | `settings.manage` | Yes |
| Publish version | No | No | No | `settings.manage` | Yes |
| Archive template | No | No | No | `settings.manage` | Yes |
| Assign published form | No | When existing patient/appointment permissions satisfy trusted assignment rule | Not automatically granted only by clinical role | Yes | Yes |
| Sign/acknowledge | Own assignment only | No impersonation | No impersonation | No impersonation | No impersonation |
| Decline | Own assignment only | No impersonation | No impersonation | No impersonation | No impersonation |
| View signature artifact | Own only | No by default | With `clinical_records.view` in authorized patient context | Yes | Yes |
| Export signed form | Patient own flow may be added | Permission/policy decision | Clinical policy decision | Management policy decision | Management policy decision |
| View audit | No | No by default | No by default | When audit permission is granted | Yes |

## Trusted-layer rules

Patient route parameters do not establish authorization. Patient ownership is resolved through `patients.auth_user_id = auth.uid()` using the existing patient ownership helper.

Published template/version administration is protected by `settings.manage` through trusted database functions. Only published versions may be assigned.

Assignment metadata can support front-desk operations, while full form content/submission access is more restrictive. Sensitive signature files use separate Storage RLS and are not made available simply because a user can view today's appointments.

## Provenance

Patient-portal submission is recorded separately from `clinic_device_patient` or `staff_assisted` source values. Staff must never upload or manufacture a patient signature and have it represented as a self-service patient signature.

## Open policy decisions

Whether staff-assisted signing is permitted, whether front desk can view full signed documents, which forms require signatures, and whether view/export actions require explicit audit logging remain clinic decisions rather than assumptions in code.
