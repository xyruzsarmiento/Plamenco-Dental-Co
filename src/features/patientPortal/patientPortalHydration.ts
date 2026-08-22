import { supabase } from '../../lib/supabase'
import { loadPatientVisibleDentalRecords } from '../dentalRecords/patientVisibleDentalRecordPersistence'

const keys = {
  appointments: 'plamenco.appointments',
  treatments: 'plamenco.treatments',
  treatmentPlans: 'plamenco.treatmentPlans',
  prescriptions: 'plamenco.prescriptions',
  invoices: 'plamenco.invoices',
  payments: 'plamenco.payments',
  receipts: 'plamenco.billing.receipts',
  documents: 'plamenco.documents',
}

function save(key: string, rows: unknown[]) {
  if (typeof window !== 'undefined') window.localStorage.setItem(key, JSON.stringify(rows))
}

function requireDatabase() {
  if (!supabase) throw new Error('Clinic database is not configured. Patient portal data cannot be loaded safely.')
  return supabase
}

export async function hydratePatientPortalFromDatabase() {
  const db = requireDatabase()
  const { data: authData, error: authError } = await db.auth.getUser()
  if (authError || !authData.user) throw new Error('Your session is no longer valid. Please sign in again.')

  const { data: patientRow, error: patientError } = await db
    .from('patients')
    .select('id,patient_id')
    .eq('auth_user_id', authData.user.id)
    .eq('status', 'active')
    .single()
  if (patientError || !patientRow) throw new Error('Your active patient record could not be loaded.')

  const patientDbId = String(patientRow.id)
  const patientPublicId = String(patientRow.patient_id)

  const [appointments, treatments, treatmentPlans, prescriptions, invoices, payments, receipts, documents] = await Promise.all([
    db.from('appointments')
      .select('id,appointment_number,patient_id,branch_id,provider_id,service_id,operatory_id,appointment_date,start_time,end_time,duration_minutes,estimated_amount_cents,payment_status,deposit_status,deposit_required_cents,deposit_paid_cents,reason_for_visit,patient_notes,booking_source,status,created_at,updated_at')
      .eq('patient_id', patientDbId)
      .order('appointment_date', { ascending: true }),
    db.from('treatments')
      .select('id,patient_id,dental_record_id,appointment_id,appointment_number,branch_id,provider_id,provider_name_snapshot,service_id,service_name_snapshot,tooth_number,description,cost,price_snapshot_cents,quantity,status,treatment_date,performed_by,created_at,updated_at')
      .eq('patient_id', patientDbId)
      .order('treatment_date', { ascending: false }),
    db.from('treatment_plans')
      .select('id,patient_id,plan_number,branch_id,provider_id,provider_name_snapshot,clinical_visit_id,name,description,treatments,overall_cost,amount_paid,status,version_number,patient_notes,quoted_subtotal_cents,discount_cents,quoted_total_cents,presented_at,decision_at,decision_source,created_at,updated_at')
      .eq('patient_id', patientDbId)
      .order('created_at', { ascending: false }),
    db.from('prescriptions')
      .select('id,patient_id,dental_record_id,appointment_id,branch_id,provider_id,provider_name_snapshot,items,prescribed_by,prescription_date,status,created_at,updated_at')
      .eq('patient_id', patientDbId)
      .order('prescription_date', { ascending: false }),
    db.from('invoices')
      .select('id,invoice_number,patient_id,branch_id,invoice_date,due_date,items,subtotal_cents,discount_cents,total_cents,amount_paid_cents,balance_cents,status,created_at,updated_at')
      .eq('patient_id', patientDbId)
      .order('invoice_date', { ascending: false }),
    db.from('payments')
      .select('id,payment_number,patient_id,invoice_id,branch_id,amount_cents,allocated_cents,refundable_cents,payment_method,payment_date,reference_number,source,status,rejection_reason_patient,created_at')
      .eq('patient_id', patientDbId)
      .order('payment_date', { ascending: false }),
    db.from('receipts')
      .select('id,receipt_number,payment_id,patient_id,invoice_ids,branch_id,amount_cents,remaining_balance_cents,issued_at,created_at')
      .eq('patient_id', patientDbId)
      .order('issued_at', { ascending: false }),
    db.from('documents')
      .select('id,patient_id,name,category,uploaded_by,created_at,clinical_visit_id,treatment_id,description,storage_path,file_type,size_bytes,patient_visible')
      .eq('patient_id', patientDbId)
      .eq('patient_visible', true)
      .order('created_at', { ascending: false }),
  ])

  const results = [appointments, treatments, treatmentPlans, prescriptions, invoices, payments, receipts, documents]
  const failed = results.find((result) => result.error)
  if (failed?.error) throw new Error(`Patient portal data could not be refreshed: ${failed.error.message}`)

  save(keys.appointments, (appointments.data ?? []).map((row: any) => ({
    id: String(row.id), appointmentNumber: row.appointment_number ?? undefined, patientId: patientPublicId,
    branchId: row.branch_id ?? undefined, providerId: row.provider_id ?? undefined, serviceId: String(row.service_id ?? ''), operatoryId: row.operatory_id ?? undefined,
    date: row.appointment_date ?? '', startTime: String(row.start_time ?? '').slice(0, 5), endTime: String(row.end_time ?? '').slice(0, 5),
    durationMinutes: row.duration_minutes == null ? undefined : Number(row.duration_minutes), estimatedAmountCents: row.estimated_amount_cents == null ? undefined : Number(row.estimated_amount_cents),
    paymentStatus: row.payment_status ?? 'not_billed', depositStatus: row.deposit_status ?? 'not_required', depositRequiredCents: Number(row.deposit_required_cents ?? 0), depositPaidCents: Number(row.deposit_paid_cents ?? 0),
    reasonForVisit: row.reason_for_visit ?? '', patientNotes: row.patient_notes ?? '', internalNotes: '', bookingSource: row.booking_source ?? 'patient_portal', notes: '',
    status: row.status ?? 'pending', createdBy: '', createdAt: row.created_at ?? new Date().toISOString(), updatedAt: row.updated_at ?? row.created_at ?? new Date().toISOString(),
  })))

  save(keys.treatments, (treatments.data ?? []).map((row: any) => ({
    id: String(row.id), patientId: patientPublicId, dentalRecordId: row.dental_record_id ?? undefined, appointmentId: row.appointment_id ?? undefined,
    appointmentNumber: row.appointment_number ?? undefined, branchId: row.branch_id ?? undefined, providerId: row.provider_id ?? undefined,
    providerNameSnapshot: row.provider_name_snapshot ?? '', serviceId: String(row.service_id ?? ''), serviceNameSnapshot: row.service_name_snapshot ?? '',
    toothNumber: row.tooth_number ?? undefined, description: row.description ?? '', cost: Number(row.cost ?? 0), priceSnapshotCents: Number(row.price_snapshot_cents ?? 0),
    quantity: Number(row.quantity ?? 1), status: row.status ?? 'planned', treatmentDate: row.treatment_date ?? '', notes: '',
    performedBy: row.provider_name_snapshot ?? '', createdBy: '', createdAt: row.created_at ?? new Date().toISOString(), updatedAt: row.updated_at ?? row.created_at ?? new Date().toISOString(),
  })))

  save(keys.treatmentPlans, (treatmentPlans.data ?? []).map((row: any) => ({
    id: String(row.id), patientId: patientPublicId, planNumber: row.plan_number ?? undefined, branchId: row.branch_id ?? undefined,
    providerId: row.provider_id ?? undefined, providerNameSnapshot: row.provider_name_snapshot ?? '', clinicalVisitId: row.clinical_visit_id ?? undefined,
    name: row.name ?? '', description: row.description ?? '', treatments: Array.isArray(row.treatments) ? row.treatments : [],
    overallCost: Number(row.overall_cost ?? 0), amountPaid: Number(row.amount_paid ?? 0), status: row.status ?? 'planned', versionNumber: Number(row.version_number ?? 1),
    patientNotes: row.patient_notes ?? '', internalNotes: '', quotedSubtotalCents: Number(row.quoted_subtotal_cents ?? 0), discountCents: Number(row.discount_cents ?? 0), quotedTotalCents: Number(row.quoted_total_cents ?? 0),
    presentedAt: row.presented_at ?? undefined, decisionAt: row.decision_at ?? undefined, decisionSource: row.decision_source ?? undefined,
    createdAt: row.created_at ?? new Date().toISOString(), updatedAt: row.updated_at ?? row.created_at ?? new Date().toISOString(),
  })))

  save(keys.prescriptions, (prescriptions.data ?? []).map((row: any) => {
    const items = Array.isArray(row.items) ? row.items.map((item: any, index: number) => ({
      id: String(item.id ?? `rx-${row.id}-${index}`), medication: String(item.medication ?? ''), strength: String(item.strength ?? ''), dosage: String(item.dosage ?? ''),
      frequency: String(item.frequency ?? ''), duration: String(item.duration ?? ''), instructions: String(item.instructions ?? ''),
    })) : []
    return {
      id: String(row.id), patientId: patientPublicId, dentalRecordId: row.dental_record_id ?? undefined, appointmentId: row.appointment_id ?? undefined,
      branchId: row.branch_id ?? undefined, providerId: row.provider_id ?? undefined, providerNameSnapshot: row.provider_name_snapshot ?? undefined, items,
      medication: items.map((item: any) => item.medication).join(', '), dosage: items[0]?.dosage ?? '', frequency: items[0]?.frequency ?? '', duration: items[0]?.duration ?? '', instructions: items[0]?.instructions ?? '',
      notes: '', prescribedBy: row.provider_name_snapshot || row.prescribed_by || 'Dental provider', prescriptionDate: row.prescription_date ?? '', status: row.status ?? 'active',
      createdAt: row.created_at ?? new Date().toISOString(), updatedAt: row.updated_at ?? row.created_at ?? new Date().toISOString(),
    }
  }))

  save(keys.invoices, (invoices.data ?? []).map((row: any) => ({
    id: String(row.id), invoiceNumber: row.invoice_number ?? '', patientId: patientPublicId, branchId: row.branch_id ?? undefined,
    invoiceDate: row.invoice_date ?? '', dueDate: row.due_date ?? undefined, items: Array.isArray(row.items) ? row.items : [],
    subtotalCents: Number(row.subtotal_cents ?? row.total_cents ?? 0), discountCents: Number(row.discount_cents ?? 0), totalCents: Number(row.total_cents ?? 0),
    amountPaidCents: Number(row.amount_paid_cents ?? 0), balanceCents: Number(row.balance_cents ?? 0), status: row.status ?? 'unpaid', notes: '',
    createdBy: '', createdAt: row.created_at ?? new Date().toISOString(), updatedAt: row.updated_at ?? row.created_at ?? new Date().toISOString(),
  })))

  save(keys.payments, (payments.data ?? []).map((row: any) => ({
    id: String(row.id), paymentNumber: row.payment_number ?? '', patientId: patientPublicId, invoiceId: String(row.invoice_id ?? ''), branchId: row.branch_id ?? undefined,
    amountCents: Number(row.amount_cents ?? 0), allocatedCents: Number(row.allocated_cents ?? row.amount_cents ?? 0), refundableCents: Number(row.refundable_cents ?? 0),
    paymentMethod: row.payment_method ?? 'cash', date: row.payment_date ?? '', referenceNumber: row.reference_number ?? '', source: row.source ?? 'manual', status: row.status ?? 'completed',
    rejectionReasonPatient: row.rejection_reason_patient ?? undefined, recordedBy: '', createdAt: row.created_at ?? new Date().toISOString(),
  })))

  save(keys.receipts, (receipts.data ?? []).map((row: any) => ({
    id: String(row.id), receiptNumber: row.receipt_number ?? '', paymentId: String(row.payment_id ?? ''), patientId: patientPublicId,
    invoiceIds: Array.isArray(row.invoice_ids) ? row.invoice_ids : [], branchId: row.branch_id ?? undefined, amountCents: Number(row.amount_cents ?? 0),
    remainingBalanceCents: Number(row.remaining_balance_cents ?? 0), issuedAt: row.issued_at ?? row.created_at ?? new Date().toISOString(), issuedBy: '',
  })))

  save(keys.documents, (documents.data ?? []).map((row: any) => ({
    id: String(row.id), patientId: patientPublicId, clinicalVisitId: row.clinical_visit_id ?? undefined, treatmentId: row.treatment_id ?? undefined,
    fileName: row.name ?? '', fileType: row.file_type ?? 'application/octet-stream', category: row.category ?? 'other', uploadDate: String(row.created_at ?? '').slice(0, 10),
    uploadedBy: row.uploaded_by ?? '', description: row.description ?? undefined, storagePath: row.storage_path ?? undefined, patientVisible: true,
    content: '', sizeBytes: Number(row.size_bytes ?? 0), createdAt: row.created_at ?? new Date().toISOString(), updatedAt: row.created_at ?? new Date().toISOString(),
  })))

  await loadPatientVisibleDentalRecords()

  if (typeof window !== 'undefined') window.dispatchEvent(new Event('plamenco:patient-portal-hydrated'))
  return { patientDbId, patientPublicId }
}
