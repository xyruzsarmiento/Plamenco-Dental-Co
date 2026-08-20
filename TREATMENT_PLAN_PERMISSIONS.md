# Treatment Plan Permissions

This document records the intended Part 37 permission boundaries. Existing RBAC and row-level policies remain authoritative.

## Patient

Patients may view only their own treatment plans and may respond only to their own currently presented, active plan. Patients do not edit internal notes, prices, provider assignment, or staff-side scheduling controls. If the clinic requires a signature, reuse the Part 36 form and consent workflow.

## Staff

Operational access may include plan status, accepted items, scheduling status, estimate totals, and patient-facing notes when the staff role has the relevant permissions. Internal clinical notes and pricing changes are not automatically granted.

## Dentist

Dentists with treatment permissions may view authorized patient plans, create and edit drafts, present plans, and follow accepted, scheduled, and completed items. Provider and branch access restrictions remain applicable.

## Associate Dentist

Associate Dentist access follows the existing treatment and clinical permissions. Editing another provider's accepted plan, changing prices, or replacing a presented plan requires explicit authority.

## Admin and Super Admin

Management roles may have broader treatment and billing permissions according to configured RBAC. Those permissions do not change the financial meaning of an estimate and do not alter patient ownership requirements.

## Sensitive actions

The following require trusted authorization in addition to frontend controls: create or edit plan, present plan, change quoted price, apply discount, replace a presented plan, alter accepted items, schedule accepted items, view internal clinical notes, and export private estimates.

## Row-level access

Patients are limited to their own plans through patient ownership. Internal users require actual treatment or patient permissions. An authenticated session by itself is not sufficient access to private treatment plans.
