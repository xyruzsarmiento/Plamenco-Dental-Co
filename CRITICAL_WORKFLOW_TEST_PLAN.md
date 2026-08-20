# Critical Workflow Test Plan

Each workflow must record environment, actor/role, test data IDs, expected result, actual result, and evidence. Do not mark Passed without evidence.

## 1. Patient registration
Register -> authenticate -> patient link -> intake -> medical history -> forms -> appointment -> confirmation.

## 2. Front desk visit
Arrive -> check in -> waiting -> start visit -> complete -> billing handoff -> checkout.

## 3. Dentist clinical workflow
Today schedule -> patient -> medical history -> draft clinical record -> performed treatment -> finalize -> follow-up -> front desk.

## 4. Treatment plan
Create -> present -> patient decision -> schedule accepted item -> perform -> bill. Acceptance alone must not create payment/receivable.

## 5. Billing
Performed treatment -> charge -> invoice -> partial/full payment -> receipt -> valid refund.

## 6. Consent
Draft -> publish -> assign -> sign -> immutable exact snapshot -> authorized view -> old version preserved after new version.

## 7. Inventory
Receive -> balance -> ledger -> transfer -> consumption -> count/adjust -> reconciliation.

## 8. Recall
Explicit source/date -> due queue -> contact -> provider-backed result -> appointment -> explicit completion.

## 9. Payment webhook
Verified provider event -> idempotency ledger -> payment posting -> allocation -> replay ignored/rejected safely.

## 10. Privacy
Patient cross-access denied; staff cross-branch denied; provider unrelated-clinical access denied.

Current evidence status: **NOT VERIFIED end to end** in this connector-only pass.
