import { isSupabaseConfigured, supabase } from './supabase'

type SyncTableEntry = {
  table: string
  localKey: string
  map: (row: any) => any
}

const UUID_VALUE_FIELDS = new Set([
  'id',
  'patient_id',
  'auth_user_id',
  'preferred_branch_id',
  'branch_id',
  'from_branch_id',
  'to_branch_id',
  'provider_id',
  'preferred_provider_id',
  'profile_id',
  'service_id',
  'operatory_id',
  'related_appointment_id',
  'appointment_id',
  'dental_record_id',
  'clinical_visit_id',
  'treatment_id',
  'invoice_id',
  'payment_id',
  'charge_id',
  'supplier_id',
  'default_supplier_id',
  'linked_supplier_id',
  'inventory_item_id',
  'batch_id',
  'purchase_order_id',
  'expense_id',
  'vendor_id',
  'recurring_template_id',
])

const UUID_ARRAY_FIELDS = new Set(['invoice_ids', 'branch_ids'])
const PATIENT_REFERENCE_TABLES = new Set([
  'appointments',
  'dental_records',
  'clinical_record_amendments',
  'treatments',
  'treatment_plans',
  'invoices',
  'payments',
  'charges',
  'receipts',
  'refunds',
  'stock_movements',
])
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const LEGACY_GENERATED_ID_PATTERN = /^[a-z][a-z0-9-]*-\d{10,}-[a-z0-9]+$/i

function deterministicUuid(value: string) {
  let h1 = 0xdeadbeef ^ value.length
  let h2 = 0x41c6ce57 ^ value.length

  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    h1 = Math.imul(h1 ^ code, 2654435761)
    h2 = Math.imul(h2 ^ code, 1597334677)
  }

  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)

  let seed = `${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0).toString(16).padStart(8, '0')}`
  let state = (h1 ^ h2) >>> 0
  while (seed.length < 32) {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    seed += (state >>> 0).toString(16).padStart(8, '0')
  }

  const hex = seed.slice(0, 32).split('')
  hex[12] = '4'
  hex[16] = '8'
  const normalized = hex.join('')
  return `${normalized.slice(0, 8)}-${normalized.slice(8, 12)}-${normalized.slice(12, 16)}-${normalized.slice(16, 20)}-${normalized.slice(20, 32)}`
}

function normalizeLegacyUuid(value: unknown) {
  if (typeof value !== 'string' || !value) return value
  if (UUID_PATTERN.test(value)) return value
  if (!LEGACY_GENERATED_ID_PATTERN.test(value)) return value
  return deterministicUuid(value)
}

function normalizeRemoteRowIds(row: Record<string, unknown>) {
  const normalized: Record<string, unknown> = { ...row }

  for (const [key, value] of Object.entries(normalized)) {
    if (UUID_VALUE_FIELDS.has(key)) {
      if (value == null || (typeof value === 'string' && !value.trim())) {
        normalized[key] = null
      } else {
        normalized[key] = normalizeLegacyUuid(value)
      }
      continue
    }

    if (UUID_ARRAY_FIELDS.has(key) && Array.isArray(value)) {
      normalized[key] = value
        .filter((entry) => !(typeof entry === 'string' && !entry.trim()))
        .map((entry) => normalizeLegacyUuid(entry))
    }
  }

  return normalized
}

async function resolvePatientForeignKey(value: unknown) {
  if (!supabase || value == null) return value
  const text = String(value).trim()
  if (!text) return null
  if (UUID_PATTERN.test(text)) return text

  const { data, error } = await supabase
    .from('patients')
    .select('id')
    .eq('patient_id', text)
    .maybeSingle()

  if (!error && data?.id) return String(data.id)
  return normalizeLegacyUuid(text)
}

async function prepareRemoteRow(table: string, row: Record<string, unknown>) {
  const normalized = normalizeRemoteRowIds(row)
  if (PATIENT_REFERENCE_TABLES.has(table) && Object.prototype.hasOwnProperty.call(normalized, 'patient_id')) {
    normalized.patient_id = await resolvePatientForeignKey(normalized.patient_id)
  }
  return normalized
}

function reportPersistenceError(operation: string, table: string, error: unknown) {
  console.error(`Supabase ${operation} failed for ${table}:`, error)
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('plamenco:persistence-error', {
      detail: { operation, table, error },
    }))
  }
}

