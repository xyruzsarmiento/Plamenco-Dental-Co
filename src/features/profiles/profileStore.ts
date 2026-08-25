import { cachedQuery, invalidateQueryTags, queryCachePolicy, setCachedQuery } from '../../lib/queryCache'
import { supabase } from '../../lib/supabase'
import type { UserRole } from '../auth/authTypes'

export const INTERNAL_AVATAR_BUCKET = 'internal-avatars'
export const INTERNAL_AVATAR_MAX_BYTES = 2 * 1024 * 1024
export const INTERNAL_AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp']

export type InternalProfile = {
  id: string
  fullName: string
  email: string
  phone: string
  role: UserRole
  status: string
  jobTitle: string
  address: string
  avatarPath: string
  createdAt: string
  updatedAt: string
}

export type DentistProfessionalProfile = {
  id: string
  displayName: string
  role: string
  email: string
  phone: string
  specialization: string
  licenseNumber: string
  bio: string
  photoUrl: string
  status: string
}

type ProfileRow = {
  id: string
  full_name: string | null
  email: string | null
  phone?: string | null
  role: string | null
  status: string | null
  job_title?: string | null
  address?: string | null
  avatar_url?: string | null
  created_at?: string | null
  updated_at?: string | null
}

function mapProfile(row: ProfileRow): InternalProfile {
  return {
    id: row.id,
    fullName: row.full_name ?? '',
    email: row.email ?? '',
    phone: row.phone ?? '',
    role: (row.role ?? 'staff') as UserRole,
    status: row.status ?? 'active',
    jobTitle: row.job_title ?? '',
    address: row.address ?? '',
    avatarPath: row.avatar_url ?? '',
    createdAt: row.created_at ?? '',
    updatedAt: row.updated_at ?? '',
  }
}

function mapProvider(row: Record<string, unknown>): DentistProfessionalProfile {
  return {
    id: String(row.id ?? ''),
    displayName: String(row.display_name ?? ''),
    role: String(row.role ?? ''),
    email: String(row.email ?? ''),
    phone: String(row.phone ?? ''),
    specialization: String(row.specialization ?? ''),
    licenseNumber: String(row.license_number ?? ''),
    bio: String(row.bio ?? ''),
    photoUrl: String(row.photo_url ?? ''),
    status: String(row.status ?? ''),
  }
}

function profileScope(profileId: string) {
  return `user:${profileId}`
}

function cacheProfile(profile: InternalProfile) {
  setCachedQuery(`profile:${profile.id}`, profile, {
    ...queryCachePolicy.moderate,
    tags: ['profile', `profile:${profile.id}`],
    scope: profileScope(profile.id),
  })
}

export function getInitials(name: string, email = '') {
  const source = name.trim() || email.trim()
  const parts = source.split(/[\s@._-]+/).filter(Boolean)
  return parts.slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join('') || 'U'
}

export function getAvatarDisplayUrl(path: string) {
  if (!path) return ''
  if (/^(https?:|data:|blob:)/i.test(path)) return path
  if (!supabase) return ''
  return supabase.storage.from(INTERNAL_AVATAR_BUCKET).getPublicUrl(path).data.publicUrl
}

export function validateAvatarFile(file: File) {
  if (!INTERNAL_AVATAR_TYPES.includes(file.type)) return 'Upload a JPG, PNG, or WebP image.'
  if (file.size > INTERNAL_AVATAR_MAX_BYTES) return 'Profile photo must be 2 MB or smaller.'
  return ''
}

export async function loadOwnInternalProfile(profileId: string, options: { force?: boolean } = {}) {
  if (!supabase) throw new Error('Supabase is not configured.')

  return cachedQuery(
    `profile:${profileId}`,
    async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, phone, role, status, job_title, address, avatar_url, created_at, updated_at')
        .eq('id', profileId)
        .maybeSingle()

      if (error) throw new Error(error.message)
      if (!data) throw new Error('Profile could not be found for this account.')
      return mapProfile(data as ProfileRow)
    },
    {
      ...queryCachePolicy.moderate,
      tags: ['profile', `profile:${profileId}`],
      scope: profileScope(profileId),
      force: options.force,
    },
  )
}

