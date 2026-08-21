import type { Service, ServiceFormValues, ServiceStatus, ServiceSortKey } from './serviceTypes'
import { deleteRemoteTableRow, insertRemoteTableRow, updateRemoteTableRow } from '../../lib/supabaseSync'
import { supabase } from '../../lib/supabase'
import { createUuid } from '../../lib/id'

const SERVICE_STORAGE_KEY = 'plamenco.services'

const seedServices: Service[] = []

function safeParseServices(value: string | null): Service[] | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(value) as Service[]
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function getStoredServices(): Service[] {
  const stored = safeParseServices(window.localStorage.getItem(SERVICE_STORAGE_KEY))
  if (stored?.length) return stored
  window.localStorage.setItem(SERVICE_STORAGE_KEY, JSON.stringify(seedServices))
  return seedServices
}

export function saveStoredServices(services: Service[]) {
  window.localStorage.setItem(SERVICE_STORAGE_KEY, JSON.stringify(services))
  window.dispatchEvent(new CustomEvent('plamenco:services-updated'))
}

export function getServiceById(id: string): Service | undefined {
  return getStoredServices().find((service) => service.id === id)
}

export function getCategories(): string[] {
  return Array.from(new Set(getStoredServices().map((service) => service.category))).sort()
}

/** Service.price is stored as Philippine pesos in the catalogue/editor. */
export function servicePriceToCents(pricePhp: number): number {
  if (!Number.isFinite(pricePhp) || pricePhp <= 0) return 0
  return Math.round(pricePhp * 100)
}

export function formatServicePrice(pricePhp: number): string {
  if (!Number.isFinite(pricePhp) || pricePhp <= 0) return 'Price to confirm'
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 }).format(pricePhp)
}

function remoteRow(service: Service) {
  return {
    id: service.id,
    name: service.name,
    description: service.description,
    duration: service.duration,
    price: service.price,
    category: service.category,
    status: service.status,
  }
}

export function createService(values: ServiceFormValues): Service {
  const services = getStoredServices()
  const now = new Date().toISOString()
  const service: Service = { id: createUuid(), ...values, createdAt: now, updatedAt: now }
  saveStoredServices([...services, service])
  void insertRemoteTableRow('services', remoteRow(service))
  return service
}

export async function createServicePersisted(values: ServiceFormValues): Promise<Service> {
  const services = getStoredServices()
  const now = new Date().toISOString()
  const service: Service = { id: createUuid(), ...values, createdAt: now, updatedAt: now }
  if (supabase) {
    const { data, error } = await supabase.from('services').insert(remoteRow(service)).select('*').single()
    if (error) throw new Error(`Unable to save service to the clinic database: ${error.message}`)
    const confirmed: Service = {
      id: data.id,
      name: data.name ?? service.name,
      description: data.description ?? service.description,
      duration: Number(data.duration ?? service.duration),
      price: Number(data.price ?? service.price),
      category: data.category ?? service.category,
      status: data.status ?? service.status,
      createdAt: data.created_at ?? now,
      updatedAt: data.updated_at ?? data.created_at ?? now,
    }
    saveStoredServices([...services.filter((entry) => entry.id !== confirmed.id), confirmed])
    return confirmed
  }
  saveStoredServices([...services, service])
  return service
}

export function updateService(id: string, values: ServiceFormValues): Service | null {
  const services = getStoredServices()
  const index = services.findIndex((service) => service.id === id)
  if (index === -1) return null

  const updated: Service = { ...services[index], ...values, updatedAt: new Date().toISOString() }
  services[index] = updated
  saveStoredServices(services)
  void updateRemoteTableRow('services', id, remoteRow(updated))
  return updated
}

