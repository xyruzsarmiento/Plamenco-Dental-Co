type CacheEntry<T> = {
  value?: T
  updatedAt: number
  promise?: Promise<T>
  staleTime: number
  gcTime: number
  tags: Set<string>
  scope: string
}

type QueryOptions = {
  staleTime?: number
  gcTime?: number
  tags?: string[]
  scope?: string
  force?: boolean
}

const DEFAULT_STALE_TIME = 30_000
const DEFAULT_GC_TIME = 5 * 60_000
const entries = new Map<string, CacheEntry<unknown>>()

function now() {
  return Date.now()
}

function normalizeScope(scope?: string) {
  return scope?.trim() || 'public'
}

function getEntryKey(key: string, scope?: string) {
  return `${normalizeScope(scope)}::${key}`
}

function scheduleGc(entryKey: string, expectedUpdatedAt: number, gcTime: number) {
  if (typeof window === 'undefined') return
  window.setTimeout(() => {
    const current = entries.get(entryKey)
    if (!current) return
    if (current.updatedAt !== expectedUpdatedAt) return
    if (current.promise) return
    if (now() - current.updatedAt >= gcTime) entries.delete(entryKey)
  }, gcTime + 50)
}

export async function cachedQuery<T>(key: string, queryFn: () => Promise<T>, options: QueryOptions = {}): Promise<T> {
  const staleTime = options.staleTime ?? DEFAULT_STALE_TIME
  const gcTime = options.gcTime ?? DEFAULT_GC_TIME
  const scope = normalizeScope(options.scope)
  const entryKey = getEntryKey(key, scope)
  const existing = entries.get(entryKey) as CacheEntry<T> | undefined
  const age = existing ? now() - existing.updatedAt : Number.POSITIVE_INFINITY

  if (!options.force && existing?.value !== undefined && age < staleTime) return existing.value
  if (existing?.promise) return existing.promise

  const queryPromise = queryFn()
    .then((value) => {
      const updatedAt = now()
      const next: CacheEntry<T> = {
        value,
        updatedAt,
        staleTime,
        gcTime,
        tags: new Set(options.tags ?? existing?.tags ?? []),
        scope,
      }
      entries.set(entryKey, next)
      scheduleGc(entryKey, updatedAt, gcTime)
      return value
    })
    .catch((error) => {
      const current = entries.get(entryKey) as CacheEntry<T> | undefined
      if (current?.value !== undefined) {
        entries.set(entryKey, { ...current, promise: undefined })
      } else {
        entries.delete(entryKey)
      }
      throw error
    })

  entries.set(entryKey, {
    value: existing?.value,
    updatedAt: existing?.updatedAt ?? 0,
    promise: queryPromise,
    staleTime,
    gcTime,
    tags: new Set(options.tags ?? existing?.tags ?? []),
    scope,
  })

  return queryPromise
}

export function readCachedQuery<T>(key: string, scope?: string): T | undefined {
  return (entries.get(getEntryKey(key, scope)) as CacheEntry<T> | undefined)?.value
}

export function setCachedQuery<T>(key: string, value: T, options: QueryOptions = {}) {
  const staleTime = options.staleTime ?? DEFAULT_STALE_TIME
  const gcTime = options.gcTime ?? DEFAULT_GC_TIME
  const scope = normalizeScope(options.scope)
  const updatedAt = now()
  const entryKey = getEntryKey(key, scope)
  entries.set(entryKey, {
    value,
    updatedAt,
    staleTime,
    gcTime,
    tags: new Set(options.tags ?? []),
    scope,
  })
  scheduleGc(entryKey, updatedAt, gcTime)
}

export function invalidateQuery(key: string, scope?: string) {
  entries.delete(getEntryKey(key, scope))
}

export function invalidateQueryPrefix(prefix: string, scope?: string) {
  const normalized = normalizeScope(scope)
  for (const [entryKey, entry] of entries) {
    if (entry.scope !== normalized) continue
    const key = entryKey.slice(entryKey.indexOf('::') + 2)
    if (key.startsWith(prefix)) entries.delete(entryKey)
  }
}

export function invalidateQueryTags(tags: string[], scope?: string) {
  const wanted = new Set(tags)
  const normalized = scope ? normalizeScope(scope) : null
  for (const [entryKey, entry] of entries) {
    if (normalized && entry.scope !== normalized) continue
    if ([...entry.tags].some((tag) => wanted.has(tag))) entries.delete(entryKey)
  }
}

export function clearQueryScope(scope: string) {
  const normalized = normalizeScope(scope)
  for (const [entryKey, entry] of entries) {
    if (entry.scope === normalized) entries.delete(entryKey)
  }
}

export function clearAllQueryCache() {
  entries.clear()
}

export function getQueryCacheStats() {
  return {
    entries: entries.size,
    scopes: [...new Set([...entries.values()].map((entry) => entry.scope))],
  }
}

export const queryCachePolicy = {
  stable: { staleTime: 5 * 60_000, gcTime: 30 * 60_000 },
  moderate: { staleTime: 60_000, gcTime: 10 * 60_000 },
  frequent: { staleTime: 15_000, gcTime: 2 * 60_000 },
} as const
