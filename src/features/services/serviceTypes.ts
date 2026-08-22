export type ServiceStatus = 'active' | 'inactive'

export type Service = {
  id: string
  name: string
  description: string
  duration: number
  price: number
  category: string
  status: ServiceStatus
  branchIds?: string[]
  onlineBookable?: boolean
  internalOnly?: boolean
  showOnWebsite?: boolean
  imageUrl?: string
  createdAt: string
  updatedAt: string
}

export type ServiceFormValues = Omit<Service, 'id' | 'createdAt' | 'updatedAt'>

export type ServiceSortKey = 'name' | 'category' | 'price' | 'duration'
