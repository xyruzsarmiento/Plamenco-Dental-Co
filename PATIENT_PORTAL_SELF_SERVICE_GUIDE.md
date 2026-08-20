# Patient Portal Self-Service Guide

## Source-of-truth rule
The portal is a view into existing clinic systems. Appointments, forms, treatment plans, completed treatments, invoices/payments, documents, notifications, and recall records remain authoritative in their existing modules. Do not create patient-portal duplicate tables.

## Identity and ownership
Patient data must be resolved from the authenticated user. A `/portal/:patientId` value is compatibility/navigation context only and never grants ownership. RLS/backend ownership remains the security boundary.

## Dashboard
Prioritize the next appointment, required forms, real outstanding invoice balance, treatment-plan decisions, recall/follow-up reminders, and recent notifications. Query failure must not be displayed as an empty state.

## Appointments
Reuse the existing provider schedule, branch assignment, closure, override, and conflict engine. Patient reschedule/cancel stays disabled unless the clinic policy is explicitly configured. A cancellation does not complete a recall, treatment-plan scheduling item, or operational task.

## Forms & Consent
Always render the exact assigned version. Signed submissions use their immutable content snapshot. Drawn signatures remain private and must never be exposed through permanent public URLs.

## Treatment Plans
Estimates are not invoices, payments, revenue, or receivables. Patient decisions reuse the existing Part 37 workflow. Accepted treatment is scheduled through the existing appointment engine and is not automatically booked.

## Treatments
Patient history shows actual completed/performed treatment only. Internal clinical notes remain internal.

## Billing & Payments
Outstanding balance comes from the billing source of truth. A frontend payment redirect is not proof of payment; trusted backend/provider verification remains authoritative. Receipts are shown only for confirmed persisted payments.

## Documents
Only explicitly patient-visible records may appear. Sensitive files use authenticated, ownership-checked, short-lived access.

## Recall & Follow-Up
Use neutral wording and Part 39 records. Booking from a recall creates/links a real appointment but does not mark the recall completed by itself.

## Profile & Preferences
Patient updates use existing patient/auth flows. Authentication email changes must go through Supabase Auth rather than only editing the patient table. Communication preferences reuse the existing communications architecture.

## Mobile and offline
Primary patient widths are 360, 390, and 430 px. The PWA caches only public/static shell resources. Patient API responses, auth tokens, signed URLs, payment callbacks, forms, and other private resources must not be broadly cached. Payments, signatures, treatment-plan decisions, medical-history writes, and appointment mutations require an active connection.