function getCachedPatientPublicId(value: unknown) {
  if (typeof window === 'undefined' || value == null) return value
  const text = String(value)
  try {
    const patients = JSON.parse(window.localStorage.getItem('plamenco.patients') ?? '[]') as Array<{ id?: string; patientId?: string }>
    const match = patients.find((patient) => patient.id === text || patient.patientId === text)
    return match?.patientId ?? value
  } catch {
    return value
  }
}

function reconcileMappedPatientReferences(table: string, rows: any[]) {
  if (!PATIENT_REFERENCE_TABLES.has(table)) return rows
  return rows.map((row) => row && typeof row === 'object' && 'patientId' in row
    ? { ...row, patientId: getCachedPatientPublicId(row.patientId) }
    : row)
}

let mutationQueue: Promise<unknown> = Promise.resolve()

function queueMutation<T>(operation: () => Promise<T>) {
  const run = mutationQueue.then(operation, operation)
  mutationQueue = run.then(() => undefined, () => undefined)
  return run
}

async function nextUniqueHumanNumber(table: 'expenses' | 'expense_vendors') {
  if (!supabase) return null
  const config = table === 'expenses'
    ? { column: 'expense_number', prefix: 'EXP' }
    : { column: 'vendor_number', prefix: 'VND' }
  const { data, error } = await supabase.from(table).select(config.column)
  if (error) return null
  const highest = (data ?? []).reduce((max, row: Record<string, unknown>) => {
    const match = String(row[config.column] ?? '').match(new RegExp(`^${config.prefix}-(\\d+)$`))
    return match ? Math.max(max, Number(match[1])) : max
  }, 0)
  return `${config.prefix}-${String(highest + 1).padStart(6, '0')}`
}

