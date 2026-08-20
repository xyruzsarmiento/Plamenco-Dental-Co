# Plamenco Dental Co. Clinic Decisions Required

Do not guess these values. Record the clinic owner's decision, date, and approver before production launch.

> Existing operational, security, clinical, inventory, deployment, communication, and patient-portal decisions from Parts 1–32 remain required. Part 33 adds the management-reporting decisions below; they must be resolved before ambiguous analytics are treated as production business facts.

## Part 33 — Management Reporting Decisions

| Decision Needed | Current Status |
|---|---|
| Which financial metric should be most prominent on the owner dashboard: Collections, Billed Amount, or another explicitly defined management metric? | Pending clinic owner/accountant confirmation |
| Should management see Gross Collections, Net Collections, or both? | Pending clinic owner/accountant confirmation |
| Should refunds be shown as a separate KPI/series in addition to their effect on Net Collections? | Pending clinic owner/accountant confirmation |
| Confirm whether partial payments are allowed for all services or selected services only. | Pending clinic owner/accountant confirmation |
| How should clinic-wide expenses with no branch be represented in All Branches and branch-comparison reports? | Pending clinic owner/accountant confirmation |
| Are cash sessions required per cashier, per device, or one session per branch? | Pending clinic owner/accountant confirmation |
| What are the official expense categories/subcategories, including Meralco, water, internet, rent, supplies, equipment and maintenance? | Pending clinic owner/accountant confirmation |
| What are the final accepted in-clinic and online payment methods? | Pending clinic owner/accountant/provider confirmation |
| Which roles may view provider compensation? | Pending clinic owner/security confirmation |
| Does management want provider utilization shown when reliable schedule denominators exist? | Pending clinic owner/provider confirmation |
| Does management want New vs Returning patient reporting when historical visit data supports it? | Pending clinic owner confirmation |
| What is the clinic's official No Show definition and eligible denominator for no-show rate? | Pending clinic operations confirmation |
| What is the official Completed Visit definition? | Pending clinic operations/provider confirmation |
| Should cancelled appointments count in general appointment volume, and in which rate denominators? | Pending clinic operations confirmation |
| Should the monthly Management Operations Report be emailed automatically? If yes, to whom and on what schedule? | Pending clinic owner/provider confirmation |
| May branch managers view analytics, and must they be restricted to their assigned branch? | Pending clinic owner/security confirmation |
| Is service profitability desired in a later accounting/integration scope? | Pending clinic owner/accountant confirmation |
| Is monetary inventory valuation required? | Pending clinic owner/accountant confirmation |
| If inventory valuation is required, what approved cost basis should be used? | Pending clinic owner/accountant confirmation |
| Does the clinic expect formal accounting integration later? This system will not implement a general ledger, tax filing, balance sheet, or formal income statement in Part 33. | Pending clinic owner/accountant confirmation |

## Part 39 — Recall & Follow-Up Decisions

| Decision Needed | Current Status |
|---|---|
| Does the clinic want routine recall automation? | Pending clinic owner/clinical confirmation |
| Which services create routine recall, and what interval applies to each? | Pending clinical confirmation; no interval is assumed |
| Can dentists override configured recall dates? | Pending clinical confirmation |
| Can staff create manual recalls/follow-ups? | Pending operations confirmation |
| Which roles may dismiss recalls, and is a reason mandatory? | Pending operations/security confirmation |
| What exactly counts as a completed recall? | Pending clinical/operations confirmation |
| Does a matching future appointment automatically mark a recall booked, and how must service/context match? | Pending operations confirmation |
| Can recalls transfer branches or providers? | Pending operations/clinical confirmation |
| Which channels may be used for recall reminders? | Pending communication/privacy confirmation |
| Are automated SMS/email/Messenger/in-app reminders enabled? | Pending clinic owner/provider confirmation |
| What reminder timing, maximum attempts, cooldown, and quiet hours apply? | Pending communication/privacy confirmation |
| Is bulk reminder sending allowed, and which roles may initiate it? | Pending security/operations confirmation |
| What counts as an inactive patient for reactivation? | Pending clinic owner confirmation; no 6/12 month default exists |
| Is reactivation outreach enabled? | Pending clinic owner/privacy confirmation |
| Should accepted but unscheduled or undecided treatment plans create follow-up tasks? | Pending clinical/operations confirmation |
| Should management see provider-specific recall metrics? | Pending clinic owner/provider confirmation |

