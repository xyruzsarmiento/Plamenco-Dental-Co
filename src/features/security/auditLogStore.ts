export type AuditAction =
  | 'patient_created'
  | 'patient_updated'
  | 'patient_import_completed'
  | 'patient_import_rolled_back'
  | 'appointment_status_changed'
  | 'communication_preference_changed'
  | 'communication_template_updated'
  | 'communication_manual_resend'
  | 'communication_settings_changed'
  | 'clinical_record_created'
  | 'clinical_record_draft_updated'
  | 'clinical_record_finalized'
  | 'clinical_record_amendment_added'
  | 'prescription_created'
  | 'clinical_document_uploaded'
  | 'dental_record_created'
  | 'dental_record_updated'
  | 'treatment_created'
  | 'treatment_updated'
  | 'charge_added'
  | 'invoice_created'
  | 'invoice_voided'
  | 'discount_applied'
  | 'payment_submitted'
  | 'payment_recorded'
  | 'payment_approved'
  | 'payment_rejected'
  | 'payment_gateway_event_processed'
  | 'refund_completed'
  | 'inventory_item_created'
  | 'inventory_item_updated'
  | 'stock_movement_posted'
  | 'stock_transfer_initiated'
  | 'stock_transfer_received'
  | 'purchase_order_created'
  | 'purchase_order_approved'
  | 'purchase_received'
  | 'supplier_changed'
  | 'expense_created'
  | 'expense_updated'
  | 'expense_approved'
  | 'expense_paid'
  | 'expense_partial_payment_recorded'
  | 'expense_attachment_uploaded'
  | 'expense_voided'
  | 'expense_recurring_template_created'
  | 'expense_recurring_template_changed'
  | 'expense_vendor_changed'
  | 'purchase_linked_expense_generated'
  | 'cashier_session_opened'
  | 'cashier_session_closed'
  | 'cash_movement_recorded'
  | 'petty_cash_disbursed'
  | 'report_exported'
  | 'report_view_saved'
  | 'backup_evidence_recorded'
  | 'backup_verification_recorded'
  | 'restore_plan_created'
  | 'restore_plan_approved'
  | 'staff_account_changed'
  | 'staff_shift_planned'
  | 'staff_attendance_recorded'
  | 'provider_created'
  | 'provider_updated'
  | 'provider_branch_assignment_changed'
  | 'provider_schedule_updated'
  | 'provider_availability_changed'
  | 'provider_compensation_rule_changed'
  | 'provider_payout_created'
  | 'provider_payout_processed'
  | 'branch_updated'
  | 'settings_changed'

