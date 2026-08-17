import { isSupabaseConfigured, supabase } from './supabase'

type SyncTableEntry = {
  table: string
  localKey: string
  map: (row: any) => any
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
      createdAt: row.created_at ?? new Date().toISOString(),
      updatedAt: row.updated_at ?? row.created_at ?? new Date().toISOString(),
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
      invoiceDate: row.invoice_date ?? '',
      items: Array.isArray(row.items) ? row.items : [],
      totalCents: Number(row.total_cents ?? 0),
      amountPaidCents: Number(row.amount_paid_cents ?? 0),
      balanceCents: Number(row.balance_cents ?? 0),
      status: row.status ?? 'unpaid',
      notes: row.notes ?? '',
      createdAt: row.created_at ?? new Date().toISOString(),
      updatedAt: row.updated_at ?? row.created_at ?? new Date().toISOString(),
    }),
  },
  {
    table: 'payments',
    localKey: 'plamenco.payments',
    map: (row: any) => ({
      id: row.id,
      patientId: row.patient_id,
      invoiceId: row.invoice_id,
      amountCents: Number(row.amount_cents ?? 0),
      paymentMethod: row.payment_method ?? 'cash',
      date: row.payment_date ?? '',
      referenceNumber: row.reference_number ?? '',
      recordedBy: row.recorded_by ?? 'Front desk',
      createdAt: row.created_at ?? new Date().toISOString(),
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
]

export async function syncSupabaseToLocalStorage() {
  if (!isSupabaseConfigured || !supabase || typeof window === 'undefined') {
    return false
  }

  let synced = false

  for (const entry of tablesToSync) {
    const { data, error } = await supabase.from(entry.table).select('*')

    if (error || !Array.isArray(data)) {
      continue
    }

    window.localStorage.removeItem(entry.localKey)

    if (data.length === 0) {
      continue
    }

    const rows = data.map(entry.map)
    window.localStorage.setItem(entry.localKey, JSON.stringify(rows))
    synced = true
  }

  return synced
}

export async function upsertRemoteTableRows(table: string, rows: Record<string, unknown>[]) {
  if (!isSupabaseConfigured || !supabase || !rows.length) {
    return null
  }

  const { data, error } = await supabase.from(table).upsert(rows).select()
  if (error) {
    console.error(`Supabase upsert failed for ${table}:`, error)
    return null
  }

  return data
}

export async function insertRemoteTableRow(table: string, row: Record<string, unknown>) {
  if (!isSupabaseConfigured || !supabase) {
    return null
  }

  const { data, error } = await supabase.from(table).insert([row]).select()
  if (error) {
    console.error(`Supabase insert failed for ${table}:`, error)
    return null
  }

  return data?.[0] ?? null
}

export async function updateRemoteTableRow(table: string, id: string, row: Record<string, unknown>) {
  if (!isSupabaseConfigured || !supabase) {
    return null
  }

  const { data, error } = await supabase.from(table).update(row).eq('id', id).select()
  if (error) {
    console.error(`Supabase update failed for ${table}:`, error)
    return null
  }

  return data?.[0] ?? null
}

export async function deleteRemoteTableRow(table: string, id: string) {
  if (!isSupabaseConfigured || !supabase) {
    return false
  }

  const { error } = await supabase.from(table).delete().eq('id', id)
  if (error) {
    console.error(`Supabase delete failed for ${table}:`, error)
    return false
  }

  return true
}