## Part 40 — Production Launch Decisions

| Decision Needed | Current Status |
|---|---|
| What is the approved production domain and go-live date? | Pending clinic owner/deployment confirmation |
| Who is authorized to approve a production release after the Part 40 blocker review? | Pending clinic owner confirmation |
| Who owns database backup verification and restore rehearsal before launch? | Pending clinic owner/technical owner confirmation |
| What is the acceptable maintenance window for applying production migrations? | Pending clinic operations confirmation |
| Which real payment methods/providers are enabled at launch? | Pending clinic owner/accountant/provider confirmation |
| Which communication providers/channels are enabled at launch? | Pending clinic owner/privacy/provider confirmation |
| Which staff accounts/roles/branch assignments are approved for the initial pilot? | Pending clinic operations/security confirmation |
| Will launch begin with one branch or both branches simultaneously? | Pending clinic owner/operations confirmation |
| What historical data set is approved for production import, and who signs off reconciliation? | Pending clinic owner/data owner confirmation |
| What is the incident escalation owner for suspected patient-data exposure or incorrect financial posting? | Pending clinic owner/security confirmation |
| Which Critical/High issues, if any, are explicitly accepted as launch blockers versus deferred non-blocking work? | Pending launch review; Critical integrity/privacy issues may not be silently waived |

## Part 41 — Operational Task & Automation Decisions

| Decision Needed | Current Status |
|---|---|
| Which task automation rules should be enabled? | Pending clinic operations confirmation; all rules are disabled by default |
| Can staff manually create general operational tasks? | Pending operations/security confirmation |
| Can staff assign tasks to other staff or claim unassigned tasks? | Pending operations/security confirmation |
| Who may reassign, cancel, or reopen tasks? | Pending operations/security confirmation |
| Are blocked reasons mandatory for all task types? | Pending operations confirmation; current task RPC requires a reason for Blocked |
| Which task types, if any, may use Critical operational priority? | Pending clinic owner/operations confirmation |
| What does Critical operational priority mean for this clinic? | Pending clinic owner/operations confirmation; it must not imply medical urgency |
| Should front desk see all tasks for assigned branches or only individually assigned work? | Pending operations/security confirmation |
| Should dentists see only their own provider/clinical tasks? | Pending clinical/security confirmation |
| Can Associate Dentists receive and complete clinical operational tasks? | Pending clinical/security confirmation |
| Should accepted treatment-plan items automatically create scheduling tasks? | Pending clinical/operations confirmation |
| Should undecided treatment plans create follow-up tasks? | Pending clinical/operations confirmation |
| Should pending consents create tasks automatically, and how close to an appointment? | Pending clinical/operations confirmation |
| Should actual payment failures always create Payment Review tasks? | Pending billing/operations confirmation |
| Which failed communication states should create exception tasks? | Pending communication/operations confirmation |
| Should due recalls create staff tasks automatically? | Pending recall/operations confirmation |
| Should configured inventory reorder or expiry conditions create tasks automatically? | Pending inventory/operations confirmation |
| Should expenses awaiting approval generate tasks? | Pending finance/operations confirmation |
| Should overdue tasks notify supervisors, and after what configured threshold? | Pending operations/security confirmation |
| Are task due windows configured per task type? | Pending operations confirmation |
| Who may manage automation rules? | Pending clinic owner/security confirmation |
| Should branch managers see workload metrics? | Pending clinic owner/operations confirmation |
| Should task completion metrics be shown by individual staff member? | Pending clinic owner/HR/privacy confirmation; no employee ranking is implemented |

## Part 42 — Patient Portal & Self-Service Decisions