export function formatAuditAction(action: AuditAction) {
  const map: Record<AuditAction, { label: string; description: string }> = {
    patient_created: { label: 'Patient created', description: 'A new patient profile was created.' },
    patient_updated: { label: 'Patient updated', description: 'Patient details were updated.' },
    patient_import_completed: { label: 'Patient import completed', description: 'A historical patient import batch was confirmed.' },
    patient_import_rolled_back: { label: 'Patient import rolled back', description: 'Patient records created by an import batch were removed during migration review.' },
    appointment_status_changed: { label: 'Appointment status changed', description: 'An appointment moved through the clinic workflow.' },
    communication_preference_changed: { label: 'Communication preference changed', description: 'A patient communication preference was updated.' },
    communication_template_updated: { label: 'Communication template updated', description: 'A communication template was revised.' },
    communication_manual_resend: { label: 'Communication resend triggered', description: 'A user manually requested a patient communication.' },
    communication_settings_changed: { label: 'Communication settings updated', description: 'Communication integration settings were changed.' },
    clinical_record_created: { label: 'Clinical record created', description: 'A clinical visit record was created.' },
    clinical_record_draft_updated: { label: 'Clinical record draft updated', description: 'A draft clinical visit was updated.' },
    clinical_record_finalized: { label: 'Clinical record finalized', description: 'A clinical visit record was finalized.' },
    clinical_record_amendment_added: { label: 'Clinical amendment added', description: 'An amendment was added to a finalized clinical record.' },
    prescription_created: { label: 'Prescription created', description: 'A provider created a prescription.' },
    clinical_document_uploaded: { label: 'Clinical document uploaded', description: 'A clinical document was attached to patient care history.' },
    dental_record_created: { label: 'Dental record added', description: 'A new dental record was created.' },
    dental_record_updated: { label: 'Dental record updated', description: 'A dental record was revised.' },
    treatment_created: { label: 'Treatment recorded', description: 'A new treatment was added to care history.' },
    treatment_updated: { label: 'Treatment updated', description: 'An existing treatment record was changed or voided.' },
    charge_added: { label: 'Charge added', description: 'A financial charge was created from authorized clinic work.' },
    invoice_created: { label: 'Invoice created', description: 'A billing invoice was created.' },
    invoice_voided: { label: 'Invoice voided', description: 'An unpaid invoice was voided with a reason.' },
    discount_applied: { label: 'Discount applied', description: 'An authorized discount was applied to a billing line item.' },
    payment_submitted: { label: 'Payment submitted', description: 'A payment was submitted for processing or verification.' },
    payment_recorded: { label: 'Payment received', description: 'A payment entry was recorded for a patient.' },
    payment_approved: { label: 'Payment approved', description: 'A submitted payment was verified and applied.' },
    payment_rejected: { label: 'Payment rejected', description: 'A submitted payment was rejected and retained for audit.' },
    payment_gateway_event_processed: { label: 'Gateway event processed', description: 'An online payment gateway event was processed idempotently.' },
    refund_completed: { label: 'Refund completed', description: 'A refund record was completed against a payment.' },
    inventory_item_created: { label: 'Inventory item created', description: 'An inventory catalog item was created.' },
    inventory_item_updated: { label: 'Inventory item updated', description: 'An inventory catalog item was updated.' },
    stock_movement_posted: { label: 'Stock movement posted', description: 'Branch stock changed with a movement ledger entry.' },
    stock_transfer_initiated: { label: 'Stock transfer initiated', description: 'A branch-to-branch stock transfer was initiated.' },
    stock_transfer_received: { label: 'Stock transfer received', description: 'A branch-to-branch stock transfer was completed.' },
    purchase_order_created: { label: 'Purchase order created', description: 'A supplier purchase order was created.' },
    purchase_order_approved: { label: 'Purchase order approved', description: 'A purchase order was approved.' },
    purchase_received: { label: 'Purchase received', description: 'A supplier delivery was received into branch stock.' },
    supplier_changed: { label: 'Supplier changed', description: 'Supplier information was created or updated.' },
    expense_created: { label: 'Expense created', description: 'An operating expense was recorded.' },
    expense_updated: { label: 'Expense updated', description: 'An editable operating expense was updated.' },
    expense_approved: { label: 'Expense approved', description: 'An operating expense was approved.' },
    expense_paid: { label: 'Expense paid', description: 'An operating expense was fully paid.' },
    expense_partial_payment_recorded: { label: 'Expense partial payment', description: 'A partial payment was recorded against an expense.' },
    expense_attachment_uploaded: { label: 'Expense attachment uploaded', description: 'Supporting expense document metadata was attached.' },
    expense_voided: { label: 'Expense voided', description: 'An expense was voided with a reason.' },
    expense_recurring_template_created: { label: 'Recurring expense created', description: 'A recurring expense template was created.' },
    expense_recurring_template_changed: { label: 'Recurring expense changed', description: 'A recurring expense template was changed.' },
    expense_vendor_changed: { label: 'Expense vendor changed', description: 'An expense vendor or payee record was changed.' },
    purchase_linked_expense_generated: { label: 'Purchase expense generated', description: 'An inventory purchase was linked to one expense record.' },
    cashier_session_opened: { label: 'Cashier session opened', description: 'A branch cash drawer was opened for a business day.' },
    cashier_session_closed: { label: 'Cashier session closed', description: 'Expected and actual branch cash were reconciled.' },
    cash_movement_recorded: { label: 'Cash movement recorded', description: 'A standalone branch cash movement was recorded.' },
    petty_cash_disbursed: { label: 'Petty cash disbursed', description: 'A branch petty cash expense was recorded and paid in cash.' },
    report_exported: { label: 'Report exported', description: 'A filtered analytics report was exported.' },
    report_view_saved: { label: 'Report view saved', description: 'A reusable report view and filter context was saved.' },
    backup_evidence_recorded: { label: 'Backup evidence recorded', description: 'Backup or export evidence was added to the recovery registry.' },
    backup_verification_recorded: { label: 'Backup verification recorded', description: 'A backup registry entry was marked with a verification outcome.' },
    restore_plan_created: { label: 'Restore plan created', description: 'A non-destructive restore plan was drafted for review.' },
    restore_plan_approved: { label: 'Restore plan approved', description: 'A restore plan was approved for controlled recovery execution.' },
    staff_account_changed: { label: 'Staff account updated', description: 'A staff account was changed.' },
    staff_shift_planned: { label: 'Staff shift planned', description: 'A staff work shift was scheduled for a branch.' },
    staff_attendance_recorded: { label: 'Staff attendance recorded', description: 'A staff time or attendance status was recorded.' },
    provider_created: { label: 'Dentist account created', description: 'A provider profile was created.' },
    provider_updated: { label: 'Dentist account updated', description: 'A provider profile was updated.' },
    provider_branch_assignment_changed: { label: 'Dentist branch assignment updated', description: 'A provider branch assignment changed.' },
    provider_schedule_updated: { label: 'Dentist schedule updated', description: 'A provider working schedule changed.' },
    provider_availability_changed: { label: 'Dentist availability updated', description: 'A provider availability exception changed.' },
    provider_compensation_rule_changed: { label: 'Provider compensation changed', description: 'A dentist compensation rule was created or changed.' },
    provider_payout_created: { label: 'Provider payout created', description: 'A dentist payout was calculated from completed clinical work.' },
    provider_payout_processed: { label: 'Provider payout processed', description: 'A dentist payout was linked to payroll compensation expense.' },
    branch_updated: { label: 'Branch information updated', description: 'A clinic branch was updated.' },
    settings_changed: { label: 'Settings updated', description: 'Clinic settings were updated.' },
  }

  return map[action] ?? { label: 'Activity logged', description: 'System activity was recorded.' }
}