const tablesToSync: SyncTableEntry[] = [
  {
    table: 'staff',
    localKey: 'plamenco.staff.accounts',
    map: (row: any) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      phone: row.phone ?? '',
      position: row.position ?? '',
      role: row.role,
      status: row.status,
      password: row.password,
      createdAt: row.created_at ?? new Date().toISOString(),
      updatedAt: row.updated_at ?? row.created_at ?? new Date().toISOString(),
    }),
  },
  {
    table: 'services',
    localKey: 'plamenco.services',
    map: (row: any) => ({
      id: row.id,
      name: row.name,
      description: row.description ?? '',
      duration: Number(row.duration ?? 0),
      price: Number(row.price ?? 0),
      category: row.category ?? 'General',
      status: row.status ?? 'active',
      branchIds: row.branch_ids ?? [],
      onlineBookable: Boolean(row.online_bookable ?? true),
      internalOnly: Boolean(row.internal_only ?? false),
      showOnWebsite: Boolean(row.show_on_website ?? true),
      imageUrl: row.image_url ?? '',
      createdAt: row.created_at ?? new Date().toISOString(),
      updatedAt: row.updated_at ?? row.created_at ?? new Date().toISOString(),
    }),
  },
  {
    table: 'payment_methods',
    localKey: 'plamenco.billing.paymentMethods',
    map: (row: any) => ({
      id: row.id,
      label: row.label ?? row.id,
      active: Boolean(row.active),
      isOnline: Boolean(row.is_online),
      requiresReference: Boolean(row.requires_reference),
      requiresVerification: Boolean(row.requires_verification),
      patientPortalAvailable: Boolean(row.patient_portal_available ?? true),
      environment: row.environment ?? 'not_configured',
    }),
  },
  {
    table: 'patients',
    localKey: 'plamenco.patients',
    map: (row: any) => ({
      id: row.id,
      patientId: row.patient_id,
      firstName: row.first_name ?? '',
      middleName: row.middle_name ?? '',
      lastName: row.last_name ?? '',
      dateOfBirth: row.date_of_birth ?? '',
      sex: row.sex ?? 'prefer_not_to_say',
      phone: row.phone ?? '',
      email: row.email ?? '',
      address: row.address ?? '',
      emergencyContact: row.emergency_contact ?? '',
      emergencyContactPhone: row.emergency_contact_phone ?? '',
      registrationDate: row.registration_date ?? '',
      status: row.status ?? 'active',
      allergies: row.allergies ?? '',
      medicalConditions: row.medical_conditions ?? '',
      currentMedications: row.current_medications ?? '',
      previousSurgeries: row.previous_surgeries ?? '',
      medicalNotes: row.medical_notes ?? '',
      createdAt: row.created_at ?? new Date().toISOString(),
      updatedAt: row.updated_at ?? row.created_at ?? new Date().toISOString(),
    }),
  },
  {
    table: 'appointments',
    localKey: 'plamenco.appointments',
    map: (row: any) => ({
      id: row.id,
      patientId: row.patient_id,
      serviceId: row.service_id,
      date: row.appointment_date ?? '',
      startTime: row.start_time ?? '00:00',
      endTime: row.end_time ?? '00:00',
      notes: row.notes ?? '',
      status: row.status ?? 'pending',
      createdBy: row.created_by ?? '',
      createdAt: row.created_at ?? new Date().toISOString(),
      updatedAt: row.updated_at ?? row.created_at ?? new Date().toISOString(),
    }),
  },
  {
    table: 'dental_records',
    localKey: 'plamenco.dentalRecords',
    map: (row: any) => ({
      id: row.id,
      patientId: row.patient_id,
      recordDate: row.record_date ?? '',
      visitType: row.visit_type ?? 'consultation',
      chiefComplaint: row.chief_complaint ?? '',
      diagnosis: row.diagnosis ?? '',
      treatmentPlan: row.treatment_plan ?? '',
      findings: row.findings ?? '',
      treatmentNotes: row.treatment_notes ?? '',
      followUpDate: row.follow_up_date ?? '',
      status: row.status ?? 'draft',
      relatedAppointmentId: row.related_appointment_id ?? undefined,
      createdBy: row.created_by ?? '',
      createdAt: row.created_at ?? new Date().toISOString(),
      updatedAt: row.updated_at ?? row.created_at ?? new Date().toISOString(),
    }),
  },
  {
    table: 'treatments',
    localKey: 'plamenco.treatments',
    map: (row: any) => ({
      id: row.id,
      patientId: row.patient_id,
      dentalRecordId: row.dental_record_id ?? undefined,
      serviceId: row.service_id,
      toothNumber: row.tooth_number ?? undefined,
      description: row.description ?? '',
      cost: Number(row.cost ?? 0),
      status: row.status ?? 'planned',
      treatmentDate: row.treatment_date ?? '',
      notes: row.notes ?? '',
      createdAt: row.created_at ?? new Date().toISOString(),
      updatedAt: row.updated_at ?? row.created_at ?? new Date().toISOString(),
    }),
  },
  {
    table: 'treatment_plans',
    localKey: 'plamenco.treatmentPlans',
    map: (row: any) => ({
      id: row.id,
      patientId: row.patient_id,
      name: row.name,
      description: row.description ?? '',
      treatments: row.treatments ?? [],
      overallCost: Number(row.overall_cost ?? 0),
      amountPaid: Number(row.amount_paid ?? 0),
      status: row.status ?? 'planned',
      createdAt: row.created_at ?? new Date().toISOString(),
      updatedAt: row.updated_at ?? row.created_at ?? new Date().toISOString(),
    }),
  },
  {
    table: 'invoices',
    localKey: 'plamenco.invoices',
    map: (row: any) => ({
      id: row.id,
      invoiceNumber: row.invoice_number,
      patientId: row.patient_id,
      branchId: row.branch_id ?? undefined,
      invoiceDate: row.invoice_date ?? '',
      dueDate: row.due_date ?? undefined,
      items: Array.isArray(row.items) ? row.items : [],
      subtotalCents: Number(row.subtotal_cents ?? row.total_cents ?? 0),
      discountCents: Number(row.discount_cents ?? 0),
      totalCents: Number(row.total_cents ?? 0),
      amountPaidCents: Number(row.amount_paid_cents ?? 0),
      balanceCents: Number(row.balance_cents ?? 0),
      status: row.status ?? 'unpaid',
      notes: row.notes ?? '',
      voidReason: row.void_reason ?? undefined,
      voidedBy: row.voided_by ?? undefined,
      voidedAt: row.voided_at ?? undefined,
      createdBy: row.created_by ?? 'Front desk',
      createdAt: row.created_at ?? new Date().toISOString(),
      updatedAt: row.updated_at ?? row.created_at ?? new Date().toISOString(),
    }),
  },
  {
    table: 'payments',
    localKey: 'plamenco.payments',
    map: (row: any) => ({
      id: row.id,
      paymentNumber: row.payment_number ?? '',
      patientId: row.patient_id,
      invoiceId: row.invoice_id,
      branchId: row.branch_id ?? undefined,
      amountCents: Number(row.amount_cents ?? 0),
      allocatedCents: Number(row.allocated_cents ?? row.amount_cents ?? 0),
      refundableCents: Number(row.refundable_cents ?? row.amount_cents ?? 0),
      paymentMethod: row.payment_method ?? 'cash',
      date: row.payment_date ?? '',
      referenceNumber: row.reference_number ?? '',
      source: row.source ?? 'manual',
      status: row.status ?? 'completed',
      proofFilePath: row.proof_file_path ?? undefined,
      gatewayProvider: row.gateway_provider ?? undefined,
      gatewayTransactionId: row.gateway_transaction_id ?? undefined,
      notes: row.notes ?? undefined,
      recordedBy: row.recorded_by ?? 'Front desk',
      verifiedBy: row.verified_by ?? undefined,
      verifiedAt: row.verified_at ?? undefined,
      rejectionReasonInternal: row.rejection_reason_internal ?? undefined,
      rejectionReasonPatient: row.rejection_reason_patient ?? undefined,
      createdAt: row.created_at ?? new Date().toISOString(),
    }),
  },
  {
    table: 'charges',
    localKey: 'plamenco.billing.charges',
    map: (row: any) => ({
      id: row.id,
      patientId: row.patient_id,
      branchId: row.branch_id ?? undefined,
      clinicalVisitId: row.clinical_visit_id ?? undefined,
      appointmentId: row.appointment_id ?? undefined,
      treatmentId: row.treatment_id ?? undefined,
      serviceId: row.service_id ?? undefined,
      providerId: row.provider_id ?? undefined,
      providerNameSnapshot: row.provider_name_snapshot ?? '',
      description: row.description ?? '',
      quantity: Number(row.quantity ?? 1),
      unitPriceCents: Number(row.unit_price_cents ?? 0),
      subtotalCents: Number(row.subtotal_cents ?? 0),
      discountCents: Number(row.discount_cents ?? 0),
      finalAmountCents: Number(row.final_amount_cents ?? 0),
      status: row.status ?? 'unbilled',
      createdBy: row.created_by ?? 'Front desk',
      createdAt: row.created_at ?? new Date().toISOString(),
      updatedAt: row.updated_at ?? row.created_at ?? new Date().toISOString(),
    }),
  },
  {
    table: 'payment_allocations',
    localKey: 'plamenco.billing.paymentAllocations',
    map: (row: any) => ({
      id: row.id,
      paymentId: row.payment_id,
      invoiceId: row.invoice_id,
      amountCents: Number(row.amount_cents ?? 0),
      createdAt: row.created_at ?? new Date().toISOString(),
    }),
  },
  {
    table: 'receipts',
    localKey: 'plamenco.billing.receipts',
    map: (row: any) => ({
      id: row.id,
      receiptNumber: row.receipt_number,
      paymentId: row.payment_id,
      patientId: row.patient_id,
      invoiceIds: row.invoice_ids ?? [],
      branchId: row.branch_id ?? undefined,
      amountCents: Number(row.amount_cents ?? 0),
      remainingBalanceCents: Number(row.remaining_balance_cents ?? 0),
      issuedAt: row.issued_at ?? row.created_at ?? new Date().toISOString(),
      issuedBy: row.issued_by ?? 'Front desk',
    }),
  },
  {
    table: 'refunds',
    localKey: 'plamenco.billing.refunds',
    map: (row: any) => ({
      id: row.id,
      refundNumber: row.refund_number,
      paymentId: row.payment_id,
      patientId: row.patient_id,
      branchId: row.branch_id ?? undefined,
      amountCents: Number(row.amount_cents ?? 0),
      reason: row.reason ?? '',
      status: row.status ?? 'completed',
      processedBy: row.processed_by ?? 'Front desk',
      processedAt: row.processed_at ?? row.created_at ?? new Date().toISOString(),
      gatewayRefundId: row.gateway_refund_id ?? undefined,
    }),
  },
  {
    table: 'audit_logs',
    localKey: 'plamenco.auditLogs',
    map: (row: any) => ({
      id: row.id,
      user: row.user_name ?? 'system',
      action: row.action ?? 'unknown_action',
      entity: row.entity ?? 'unknown_entity',
      entityId: row.entity_id ?? '',
      metadata: row.metadata ?? {},
      timestamp: row.created_at ?? new Date().toISOString(),
    }),
  },
  {
    table: 'inventory_categories',
    localKey: 'plamenco.inventory.categories',
    map: (row: any) => ({ id: row.id, name: row.name, status: row.status ?? 'active' }),
  },
  {
    table: 'inventory_units',
    localKey: 'plamenco.inventory.units',
    map: (row: any) => ({ id: row.id, label: row.label, abbreviation: row.abbreviation, status: row.status ?? 'active' }),
  },
  {
    table: 'suppliers',
    localKey: 'plamenco.inventory.suppliers',
    map: (row: any) => ({
      id: row.id,
      supplierNumber: row.supplier_number,
      name: row.name,
      contactPerson: row.contact_person ?? '',
      phone: row.phone ?? '',
      email: row.email ?? '',
      address: row.address ?? '',
      notes: row.notes ?? '',
      status: row.status ?? 'active',
      createdAt: row.created_at ?? new Date().toISOString(),
      updatedAt: row.updated_at ?? row.created_at ?? new Date().toISOString(),
    }),
  },
  {
    table: 'inventory_items',
    localKey: 'plamenco.inventory.items',
    map: (row: any) => ({
      id: row.id,
      itemCode: row.item_code,
      sku: row.sku ?? '',
      name: row.name,
      description: row.description ?? '',
      categoryId: row.category_id,
      unitId: row.unit_id,
      brand: row.brand ?? '',
      defaultSupplierId: row.default_supplier_id ?? undefined,
      defaultReorderLevel: Number(row.default_reorder_level ?? 0),
      trackBatches: Boolean(row.track_batches),
      trackExpiry: Boolean(row.track_expiry),
      expiryWarningDays: Number(row.expiry_warning_days ?? 60),
      status: row.status ?? 'active',
      createdAt: row.created_at ?? new Date().toISOString(),
      updatedAt: row.updated_at ?? row.created_at ?? new Date().toISOString(),
    }),
  },
  {
    table: 'branch_inventory',
    localKey: 'plamenco.inventory.branchStock',
    map: (row: any) => ({
      id: row.id,
      branchId: row.branch_id,
      itemId: row.inventory_item_id,
      quantityOnHand: Number(row.quantity_on_hand ?? 0),
      reorderLevel: Number(row.reorder_level ?? 0),
      location: row.location ?? '',
      averageUnitCostCents: Number(row.average_unit_cost_cents ?? 0),
      updatedAt: row.updated_at ?? new Date().toISOString(),
    }),
  },
  {
    table: 'inventory_batches',
    localKey: 'plamenco.inventory.batches',
    map: (row: any) => ({
      id: row.id,
      branchId: row.branch_id,
      itemId: row.inventory_item_id,
      batchNumber: row.batch_number,
      quantityOnHand: Number(row.quantity_on_hand ?? 0),
      receivedDate: row.received_date ?? '',
      expiryDate: row.expiry_date ?? undefined,
      supplierId: row.supplier_id ?? undefined,
      unitCostCents: Number(row.unit_cost_cents ?? 0),
      sourceType: row.source_type ?? '',
      sourceId: row.source_id ?? undefined,
      createdAt: row.created_at ?? new Date().toISOString(),
      updatedAt: row.updated_at ?? row.created_at ?? new Date().toISOString(),
    }),
  },
  {
    table: 'stock_movements',
    localKey: 'plamenco.inventory.movements',
    map: (row: any) => ({
      id: row.id,
      branchId: row.branch_id,
      itemId: row.inventory_item_id,
      batchId: row.batch_id ?? undefined,
      movementType: row.movement_type,
      quantity: Number(row.quantity ?? 0),
      quantityBefore: Number(row.quantity_before ?? 0),
      quantityAfter: Number(row.quantity_after ?? 0),
      referenceType: row.reference_type ?? undefined,
      referenceId: row.reference_id ?? undefined,
      reason: row.reason ?? '',
      performedBy: row.performed_by ?? '',
      patientId: row.patient_id ?? undefined,
      clinicalVisitId: row.clinical_visit_id ?? undefined,
      treatmentId: row.treatment_id ?? undefined,
      appointmentId: row.appointment_id ?? undefined,
      providerId: row.provider_id ?? undefined,
      unitCostCents: Number(row.unit_cost_cents ?? 0),
      totalCostCents: Number(row.total_cost_cents ?? 0),
      createdAt: row.created_at ?? new Date().toISOString(),
    }),
  },
  {
    table: 'purchase_orders',
    localKey: 'plamenco.inventory.purchaseOrders',
    map: (row: any) => ({
      id: row.id,
      poNumber: row.po_number,
      supplierId: row.supplier_id,
      branchId: row.branch_id,
      orderDate: row.order_date ?? '',
      expectedDeliveryDate: row.expected_delivery_date ?? undefined,
      status: row.status ?? 'ordered',
      items: Array.isArray(row.items) ? row.items : [],
      subtotalCents: Number(row.subtotal_cents ?? 0),
      totalCents: Number(row.total_cents ?? 0),
      notes: row.notes ?? '',
      createdBy: row.created_by ?? '',
      approvedBy: row.approved_by ?? undefined,
      createdAt: row.created_at ?? new Date().toISOString(),
      updatedAt: row.updated_at ?? row.created_at ?? new Date().toISOString(),
    }),
  },
  {
    table: 'purchase_receipts',
    localKey: 'plamenco.inventory.purchaseReceipts',
    map: (row: any) => ({
      id: row.id,
      receiptNumber: row.receipt_number,
      poId: row.purchase_order_id,
      supplierId: row.supplier_id,
      branchId: row.branch_id,
      receivedDate: row.received_date ?? '',
      receivedBy: row.received_by ?? '',
      notes: row.notes ?? '',
      totalCostCents: Number(row.total_cost_cents ?? 0),
      createdAt: row.created_at ?? new Date().toISOString(),
    }),
  },
  {
    table: 'stock_transfers',
    localKey: 'plamenco.inventory.transfers',
    map: (row: any) => ({
      id: row.id,
      transferNumber: row.transfer_number,
      fromBranchId: row.from_branch_id,
      toBranchId: row.to_branch_id,
      status: row.status ?? 'received',
      items: Array.isArray(row.items) ? row.items : [],
      requestedBy: row.requested_by ?? '',
      sentBy: row.sent_by ?? undefined,
      receivedBy: row.received_by ?? undefined,
      notes: row.notes ?? '',
      createdAt: row.created_at ?? new Date().toISOString(),
      receivedAt: row.received_at ?? undefined,
    }),
  },
  {
    table: 'expense_categories',
    localKey: 'plamenco.expense.categories',
    map: (row: any) => ({ id: row.id, name: row.name, parentId: row.parent_id ?? undefined, status: row.status ?? 'active' }),
  },
  {
    table: 'expense_vendors',
    localKey: 'plamenco.expense.vendors',
    map: (row: any) => ({
      id: row.id,
      vendorNumber: row.vendor_number,
      name: row.name,
      contactPerson: row.contact_person ?? '',
      phone: row.phone ?? '',
      email: row.email ?? '',
      address: row.address ?? '',
      notes: row.notes ?? '',
      linkedSupplierId: row.linked_supplier_id ?? undefined,
      status: row.status ?? 'active',
      createdAt: row.created_at ?? new Date().toISOString(),
      updatedAt: row.updated_at ?? row.created_at ?? new Date().toISOString(),
    }),
  },
  {
    table: 'expenses',
    localKey: 'plamenco.expenses',
    map: (row: any) => ({
      id: row.id,
      expenseNumber: row.expense_number,
      scope: row.scope ?? 'branch',
      branchId: row.branch_id ?? undefined,
      categoryId: row.category_id,
      vendorId: row.vendor_id ?? undefined,
      payeeName: row.payee_name ?? '',
      description: row.description ?? '',
      expenseDate: row.expense_date ?? '',
      dueDate: row.due_date ?? undefined,
      billingPeriodStart: row.billing_period_start ?? undefined,
      billingPeriodEnd: row.billing_period_end ?? undefined,
      subtotalCents: Number(row.subtotal_cents ?? 0),
      taxCents: Number(row.tax_cents ?? 0),
      totalCents: Number(row.total_cents ?? 0),
      amountPaidCents: Number(row.amount_paid_cents ?? 0),
      balanceCents: Number(row.balance_cents ?? 0),
      status: row.status ?? 'unpaid',
      paymentMethod: row.payment_method ?? undefined,
      referenceNumber: row.reference_number ?? undefined,
      sourceType: row.source_type ?? 'manual',
      sourceId: row.source_id ?? undefined,
      notes: row.notes ?? '',
      recurringTemplateId: row.recurring_template_id ?? undefined,
      createdBy: row.created_by ?? '',
      approvedBy: row.approved_by ?? undefined,
      approvedAt: row.approved_at ?? undefined,
      voidReason: row.void_reason ?? undefined,
      voidedBy: row.voided_by ?? undefined,
      voidedAt: row.voided_at ?? undefined,
      createdAt: row.created_at ?? new Date().toISOString(),
      updatedAt: row.updated_at ?? row.created_at ?? new Date().toISOString(),
    }),
  },
  {
    table: 'expense_payments',
    localKey: 'plamenco.expense.payments',
    map: (row: any) => ({
      id: row.id,
      expenseId: row.expense_id,
      amountCents: Number(row.amount_cents ?? 0),
      paymentDate: row.payment_date ?? '',
      paymentMethod: row.payment_method ?? 'cash',
      referenceNumber: row.reference_number ?? undefined,
      paidBy: row.paid_by ?? '',
      notes: row.notes ?? '',
      createdAt: row.created_at ?? new Date().toISOString(),
    }),
  },
  {
    table: 'expense_attachments',
    localKey: 'plamenco.expense.attachments',
    map: (row: any) => ({
      id: row.id,
      expenseId: row.expense_id,
      fileName: row.file_name,
      documentType: row.document_type ?? 'other',
      storagePath: row.storage_path,
      uploadedBy: row.uploaded_by ?? '',
      uploadedAt: row.uploaded_at ?? row.created_at ?? new Date().toISOString(),
      description: row.description ?? '',
    }),
  },
  {
    table: 'expense_recurring_templates',
    localKey: 'plamenco.expense.recurringTemplates',
    map: (row: any) => ({
      id: row.id,
      name: row.name,
      scope: row.scope ?? 'branch',
      branchId: row.branch_id ?? undefined,
      categoryId: row.category_id,
      vendorId: row.vendor_id ?? undefined,
      payeeName: row.payee_name ?? '',
      frequency: row.frequency ?? 'monthly',
      defaultAmountCents: row.default_amount_cents === null ? undefined : Number(row.default_amount_cents ?? 0),
      nextDueDate: row.next_due_date ?? '',
      autoCreate: Boolean(row.auto_create),
      status: row.status ?? 'active',
      createdBy: row.created_by ?? '',
      createdAt: row.created_at ?? new Date().toISOString(),
      updatedAt: row.updated_at ?? row.created_at ?? new Date().toISOString(),
    }),
  },
  {
    table: 'saved_report_views',
    localKey: 'plamenco.reports.savedViews',
    map: (row: any) => ({
      id: row.id,
      name: row.name ?? '',
      description: row.description ?? '',
      reportKey: row.report_key ?? 'enterprise',
      filters: row.filters ?? {},
      createdBy: row.created_by ?? undefined,
      createdAt: row.created_at ?? new Date().toISOString(),
      updatedAt: row.updated_at ?? row.created_at ?? new Date().toISOString(),
    }),
  },
  {
    table: 'report_export_logs',
    localKey: 'plamenco.reports.exportLogs',
    map: (row: any) => ({
      id: row.id,
      reportKey: row.report_key ?? 'enterprise',
      exportFormat: row.export_format ?? 'csv',
      filters: row.filters ?? {},
      branchId: row.branch_id ?? undefined,
      exportedBy: row.exported_by ?? undefined,
      exportedAt: row.exported_at ?? new Date().toISOString(),
    }),
  },
  {
    table: 'clinic_configuration',
    localKey: 'plamenco.admin.clinicConfiguration',
    map: (row: any) => ({
      clinicName: row.clinic_name ?? 'Plamenco Dental Co.',
      primaryEmail: row.primary_email ?? '',
      primaryPhone: row.primary_phone ?? '',
      website: row.website ?? '',
      facebookPage: row.facebook_page ?? '',
      address: row.address ?? '',
      businessHours: row.business_hours ?? '',
      publicDescription: row.public_description ?? '',
      updatedBy: row.updated_by ?? 'system',
      updatedAt: row.updated_at ?? new Date().toISOString(),
    }),
  },
  {
    table: 'booking_configuration',
    localKey: 'plamenco.admin.bookingConfiguration',
    map: (row: any) => ({
      onlineBookingEnabled: Boolean(row.online_booking_enabled),
      defaultSlotMinutes: Number(row.default_slot_minutes ?? 30),
      minimumLeadHours: Number(row.minimum_lead_hours ?? 2),
      maximumAdvanceDays: Number(row.maximum_advance_days ?? 60),
      cancellationCutoffHours: Number(row.cancellation_cutoff_hours ?? 12),
      rescheduleCutoffHours: Number(row.reschedule_cutoff_hours ?? 12),
      updatedBy: row.updated_by ?? 'system',
      updatedAt: row.updated_at ?? new Date().toISOString(),
    }),
  },
  {
    table: 'clinic_closures',
    localKey: 'plamenco.admin.clinicClosures',
    map: (row: any) => ({
      id: row.id,
      branchId: row.branch_id ?? undefined,
      date: row.closure_date ?? '',
      reason: row.reason ?? '',
      type: row.closure_type ?? 'special_closure',
      createdBy: row.created_by ?? 'system',
      createdAt: row.created_at ?? new Date().toISOString(),
    }),
  },
  {
    table: 'internal_account_invitations',
    localKey: 'plamenco.admin.accountInvitations',
    map: (row: any) => ({
      id: row.id,
      email: row.email ?? '',
      name: row.full_name ?? '',
      role: row.role ?? 'staff',
      branchIds: row.branch_ids ?? [],
      providerProfileRequired: Boolean(row.provider_profile_required),
      status: row.status ?? 'pending',
      errorMessage: row.error_message ?? undefined,
      invitedBy: row.invited_by ?? 'system',
      invitedAt: row.invited_at ?? new Date().toISOString(),
      updatedAt: row.updated_at ?? row.invited_at ?? new Date().toISOString(),
    }),
  },
]

