import type { Service, ServiceFormValues, ServiceStatus, ServiceSortKey } from './serviceTypes'
import { insertRemoteTableRow, updateRemoteTableRow } from '../../lib/supabaseSync'
import { supabase } from '../../lib/supabase'

const SERVICE_STORAGE_KEY = 'plamenco.services'

const seedServices: Service[] = []

function safeParseServices(value: string | null): Service[] | null {
  if (!value) {
    return null
  }

  try {
    const parsed = JSON.parse(value) as Service[]
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function getStoredServices(): Service[] {
  const stored = safeParseServices(window.localStorage.getItem(SERVICE_STORAGE_KEY))

  if (stored?.length) {
    return stored
  }

  window.localStorage.setItem(SERVICE_STORAGE_KEY, JSON.stringify(seedServices))
  return seedServices
}

export function saveStoredServices(services: Service[]) {
  window.localStorage.setItem(SERVICE_STORAGE_KEY, JSON.stringify(services))
}

export function getServiceById(id: string): Service | undefined {
  return getStoredServices().find((service) => service.id === id)
}

export function getCategories(): string[] {
  const services = getStoredServices()
  const categories = new Set(services.map((s) => s.category))
  return Array.from(categories).sort()
}

export function createService(values: ServiceFormValues): Service {
  const services = getStoredServices()
  const now = new Date().toISOString()
  const id = `service-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

  const service: Service = {
    id,
    ...values,
    createdAt: now,
    updatedAt: now,
  }

  services.push(service)
  saveStoredServices(services)
  
  // Persist to Supabase asynchronously
  void insertRemoteTableRow('services', {
    id: service.id,
    name: service.name,
    description: service.description,
    duration: service.duration,
    price: service.price,
    category: service.category,
    status: service.status,
  })
  
  return service
}

export function updateService(id: string, values: ServiceFormValues): Service | null {
  const services = getStoredServices()
  const index = services.findIndex((s) => s.id === id)

  if (index === -1) {
    return null
  }

  const now = new Date().toISOString()
  const updated: Service = {
    ...services[index],
    ...values,
    updatedAt: now,
  }

  services[index] = updated
  saveStoredServices(services)
  
  // Persist to Supabase asynchronously
  void updateRemoteTableRow('services', id, {
    name: updated.name,
    description: updated.description,
    duration: updated.duration,
    price: updated.price,
    category: updated.category,
    status: updated.status,
  })
  
  return updated
}

export function deleteService(id: string): boolean {
  const services = getStoredServices()
  const index = services.findIndex((s) => s.id === id)

  if (index === -1) {
    return false
  }

  services.splice(index, 1)
  saveStoredServices(services)
  return true
}

export function toggleServiceStatus(id: string): Service | null {
  const service = getServiceById(id)
  if (!service) return null

  const newStatus: ServiceStatus = service.status === 'active' ? 'inactive' : 'active'
  return updateService(id, { ...service, status: newStatus })
}

export function searchServices(query: string): Service[] {
  if (!query.trim()) {
    return getStoredServices()
  }

  const lowerQuery = query.toLowerCase()
  return getStoredServices().filter(
    (s) =>
      s.name.toLowerCase().includes(lowerQuery) ||
      s.description.toLowerCase().includes(lowerQuery) ||
      s.category.toLowerCase().includes(lowerQuery)
  )
}

export function filterServices(
  services: Service[],
  filters: { status?: ServiceStatus; category?: string }
): Service[] {
  return services.filter((s) => {
    if (filters.status && s.status !== filters.status) return false
    if (filters.category && s.category !== filters.category) return false
    return true
  })
}

export function sortServices(
  services: Service[],
  key: ServiceSortKey,
  direction: 'asc' | 'desc' = 'asc'
): Service[] {
  const sorted = [...services].sort((a, b) => {
    const aValue = a[key]
    const bValue = b[key]

    if (typeof aValue === 'string') {
      return direction === 'asc'
        ? aValue.localeCompare(bValue as string)
        : (bValue as string).localeCompare(aValue)
    }

    const numA = aValue as number
    const numB = bValue as number
    return direction === 'asc' ? numA - numB : numB - numA
  })

  return sorted
}

export function paginateServices(services: Service[], page: number, pageSize: number = 10) {
  const start = (page - 1) * pageSize
  const end = start + pageSize
  return services.slice(start, end)
}

export async function loadServicesFromSupabase(): Promise<Service[]> {
  if (!supabase) {
    return getStoredServices()
  }

  try {
    const { data, error } = await supabase
      .from('services')
      .select('*')
      .eq('status', 'active')
      .order('name', { ascending: true })

    if (error) {
      console.error('[service load error]', error)
      return getStoredServices()
    }

    if (!data || data.length === 0) {
      return getStoredServices()
    }

    const supabaseServices: Service[] = data.map((row: any) => ({
      id: row.id,
      name: row.name ?? '',
      description: row.description ?? '',
      duration: row.duration ?? 30,
      price: row.price ?? 0,
      category: row.category ?? 'General',
      status: row.status ?? 'active',
      createdAt: row.created_at ?? new Date().toISOString(),
      updatedAt: row.updated_at ?? row.created_at ?? new Date().toISOString(),
    }))

    // Cache Supabase services in localStorage
    saveStoredServices(supabaseServices)
    return supabaseServices
  } catch (error) {
    console.error('[service load exception]', error)
    return getStoredServices()
  }
}

export { SERVICE_STORAGE_KEY }
