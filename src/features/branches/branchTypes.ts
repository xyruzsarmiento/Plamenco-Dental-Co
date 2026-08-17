export type BranchStatus = 'active' | 'inactive'

export type Branch = {
  id: string
  name: string
  code: string
  address: string
  city: string
  province: string
  phone: string
  email: string
  openingTime: string
  closingTime: string
  status: BranchStatus
  createdAt: string
  updatedAt: string
}

export type BranchFormValues = Omit<Branch, 'id' | 'code' | 'createdAt' | 'updatedAt'>