export async function loadDentistProfessionalProfile(profileId: string, options: { force?: boolean } = {}) {
  if (!supabase) return null

  return cachedQuery(
    `dentist-professional:${profileId}`,
    async () => {
      const { data, error } = await supabase
        .from('providers')
        .select('id, display_name, role, email, phone, specialization, license_number, bio, photo_url, status')
        .eq('profile_id', profileId)
        .maybeSingle()

      if (error) throw new Error(error.message)
      return data ? mapProvider(data as Record<string, unknown>) : null
    },
    {
      ...queryCachePolicy.moderate,
      tags: ['profile', 'providers', `profile:${profileId}`],
      scope: profileScope(profileId),
      force: options.force,
    },
  )
}

export async function updateOwnInternalProfile(
  profileId: string,
  values: Pick<InternalProfile, 'fullName' | 'phone' | 'jobTitle' | 'address'>,
) {
  if (!supabase) throw new Error('Supabase is not configured.')

  const { data, error } = await supabase
    .from('profiles')
    .update({
      full_name: values.fullName.trim(),
      phone: values.phone.trim(),
      job_title: values.jobTitle.trim(),
      address: values.address.trim(),
    })
    .eq('id', profileId)
    .select('id, full_name, email, phone, role, status, job_title, address, avatar_url, created_at, updated_at')
    .single()

  if (error) throw new Error(error.message)
  const profile = mapProfile(data as ProfileRow)
  invalidateQueryTags(['profile', `profile:${profileId}`], profileScope(profileId))
  cacheProfile(profile)
  return profile
}

export async function syncOwnInternalProfileEmail(profileId: string, email: string) {
  if (!supabase) throw new Error('Supabase is not configured.')

  const { data, error } = await supabase
    .from('profiles')
    .update({ email: email.trim().toLowerCase() })
    .eq('id', profileId)
    .select('id, full_name, email, phone, role, status, job_title, address, avatar_url, created_at, updated_at')
    .single()

  if (error) throw new Error(error.message)
  const profile = mapProfile(data as ProfileRow)
  invalidateQueryTags(['profile', `profile:${profileId}`], profileScope(profileId))
  cacheProfile(profile)
  return profile
}

export async function uploadOwnAvatar(profileId: string, file: File, previousPath = '') {
  if (!supabase) throw new Error('Supabase is not configured.')

  const validationError = validateAvatarFile(file)
  if (validationError) throw new Error(validationError)

  const extension = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
  const objectPath = `${profileId}/${Date.now()}-${crypto.randomUUID()}.${extension}`

  const uploadResult = await supabase.storage.from(INTERNAL_AVATAR_BUCKET).upload(objectPath, file, {
    cacheControl: '3600',
    contentType: file.type,
    upsert: false,
  })
  if (uploadResult.error) throw new Error(uploadResult.error.message)

  const updateResult = await supabase
    .from('profiles')
    .update({ avatar_url: objectPath })
    .eq('id', profileId)
    .select('id, full_name, email, phone, role, status, job_title, address, avatar_url, created_at, updated_at')
    .single()

  if (updateResult.error) {
    await supabase.storage.from(INTERNAL_AVATAR_BUCKET).remove([objectPath])
    throw new Error(updateResult.error.message)
  }

  if (previousPath && previousPath !== objectPath && !/^(https?:|data:|blob:)/i.test(previousPath)) {
    await supabase.storage.from(INTERNAL_AVATAR_BUCKET).remove([previousPath])
  }

  const profile = mapProfile(updateResult.data as ProfileRow)
  invalidateQueryTags(['profile', `profile:${profileId}`], profileScope(profileId))
  cacheProfile(profile)
  return profile
}