export type AuditLogEntry = {
  id: string
  user: string
  action: AuditAction
  entity: string
  entityId: string
  timestamp: string
  metadata: Record<string, string | number | boolean | null | undefined>
}

const AUDIT_LOG_STORAGE_KEY = 'plamenco.audit.logs'

function createMemoryStorage(): Storage {
  const store = new Map<string, string>()
  return {
    get length() {
      return store.size
    },
    clear: () => store.clear(),
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string) => store.delete(key),
    setItem: (key: string, value: string) => store.setItem(key, value),
  } as Storage
}

function getStorage(): Storage {
  if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis && globalThis.localStorage) {
    return globalThis.localStorage
  }

  const memoryStorage = (globalThis as typeof globalThis & { __plamencoMemoryStorage?: Storage }).__plamencoMemoryStorage
  if (memoryStorage) return memoryStorage

  const created = createMemoryStorage()
  ;(globalThis as typeof globalThis & { __plamencoMemoryStorage?: Storage }).__plamencoMemoryStorage = created
  return created
}

function safeParseLogs(value: string | null): AuditLogEntry[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value) as AuditLogEntry[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function getAuditLogs(): AuditLogEntry[] {
  return safeParseLogs(getStorage().getItem(AUDIT_LOG_STORAGE_KEY))
}

export function saveAuditLogs(logs: AuditLogEntry[]) {
  getStorage().setItem(AUDIT_LOG_STORAGE_KEY, JSON.stringify(logs))
}

export function recordAuditEntry(input: Omit<AuditLogEntry, 'id' | 'timestamp'>) {
  const entry: AuditLogEntry = {
    ...input,
    id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
  }
  saveAuditLogs([entry, ...getAuditLogs()].slice(0, 1000))
  return entry
}
