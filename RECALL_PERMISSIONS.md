# Recall Permissions

## Patient
May read only their own patient-facing recall/follow-up data through RLS. Patient routes must not trust a patient ID by itself.

## Staff / Front Desk
Operational access is branch-scoped and depends on existing appointment/communication permissions. Staff may record contact outcomes, link an existing appointment, and update operational status when authorized. They should not receive unrelated private clinical notes.

## Dentist / Associate Dentist
Clinical access is provider-scoped when the recall is attributed to that provider and the user has the relevant clinical permission. Clinical recommendations should be changed through the clinical-record workflow, not rewritten casually from the recall queue.

## Admin / Super Admin
Management access follows existing branch/system permissions. Recall-rule management requires settings/branch-management authority.

## Sensitive actions
External messaging continues through the communications subsystem. Completing, dismissing, and linking appointments are trusted database mutations protected by RLS/helper functions. No role may fabricate sent/delivered provider status.
