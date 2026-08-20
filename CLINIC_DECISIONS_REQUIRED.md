# Plamenco Dental Co. Clinic Decisions Required

Do not guess these values. Record the clinic owner's decision, date, and approver before production launch.

| Area | Decision Needed | Current Status |
|---|---|---|
| Branches | Confirm Pulilan and Plaridel legal names, addresses, contact numbers, emails, operating hours, and holiday rules. | Pending clinic confirmation |
| Appointment Rules | Lead time, maximum advance booking, cancellation cutoff, reschedule cutoff, walk-in handling, no-show policy. | Pending clinic confirmation |
| Deposits | Whether deposits are required, which services require them, and refund treatment. | Pending clinic confirmation |
| Payments | Accepted manual methods, online gateway provider, who can approve/reject proof, discount permissions, refund permissions. | Pending clinic confirmation |
| Services | Final production service list, durations, categories, online-bookable flags, and prices. | Pending clinic confirmation |
| Providers | Dentist and associate dentist names, specialties, branch assignments, schedules, and visibility on public booking. | Pending clinic confirmation |
| Staff | Actual staff accounts, branch access, roles, and least-privilege permissions. | Pending clinic confirmation |
| Staff Attendance | Late grace period, absent/leave approval rules, attendance correction permissions, and branch timekeeping owner. | Pending clinic confirmation |
| Dentist Compensation | Commission percentage or fixed professional-fee rules per dentist/service/branch, payout approval flow, and payout schedule. | Pending clinic/accountant confirmation |
| Inventory | Opening stock per branch, reorder levels, unit costs, deduction method, transfer approval process. | Pending clinic confirmation |
| Expenses | Expense categories, approval rules, recurring costs, receipt attachment rules. | Pending clinic confirmation |
| Communications | Email/SMS/Messenger provider choices, sender names, reminder timing, templates, opt-out handling. | Pending clinic confirmation |
| Communications Consent | Final SMS/email/Messenger consent language, opt-out workflow, and who may override patient preferences. | Pending clinic/legal confirmation |
| Messenger Policy | Meta Page, webhook ownership, PSID collection flow, and allowed message tags for appointment/payment updates. | Pending clinic/Meta configuration |
| Reports | Who can view financial reports, who can export PDF/Excel, first-day reconciliation owner. | Pending clinic confirmation |
| Historical Data | Whether to migrate patients only or include appointments, treatments, balances, payments, inventory. | Pending clinic confirmation |
| Legacy Spreadsheet Format | Final column names, date format, patient-number format, branch labels, and whether source files contain multiple sheets. | Pending clinic confirmation |
| Legacy Account Claiming | Required proof for linking imported patient records to future portal accounts; do not match by name alone. | Pending clinic/security confirmation |
| Legacy Clinical/Financial Staging | Which historical clinical, appointment, treatment, balance, and payment columns may be imported into live modules after review. | Pending clinic/legal/accountant confirmation |
| Retention | Audit log, clinical, financial, document, and import-file retention policy. | Pending client/legal/accounting confirmation |
| Patient Demographics | Which fields are mandatory for walk-ins, online registrations, and historical records. | Pending clinic confirmation |
| Emergency Contacts | Whether emergency contact name, relationship, and phone are required for every patient. | Pending clinic confirmation |
| Medical History | Required medical/dental fields and who may edit them after a clinical visit is finalized. | Pending clinic confirmation |
| Clinical Visibility | Whether staff can view all clinical notes and whether patients can see clinical notes in the portal. | Pending clinic confirmation |
| Patient Documents | Which document categories can be shared with patients and who can delete/archive documents. | Pending clinic confirmation |
| Patient Archive | Who may inactivate/archive patients and what retention period applies to inactive patients. | Pending clinic/legal confirmation |
| Duplicate Merge | Who may merge duplicates, required approval, merge audit wording, and collision handling when both records have portal accounts. | Pending clinic confirmation |
| Portal Linking | How existing walk-in or historical patients may safely claim/link portal accounts without email-only matching. | Pending clinic/security confirmation |
| Patient Export | Which patient fields appear in Excel/PDF exports and which roles may export sensitive history. | Pending clinic confirmation |
| Preferred Provider | Whether patients should have a preferred dentist separate from historical performing dentists. | Pending clinic confirmation |
| Inventory Unit Conversion | Whether pack/base-unit conversion is required, such as 1 box = 100 pieces. | Pending clinic confirmation |
| Inventory Expiry | Default expiring-soon thresholds by item category and whether FEFO should be enforced or only suggested. | Pending clinic confirmation |
| Inventory Consumption | Whether completed treatments should auto-deduct configured materials or remain manual clinic consumption. | Pending clinic confirmation |
| Procurement Flow | Whether purchase requests are required before purchase orders, or whether authorized staff can create POs directly. | Pending clinic confirmation |
| Supplier Invoice Rule | Whether expense recognition happens on goods receipt, supplier invoice, or payment, and who reconciles it. | Pending clinic/accountant confirmation |
| Petty Cash | Branch petty-cash float limits, allowed categories, receipt requirements, and approval threshold. | Pending clinic/accountant confirmation |
| Cashier Closing | Who opens/closes each branch cash drawer, variance tolerance, and required variance explanation workflow. | Pending clinic confirmation |
| Stock Transfers | Whether branch transfers require approval before dispatch and who can receive transferred stock. | Pending clinic confirmation |
| Stock Counts | How often each branch performs physical counts and who may approve reconciliation adjustments. | Pending clinic confirmation |
| Backup Owner | Who is accountable for confirming Supabase database backups, storage backups, and pre-migration recovery points. | Pending clinic/infrastructure confirmation |
| Backup Retention | How long database backups, storage backups, configuration snapshots, and import files must be retained. | Pending clinic/legal/accounting confirmation |
| Recovery Point Objective | Maximum acceptable data loss window during an outage or restore scenario. | Pending clinic owner decision |
| Recovery Time Objective | Maximum acceptable downtime before restored clinic operations must be available. | Pending clinic owner decision |
| Restore Approval | Who can approve production restore, whether test-environment restore rehearsal is mandatory, and how post-backup records are reconciled. | Pending clinic/infrastructure confirmation |
| Provider Health Checks | Whether SMS, email, Messenger, and payment providers have dashboard/API health checks available without sending live patient messages. | Pending provider configuration |
| Production Domain | Final production domain and whether the canonical host is apex or `www`. | Pending clinic owner decision |
| Staging Domain | Whether staging uses a dedicated subdomain, separate Vercel project URL, or protected preview URL. | Pending clinic/infrastructure decision |
| Supabase Projects | Approval for separate development, staging, and production Supabase projects. | Pending clinic/infrastructure decision |
| Vercel Ownership | Vercel team/project owner, production branch, preview access policy, and rollback operator. | Pending clinic/infrastructure decision |
| Production Release Approver | Named person authorized to approve production release and emergency rollback. | Pending clinic owner decision |
| Launch Date | Target launch date and maintenance window for first production migration. | Pending clinic owner decision |
| Error Monitoring | Whether to use Sentry or another monitoring provider, and who receives alerts. | Pending clinic/infrastructure decision |
| Integration Launch Scope | Whether online payments, SMS, email, and Messenger launch on day one or remain disabled until later approval. | Pending clinic owner/provider decision |
| Daily Operating Hours | Actual opening, closing, lunch break, and holiday rules for Pulilan and Plaridel. | Pending clinic owner decision |
| Walk-In Queue Rule | Whether walk-ins join the same queue as scheduled patients, wait by arrival order, or require separate priority. | Pending clinic operations decision |
| Late Arrival Rule | How late arrivals affect queue order, dentist assignment, cancellation, and no-show timing. | Pending clinic operations decision |
| Check-In Permission | Whether receptionist, cashier, admin, or other staff may check patients in. | Pending clinic operations/security decision |
| No-Show Permission | Who may mark no-show and whether a second confirmation is required. | Pending clinic operations/security decision |
| Dentist Reassignment | Who may assign/reassign dentists after a patient has checked in. | Pending clinic operations/security decision |
| Cashier Role | Whether cashier is a separate role or handled by staff/admin permissions. | Pending clinic owner/security decision |
| Discount Approval | Who may apply discounts and what authorization text/proof is required. | Pending clinic owner/accounting decision |
| Void Payment Approval | Who may void/refund payments and what evidence is required. | Pending clinic owner/accounting decision |
| Partial Payment Policy | Whether partial payments are allowed for all services or only selected services. | Pending clinic owner/accounting decision |
| In-Clinic Payment Methods | Final accepted methods: cash, GCash, Maya, bank transfer, card/POS, other. | Pending clinic owner/accounting decision |
| Visit Completion Timing | Whether dentist completes the visit before billing, after billing, or after clinical finalization only. | Pending clinic operations decision |
| Follow-Up Owner | Whether follow-up booking is normally handled by dentist, receptionist, or cashier before the patient leaves. | Pending clinic operations decision |
| Cash Drawer Reconciliation | Whether each branch has one cashier session or multiple sessions per cashier/device. | Pending clinic owner/accounting decision |
| Emergency Walk-Ins | Whether emergency walk-ins can override normal queue order and who can approve priority. | Pending clinic operations decision |
| Queue Display | Whether patient queue should be shown on an internal clinic screen and what patient identifiers may appear. | Pending clinic owner/privacy decision |
| Patient Booking Login | Whether public booking remains guest-friendly or requires login before final confirmation. | Pending clinic owner decision |
| Patient Dentist Choice | Whether patients may choose a dentist, choose Any available dentist, or only request a preference. | Pending clinic operations decision |
| Patient Cancellation | Whether patients may cancel appointments themselves and the cutoff window. | Pending clinic operations decision |
| Patient Rescheduling | Whether patients may reschedule themselves and the cutoff window. | Pending clinic operations decision |
| Reminder Timing | Final reminder offsets, such as 24 hours and 2 hours before appointment. | Pending clinic operations decision |
| Primary Patient Channel | Preferred channel priority: SMS, email, Messenger, portal notification. | Pending clinic/provider decision |
| Reminder Opt-Out | Whether patients may disable appointment reminders and which mandatory notices remain. | Pending clinic/legal decision |
| Patient Clinical Visibility | Which clinical notes, summaries, recommendations, and documents are patient-visible. | Pending clinic/legal/provider decision |
| Online Payment Methods | Accepted patient online methods and whether partial online payments are allowed. | Pending clinic/accounting/provider decision |
| Patient Downloads | Whether patients can download invoices, payment acknowledgements, and official receipt documents. | Pending clinic/accounting decision |
| Recall Rules | Recall intervals by service and who approves recall communications. | Pending clinic operations/provider decision |
| Legacy Record Linking | Whether imported/walk-in patients can self-link or require staff verification. | Pending clinic/security decision |
| Legacy Verification Proof | Required proof for linking an old record: patient number, phone, email, birth date, staff review, or in-clinic verification. | Pending clinic/security decision |
| Patient Contact Changes | Whether patients can directly change phone/email or require verification/staff approval. | Pending clinic/security decision |
| Patient-Facing Prices | Whether service prices display exact fee, starting fee, range, or consultation-only wording. | Pending clinic owner/accounting decision |
