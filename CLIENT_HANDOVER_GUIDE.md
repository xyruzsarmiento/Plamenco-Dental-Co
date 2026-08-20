# Client Handover Guide

## System overview
Plamenco Dental Co. is a multi-role clinic platform for Pulilan and Plaridel operations. It includes public booking, patient self-service, front-desk operations, clinical workflows, billing, inventory, expenses, recall/follow-up, reports, management automation, and access control.

## Roles
- Super Admin: clinic-wide system administration subject to configured permissions.
- Admin: operational/management access according to permissions and branch scope.
- Dentist / Associate Dentist: provider and clinical workflows according to assigned permissions.
- Staff: front-desk/operations functions according to assigned permissions.
- Patient: own portal data only.

## Production ownership
Before launch, the clinic must confirm the production domain, approved administrators, branch assignments, provider records, service catalog, appointment rules, payment methods, communication providers, report schedules, retention rules, backup owner and incident contacts.

## Repository and deployment
Production code is maintained on the repository `main` branch. Deployment, environment variables, Supabase, provider credentials, storage and scheduler configuration are documented separately in `DEPLOYMENT_HANDOVER.md` and `PRODUCTION_CONFIGURATION_CHECKLIST.md`.

## Security
Do not place service-role keys, provider secrets, passwords or tokens in documentation, tickets or screenshots. Internal operational tasks, audit data, private clinical notes and restricted financial data must remain role-protected.

## Acceptance
Release Candidate 1 is not equivalent to clinic acceptance. Use `CLIENT_ACCEPTANCE_TEST.md`; move to `v1.0.0` only after actual testing and sign-off.