export async function updateServicePersisted(id: string, values: ServiceFormValues): Promise<Service | null> {
  const services = getStoredServices()
  const current = services.find((service) => service.id === id)
  if (!current) return null
  const now = new Date().toISOString()
  const updated: Service = { ...current, ...values, updatedAt: now }
  if (supabase) {
    const { data, error } = await supabase.from('services').update(remoteRow(updated)).eq('id', id).select('*').single()
    if (error) throw new Error(`Unable to update service in the clinic database: ${error.message}`)
    const confirmed: Service = {
      id: data.id,
      name: data.name ?? updated.name,
      description: data.description ?? updated.description,
      duration: Number(data.duration ?? updated.duration),
      price: Number(data.price ?? updated.price),
      category: data.category ?? updated.category,
      status: data.status ?? updated.status,
      createdAt: data.created_at ?? current.createdAt,
      updatedAt: data.updated_at ?? now,
    }
    saveStoredServices(services.map((entry) => entry.id === id ? confirmed : entry))
    return confirmed
  }
  saveStoredServices(services.map((entry) => entry.id === id ? updated : entry))
  return updated
}

export function deleteService(id: string): boolean {
  const services = getStoredServices()
  const index = services.findIndex((service) => service.id === id)
  if (index === -1) return false
  services.splice(index, 1)
  saveStoredServices(services)
  void deleteRemoteTableRow('services', id)
  return true
}

export function toggleServiceStatus(id: string): Service | null {
  const service = getServiceById(id)
  if (!service) return null
  const newStatus: ServiceStatus = service.status === 'active' ? 'inactive' : 'active'
  return updateService(id, { ...service, status: newStatus })
}

export function searchServices(query: string): Service[] {
  if (!query.trim()) return getStoredServices()
  const lowerQuery = query.toLowerCase()
  return getStoredServices().filter((service) =>
    service.name.toLowerCase().includes(lowerQuery) ||
    service.description.toLowerCase().includes(lowerQuery) ||
    service.category.toLowerCase().includes(lowerQuery),
  )
}

export function filterServices(services: Service[], filters: { status?: ServiceStatus; category?: string }): Service[] {
  return services.filter((service) => {
    if (filters.status && service.status !== filters.status) return false
    if (filters.category && service.category !== filters.category) return false
    return true
  })
}

export function sortServices(services: Service[], key: ServiceSortKey, direction: 'asc' | 'desc' = 'asc'): Service[] {
  return [...services].sort((a, b) => {
    const aValue = a[key]
    const bValue = b[key]
    if (typeof aValue === 'string') return direction === 'asc' ? aValue.localeCompare(bValue as string) : (bValue as string).localeCompare(aValue)
    return direction === 'asc' ? (aValue as number) - (bValue as number) : (bValue as number) - (aValue as number)
  })
}

export function paginateServices(services: Service[], page: number, pageSize = 10) {
  const start = (page - 1) * pageSize
  return services.slice(start, start + pageSize)
}

export async function loadServicesFromSupabase(options: { strict?: boolean } = {}): Promise<Service[]> {
  if (!supabase) return getStoredServices()
  try {
    const { data, error } = await supabase.from('services').select('*').order('name', { ascending: true })
    if (error) {
      console.error('[service load error]', error)
      if (options.strict) throw new Error(`Unable to load clinic services: ${error.message}`)
      return getStoredServices()
    }
    if (!data) return getStoredServices()
    const supabaseServices: Service[] = data.map((row: any) => ({
      id: row.id,
      name: row.name ?? '',
      description: row.description ?? '',
      duration: Number(row.duration ?? 30),
      price: Number(row.price ?? 0),
      category: row.category ?? 'General',
      status: row.status ?? 'active',
      createdAt: row.created_at ?? new Date().toISOString(),
      updatedAt: row.updated_at ?? row.created_at ?? new Date().toISOString(),
    }))
    saveStoredServices(supabaseServices)
    return supabaseServices
  } catch (error) {
    console.error('[service load exception]', error)
    if (options.strict) throw error
    return getStoredServices()
  }
}

export { SERVICE_STORAGE_KEY }