export async function syncSupabaseToLocalStorage() {
  if (!isSupabaseConfigured || !supabase || typeof window === 'undefined') return false

  let synced = false
  for (const entry of tablesToSync) {
    const { data, error } = await supabase.from(entry.table).select('*')
    if (error || !Array.isArray(data)) continue

    window.localStorage.removeItem(entry.localKey)
    if (data.length === 0) continue

    const rows = reconcileMappedPatientReferences(entry.table, data.map(entry.map))
    window.localStorage.setItem(entry.localKey, JSON.stringify(rows))
    synced = true
  }
  return synced
}

export async function upsertRemoteTableRows(table: string, rows: Record<string, unknown>[]) {
  if (!isSupabaseConfigured || !supabase || !rows.length) return null

  return queueMutation(async () => {
    const normalizedRows = await Promise.all(rows.map((row) => prepareRemoteRow(table, row)))
    const { data, error } = await supabase.from(table).upsert(normalizedRows).select()
    if (error) {
      reportPersistenceError('upsert', table, error)
      return null
    }
    return data
  })
}

export async function insertRemoteTableRow(table: string, row: Record<string, unknown>) {
  if (!isSupabaseConfigured || !supabase) return null

  return queueMutation(async () => {
    let normalizedRow = await prepareRemoteRow(table, row)

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const { data, error } = await supabase.from(table).insert([normalizedRow]).select()
      if (!error) return data?.[0] ?? null

      const duplicateHumanNumber = String(error.code ?? '') === '23505'
        && ((table === 'expenses' && String(error.message ?? '').includes('expense_number'))
          || (table === 'expense_vendors' && String(error.message ?? '').includes('vendor_number')))

      if (duplicateHumanNumber) {
        const nextNumber = await nextUniqueHumanNumber(table as 'expenses' | 'expense_vendors')
        if (nextNumber) {
          normalizedRow = {
            ...normalizedRow,
            ...(table === 'expenses' ? { expense_number: nextNumber } : { vendor_number: nextNumber }),
          }
          continue
        }
      }

      reportPersistenceError('insert', table, error)
      return null
    }

    return null
  })
}

export async function updateRemoteTableRow(table: string, id: string, row: Record<string, unknown>) {
  if (!isSupabaseConfigured || !supabase) return null

  return queueMutation(async () => {
    const normalizedId = normalizeLegacyUuid(id) as string
    const normalizedRow = await prepareRemoteRow(table, row)
    const { data, error } = await supabase.from(table).update(normalizedRow).eq('id', normalizedId).select()
    if (error) {
      reportPersistenceError('update', table, error)
      return null
    }
    return data?.[0] ?? null
  })
}

export async function deleteRemoteTableRow(table: string, id: string) {
  if (!isSupabaseConfigured || !supabase) return false

  return queueMutation(async () => {
    const normalizedId = normalizeLegacyUuid(id) as string
    const { error } = await supabase.from(table).delete().eq('id', normalizedId)
    if (error) {
      reportPersistenceError('delete', table, error)
      return false
    }
    return true
  })
}