| Decision Needed | Current Status |
|---|---|
| Can patients reschedule appointments themselves? | Pending clinic operations confirmation |
| What reschedule cutoff and maximum reschedule count apply? | Pending clinic operations confirmation; no 24/48-hour rule is assumed |
| Can patients cancel appointments themselves, and what cutoff/reason policy applies? | Pending clinic operations confirmation |
| May a patient switch branch or provider during reschedule? | Pending operations/clinical confirmation |
| Which appointment statuses and instructions are patient-visible? | Pending operations/clinical confirmation |
| Can patients edit submitted medical history? | Pending clinical/privacy confirmation |
| Which profile fields may patients edit, including login email? | Pending clinic/privacy/auth confirmation |
| Which document categories are patient-visible? | Pending clinic/privacy confirmation |
| May patients download/print signed forms? | Pending clinic/privacy/legal-process confirmation |
| Can patients make treatment-plan decisions directly in the portal? | Pending clinical/operations confirmation |
| Does treatment-plan acceptance require a consent/signature workflow? | Pending clinical/clinic-policy confirmation |
| Can patients schedule accepted treatment directly? | Pending operations/clinical confirmation |
| Which payment providers and invoices are enabled for online payment? | Pending clinic owner/accountant/provider confirmation |
| Are partial online payments allowed? | Pending billing/accountant confirmation |
| Which receipts are downloadable, and should refund history be patient-visible? | Pending billing/privacy confirmation |
| Which recall/follow-up details are patient-visible, and may patients book from recall? | Pending clinical/operations confirmation |
| Which notification categories should appear in the patient portal? | Pending operations/privacy confirmation |
| Which communication preferences may patients control? | Pending privacy/communications confirmation |
| Should Messenger preference appear only when Meta integration is configured? | Pending communications/provider confirmation |
| Should the PWA install option be actively promoted in the portal? | Pending clinic owner/product confirmation |

## Part 43 — Management Automation & Scheduled Report Decisions

| Decision Needed | Current Status |
|---|---|
| Which scheduled report types are enabled? | Pending clinic owner/management confirmation; Part 43 creates schedules disabled by default |
| Is a Daily Operations Summary required? | Pending clinic operations confirmation |
| Is a Weekly Management Summary required? | Pending clinic owner/management confirmation |
| Is a Monthly Management Operations Report required? | Pending clinic owner/accountant confirmation |
| What time should daily reports run? | Pending clinic owner/operations confirmation; no default time is assumed |
| What weekday/time should weekly reports run? | Pending clinic owner/operations confirmation |
| What day/time should monthly reports run? | Pending clinic owner/accountant confirmation |
| Who receives each report? | Pending clinic owner/security confirmation |
| Can approved external email addresses receive reports? | Pending clinic owner/privacy/security confirmation |
| Which reports may branch managers receive? | Pending clinic owner/security confirmation |
| Which reports may dentists receive? | Pending clinic owner/clinical/security confirmation |
| Which report types include financial metrics? | Pending clinic owner/accountant confirmation |
| Which report types include provider operations? | Pending clinic owner/clinical confirmation |
| Which report types include inventory exceptions? | Pending clinic owner/inventory confirmation |
| Which report types include task/exception summaries? | Pending clinic owner/operations confirmation |
| Should delivery use PDF, Excel, secure link, HTML summary, or a combination? | Pending clinic owner/security confirmation |
| Should files be attached directly or delivered through private signed links? | Pending clinic owner/security/provider confirmation |
| How long should signed report links remain valid? | Pending clinic owner/security confirmation |
| How long should generated report files be retained? | Pending clinic owner/privacy/security confirmation |
| Should failed deliveries retry automatically? | Pending clinic owner/technical confirmation |
| What is the maximum delivery retry count? | Pending clinic owner/technical confirmation |
| Who receives generation/delivery failure alerts? | Pending clinic owner/operations confirmation |
| Should failed report generation create an operational task? | Pending clinic owner/operations confirmation |
| Should failed delivery create an operational task? | Pending clinic owner/operations confirmation |
| Can admins manually regenerate report runs? | Pending clinic owner/security confirmation |
| Can admins manually resend reports? | Pending clinic owner/security confirmation |
| Should monthly reports include a separate Unknown/Unmapped branch bucket? | Pending clinic owner/accountant confirmation |
| Should provider-specific operational metrics be included? | Pending clinic owner/clinical confirmation |
| Which management reports are classified as sensitive? | Pending clinic owner/privacy/security confirmation |
| Who approves the final scheduled-report configuration? | Pending clinic owner confirmation |

## Existing decisions from Parts 1–32

The previously tracked decisions remain in project history and implementation documentation, including branch identity/hours, appointment policies, deposits, payment gateway and manual payment methods, service catalog/pricing, provider schedules/roles, staff permissions, compensation rules, inventory opening stock/reorder/cost rules, expense approvals, SMS/email/Messenger providers and consent, historical Excel migration/linking, retention/privacy, clinical visibility, patient exports, procurement/stock transfer/count workflows, backup/recovery ownership, deployment domains/projects, daily clinic workflow, queue/check-in/no-show permissions, patient booking/rescheduling, reminders, online payments, and patient-facing price presentation.

Do not infer any unresolved production value from demo data or frontend defaults.
