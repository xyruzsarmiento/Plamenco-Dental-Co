import { useMemo, useState } from 'react'
import { Calendar, FileText, Pill, Plus, Stethoscope, User } from 'lucide-react'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import {
  getInvoicesByPatient,
  getOutstandingBalanceByPatient,
  getPaymentsByPatient,
} from '../billing/billingStore'
import {
  createDocument,
  deleteDentalImage,
  deleteDocument,
  getDentalImagesByPatient,
  getDocumentsByPatient,
} from '../documents/documentStore'
import { DocumentList, DocumentUploadPanel } from '../documents/DocumentUploadPanel'
import { PrescriptionForm } from '../prescriptions/PrescriptionForm'
import { createPrescription, getPrescriptionsByPatient } from '../prescriptions/prescriptionStore'
import { DentalRecordList } from '../dentalRecords/DentalRecordList'
import { getDentalRecordsByPatientId } from '../dentalRecords/dentalRecordStore'
import { TreatmentList } from '../treatments/TreatmentList'
import { TreatmentPlanCard } from '../treatments/TreatmentPlanCard'
import { getStoredTreatmentPlans, getTreatmentsByPatient } from '../treatments/treatmentStore'
import type { Patient } from './patientTypes'

type PatientProfileProps = {
  patient: Patient
  onEdit: () => void
  onClose: () => void
  onBookAppointment: () => void
  onAddDentalRecord: () => void
  onAddTreatment: () => void
  onRecordPayment: () => void
}

type TabKey = 'overview' | 'appointments' | 'dentalRecords' | 'treatments' | 'payments' | 'documents' | 'prescriptions'

const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: 'overview', label: 'Overview', icon: <User size={16} /> },
  { key: 'appointments', label: 'Appointments', icon: <Calendar size={16} /> },
  { key: 'dentalRecords', label: 'Dental Records', icon: <Stethoscope size={16} /> },
  { key: 'treatments', label: 'Treatments', icon: <FileText size={16} /> },
  { key: 'payments', label: 'Payments', icon: <FileText size={16} /> },
  { key: 'documents', label: 'Documents', icon: <FileText size={16} /> },
  { key: 'prescriptions', label: 'Prescriptions', icon: <Pill size={16} /> },
]

function getAge(dateOfBirth: string): number {
  const today = new Date()
  const birthDate = new Date(dateOfBirth)
  let age = today.getFullYear() - birthDate.getFullYear()
  const monthDiff = today.getMonth() - birthDate.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--
  }
  return age
}

function formatCurrency(cents: number) {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
  }).format(cents / 100)
}

