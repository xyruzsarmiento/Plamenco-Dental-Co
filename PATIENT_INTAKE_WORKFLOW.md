# Patient Intake Workflow

## New patient

1. Appointment exists through the existing appointment system.
2. Patient opens `/portal/:patientId/intake` under patient authentication.
3. Backend resolves the authenticated patient's canonical patient record; the route ID is not trusted as ownership proof.
4. Patient reviews demographics/emergency contact already stored on the patient record.
5. Patient submits current medical history. Each submission creates a `medical_history_revisions` row before updating the current patient medical fields.
6. Assigned form versions are loaded only through RLS-authorized patient assignments.
7. Completed form submissions preserve the exact template-version content snapshot.
8. Intake can be submitted only after the current medical history is confirmed, emergency contact is present, and assigned forms no longer remain pending.

## Returning patient

Returning patients do not recreate the entire registration record. Existing data is displayed, medical history may be reconfirmed or revised, and only currently assigned forms are presented. Historical revisions and signed submissions are preserved.

## Front desk review

Front desk integration should consume intake summary/status rather than loading every signed form in the schedule view. Staff may correct administrative patient data only under existing RBAC. Medical answers retain provenance and must not silently become staff-authored clinical statements.

## Dentist review

The dentist workspace should consume latest medical-history and consent status for an authorized patient. `No allergies recorded` is distinct from an explicit `confirmed_no_allergies` revision. Intake completion is administrative readiness only; it is not medical clearance.

## Historical imports

Historical patients without documented intake or consent remain without recorded consent. Import execution timestamps are never treated as historical medical-history confirmation or consent dates.
