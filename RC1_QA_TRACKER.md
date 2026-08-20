# Plamenco Dental Co. — RC1 QA Tracker

Release candidate: `1.0.0-rc.1`

Part 45 is the final numbered QA/release phase. This tracker records defects found during manual testing and their retest state. Do not mark a bug Production Verified unless it has been retested against the deployed environment.

## Bug report template

- Bug ID:
- Page / Module:
- Role:
- Branch:
- Severity: Critical / High / Medium / Low
- Steps to reproduce:
- Expected result:
- Actual result:
- Error message:
- Screenshot / evidence:
- Root cause:
- Fix commit:
- Migration required: Yes / No
- Regression areas:
- Retest result: Not Retested / Pass / Fail
- Production verification: Not Verified / Verified

## Open defects

No defects have been recorded yet. Add issues here only after they are reproduced or reported during RC testing.

| Bug ID | Module | Severity | Summary | Status | Fix Commit | Retest |
|---|---|---|---|---|---|---|

## Required RC1 regression areas

- Authentication and account switching
- Role and RLS enforcement
- Cross-patient and cross-branch denial
- Appointment lifecycle and slot concurrency
- Front Desk operations
- Patient Portal
- Intake and medical history
- Forms and consent immutability
- Clinical draft/finalize/amend
- Treatment plans and historical price integrity
- Billing, payments, webhooks and refunds
- Financial reconciliation
- Inventory ledger reconciliation
- Expenses
- Recall / Follow-Up
- Operational Tasks
- Communications delivery truth
- Reports and management automation
- Private storage
- Mobile 360 / 390 / 430
- Desktop 1280 / 1440 / 1920
- PWA / offline behavior
- Accessibility
- Production configuration and migrations

## Release gate

`v1.0.0` remains blocked until all Critical defects are resolved, required High defects are resolved or explicitly accepted, the build is verified, production configuration is verified, core acceptance workflows pass, and real client sign-off is recorded.