export function PatientProfile({
  onAddDentalRecord,
  onAddTreatment,
  onBookAppointment,
  onClose,
  onEdit,
  onRecordPayment,
  patient,
}: PatientProfileProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('overview')

  const dentalRecords = useMemo(() => getDentalRecordsByPatientId(patient.patientId), [patient.patientId])
  const treatments = useMemo(() => getTreatmentsByPatient(patient.patientId), [patient.patientId])
  const treatmentPlans = useMemo(() => getStoredTreatmentPlans().filter((plan) => plan.patientId === patient.patientId), [patient.patientId])
  const invoices = useMemo(() => getInvoicesByPatient(patient.patientId), [patient.patientId])
  const payments = useMemo(() => getPaymentsByPatient(patient.patientId), [patient.patientId])
  const documents = useMemo(() => getDocumentsByPatient(patient.patientId), [patient.patientId])
  const dentalImages = useMemo(() => getDentalImagesByPatient(patient.patientId), [patient.patientId])
  const prescriptions = useMemo(() => getPrescriptionsByPatient(patient.patientId), [patient.patientId])
  const outstandingBalance = useMemo(() => getOutstandingBalanceByPatient(patient.patientId), [patient.patientId])
  const fullName = `${patient.firstName}${patient.middleName ? ` ${patient.middleName}` : ''} ${patient.lastName}`

  return (
    <div className="patient-profile premium-profile-shell">
      <div className="profile-header premium-profile-header">
        <div className="profile-header-content">
          <div className="profile-title-wrap">
            <p className="eyebrow">Patient Profile</p>
            <h1>{fullName}</h1>
            <div className="profile-meta">
              <span className="patient-id">{patient.patientId}</span>
              <span className="patient-age">{getAge(patient.dateOfBirth)} years old</span>
              <Badge tone={patient.status === 'active' ? 'success' : 'warning'}>
                {patient.status.charAt(0).toUpperCase() + patient.status.slice(1)}
              </Badge>
            </div>
          </div>
          <div className="profile-actions">
            <Button variant="secondary" onClick={onEdit}>
              Edit
            </Button>
            <Button onClick={onClose} variant="ghost">
              Close
            </Button>
          </div>
        </div>

        <div className="patient-metrics">
          <div className="metric-slab">
            <span>Last visit</span>
            <strong>{dentalRecords[0] ? new Date(dentalRecords[0].recordDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</strong>
          </div>
          <div className="metric-slab">
            <span>Active treatment</span>
            <strong>{treatments.filter((treatment) => treatment.status !== 'completed').length || 0}</strong>
          </div>
          <div className="metric-slab">
            <span>Outstanding</span>
            <strong>{formatCurrency(outstandingBalance)}</strong>
          </div>
        </div>
      </div>

      <div className="profile-quick-actions">
        <Button size="sm" onClick={onBookAppointment} icon={<Calendar size={16} />}>
          Book Appointment
        </Button>
        <Button size="sm" onClick={onAddDentalRecord} icon={<Plus size={16} />}>
          Add Dental Record
        </Button>
        <Button size="sm" onClick={onAddTreatment} icon={<Plus size={16} />}>
          Add Treatment
        </Button>
        <Button size="sm" onClick={onRecordPayment} icon={<Plus size={16} />}>
          Record Payment
        </Button>
      </div>

      <div className="tabs">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`tab ${activeTab === tab.key ? 'is-active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      <div className="profile-content">
        {activeTab === 'overview' && (
          <div className="tab-content">
            <div className="profile-section">
              <h3>Contact Information</h3>
              <div className="info-grid">
                <div className="info-item">
                  <span className="label">Phone</span>
                  <span className="value">{patient.phone}</span>
                </div>
                <div className="info-item">
                  <span className="label">Email</span>
                  <span className="value">{patient.email}</span>
                </div>
                <div className="info-item">
                  <span className="label">Address</span>
                  <span className="value">{patient.address}</span>
                </div>
              </div>
            </div>

            <div className="profile-section">
              <h3>Emergency Contact</h3>
              <div className="info-grid">
                <div className="info-item">
                  <span className="label">Contact Name</span>
                  <span className="value">{patient.emergencyContact}</span>
                </div>
                <div className="info-item">
                  <span className="label">Phone</span>
                  <span className="value">{patient.emergencyContactPhone}</span>
                </div>
              </div>
            </div>

            <div className="profile-section">
              <h3>Medical Information</h3>
              <div className="info-grid info-grid-full">
                <div className="info-item">
                  <span className="label">Allergies</span>
                  <span className="value">{patient.allergies || 'None reported'}</span>
                </div>
                <div className="info-item">
                  <span className="label">Medical Conditions</span>
                  <span className="value">{patient.medicalConditions || 'None reported'}</span>
                </div>
                <div className="info-item">
                  <span className="label">Current Medications</span>
                  <span className="value">{patient.currentMedications || 'None'}</span>
                </div>
                <div className="info-item">
                  <span className="label">Previous Surgeries</span>
                  <span className="value">{patient.previousSurgeries || 'None'}</span>
                </div>
                <div className="info-item">
                  <span className="label">Medical Notes</span>
                  <span className="value">{patient.medicalNotes || 'No notes'}</span>
                </div>
              </div>
            </div>

            <div className="profile-section">
              <h3>Additional Information</h3>
              <div className="info-grid">
                <div className="info-item">
                  <span className="label">Date of Birth</span>
                  <span className="value">{new Date(patient.dateOfBirth).toLocaleDateString()}</span>
                </div>
                <div className="info-item">
                  <span className="label">Sex</span>
                  <span className="value">{patient.sex.charAt(0).toUpperCase() + patient.sex.slice(1)}</span>
                </div>
                <div className="info-item">
                  <span className="label">Registration Date</span>
                  <span className="value">{new Date(patient.registrationDate).toLocaleDateString()}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'appointments' && (
          <div className="tab-content">
            <EmptyState
              title="No appointments"
              message="This patient does not have any appointments yet."
              action={<Button onClick={onBookAppointment}>Book Appointment</Button>}
            />
          </div>
        )}

        {activeTab === 'dentalRecords' && (
          <div className="tab-content">
            {dentalRecords.length === 0 ? (
              <EmptyState
                title="No dental records"
                message="This patient does not have any dental records yet."
                action={<Button onClick={onAddDentalRecord}>Add Dental Record</Button>}
              />
            ) : (
              <>
                <div className="profile-section">
                  <h3>Visit history</h3>
                  <DentalRecordList records={dentalRecords} onDelete={() => undefined} onEdit={() => undefined} />
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === 'treatments' && (
          <div className="tab-content">
            {treatmentPlans.length === 0 && treatments.length === 0 ? (
              <EmptyState
                title="No treatments"
                message="This patient does not have any recorded treatments yet."
                action={<Button onClick={onAddTreatment}>Add Treatment</Button>}
              />
            ) : (
              <>
                {treatmentPlans.length > 0 && (
                  <div className="profile-section">
                    <h3>Active treatment plans</h3>
                    {treatmentPlans.map((plan) => (
                      <TreatmentPlanCard key={plan.id} plan={plan} treatments={treatments} />
                    ))}
                  </div>
                )}

                {treatments.length > 0 && (
                  <div className="profile-section">
                    <h3>Treatment history</h3>
                    <TreatmentList treatments={treatments} />
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {activeTab === 'payments' && (
          <div className="tab-content">
            <div className="profile-section">
              <h3>Outstanding balance</h3>
              <div className="info-grid">
                <div className="info-item">
                  <span className="label">Current balance</span>
                  <span className="value">{formatCurrency(outstandingBalance)}</span>
                </div>
              </div>
            </div>

            <div className="profile-section">
              <h3>Invoice history</h3>
              {invoices.length === 0 ? (
                <EmptyState title="No invoices" message="This patient does not have any invoices yet." />
              ) : (
                <div className="history-list">
                  {invoices.map((invoice) => (
                    <div key={invoice.id} className="history-item">
                      <div>
                        <strong>{invoice.invoiceNumber}</strong>
                        <span>{new Date(invoice.invoiceDate).toLocaleDateString()}</span>
                      </div>
                      <div>
                        <strong>{formatCurrency(invoice.totalCents)}</strong>
                        <span>Balance {formatCurrency(invoice.balanceCents)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="profile-section">
              <h3>Payment history</h3>
              {payments.length === 0 ? (
                <EmptyState title="No payments" message="This patient does not have any recorded payments yet." />
              ) : (
                <div className="history-list">
                  {payments.map((payment) => (
                    <div key={payment.id} className="history-item">
                      <div>
                        <strong>{payment.paymentMethod}</strong>
                        <span>{new Date(payment.date).toLocaleDateString()}</span>
                      </div>
                      <div>
                        <strong>{formatCurrency(payment.amountCents)}</strong>
                        <span>{payment.referenceNumber || 'No reference'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'documents' && (
          <div className="tab-content">
            <DocumentUploadPanel
              patientId={patient.patientId}
              onUpload={({ patientId, fileName, fileType, category, uploadedBy, content }) => {
                createDocument({
                  patientId,
                  fileName,
                  fileType,
                  category,
                  uploadedBy,
                  content,
                })
              }}
            />

            {documents.length === 0 ? (
              <EmptyState title="No documents" message="This patient does not have any uploaded documents yet." />
            ) : (
              <div className="profile-section">
                <h3>Patient files</h3>
                <DocumentList
                  documents={documents}
                  onDelete={(documentId) => deleteDocument(documentId)}
                />
              </div>
            )}

            <div className="profile-section">
              <h3>Dental images</h3>
              {dentalImages.length === 0 ? (
                <EmptyState title="No dental images" message="This patient does not have any dental images yet." />
              ) : (
                <div className="image-grid">
                  {dentalImages.map((image) => (
                    <div key={image.id} className="image-card">
                      <img src={image.content} alt={image.fileName} />
                      <div className="image-meta">
                        <strong>{image.kind}</strong>
                        <span>{image.fileName}</span>
                        <button type="button" onClick={() => deleteDentalImage(image.id)}>Delete</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'prescriptions' && (
          <div className="tab-content">
            <div className="profile-section">
              <h3>New prescription</h3>
              <PrescriptionForm
                values={{
                  medication: '',
                  dosage: '',
                  frequency: '',
                  duration: '',
                  instructions: '',
                  prescribedBy: 'Dr. Santos',
                }}
                onChange={() => undefined}
                onSubmit={() => {
                  createPrescription({
                    patientId: patient.patientId,
                    medication: '',
                    dosage: '',
                    frequency: '',
                    duration: '',
                    instructions: '',
                    prescribedBy: 'Dr. Santos',
                  })
                }}
                onPrint={() => undefined}
              />
            </div>

            {prescriptions.length === 0 ? (
              <EmptyState title="No prescriptions" message="This patient does not have any recorded prescriptions yet." />
            ) : (
              <div className="profile-section">
                <h3>Prescription history</h3>
                <div className="prescription-list">
                  {prescriptions.map((prescription) => (
                    <article key={prescription.id} className="prescription-card">
                      <div className="prescription-header">
                        <div>
                          <strong>{prescription.medication}</strong>
                          <span>{prescription.dosage}</span>
                        </div>
                        <button
                          type="button"
                          className="icon-button"
                          onClick={() => {
                            const printWindow = window.open('', '_blank', 'width=720,height=900')
                            if (!printWindow) return

                            printWindow.document.write(`
                              <html>
                                <head>
                                  <title>Prescription</title>
                                  <style>body{font-family:sans-serif;margin:32px;color:#172126}h2{margin-bottom:12px}.line{margin:8px 0}</style>
                                </head>
                                <body>
                                  <h2>Plamenco Dental Co</h2>
                                  <div class="line"><strong>Medication:</strong> ${prescription.medication}</div>
                                  <div class="line"><strong>Dosage:</strong> ${prescription.dosage}</div>
                                  <div class="line"><strong>Frequency:</strong> ${prescription.frequency}</div>
                                  <div class="line"><strong>Duration:</strong> ${prescription.duration}</div>
                                  <div class="line"><strong>Instructions:</strong> ${prescription.instructions}</div>
                                  <div class="line"><strong>Prescribed by:</strong> ${prescription.prescribedBy}</div>
                                  <div class="line"><strong>Date:</strong> ${prescription.prescriptionDate}</div>
                                </body>
                              </html>
                            `)
                            printWindow.document.close()
                            printWindow.focus()
                            printWindow.print()
                          }}
                        >
                          Print
                        </button>
                      </div>
                      <p>{prescription.frequency}</p>
                      <small>{prescription.duration}</small>
                      <p>{prescription.instructions}</p>
                    </article>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
