import type { CacheMeta } from '../domain'

export const combineCacheMeta = (...signals: Array<CacheMeta | undefined>): CacheMeta => {
  const filtered = signals.filter((signal): signal is CacheMeta => Boolean(signal))
  if (!filtered.length) {
    return {
      hit: false,
    }
  }

  const allHits = filtered.every((signal) => signal.hit)
  const maxAgeCandidates = filtered
    .map((signal) => signal.maxAge)
    .filter((value): value is number => typeof value === 'number')
  const staleCandidates = filtered
    .map((signal) => signal.staleWhileRevalidate)
    .filter((value): value is number => typeof value === 'number')

  return {
    hit: allHits,
    maxAge: maxAgeCandidates.length ? Math.min(...maxAgeCandidates) : undefined,
    staleWhileRevalidate: staleCandidates.length ? Math.min(...staleCandidates) : undefined,
  }
}

export interface CacheStats {
  hits: number
  staleHits: number
  misses: number
  writes: number
  evictions: number
  revalidations: number
  errors: number
}

const stats: CacheStats = {
  hits: 0,
  staleHits: 0,
  misses: 0,
  writes: 0,
  evictions: 0,
  revalidations: 0,
  errors: 0,
}

export const recordCacheHit = (stale = false): void => {
  if (stale) {
    stats.staleHits += 1
  } else {
    stats.hits += 1
  }
}

export const recordCacheMiss = (): void => {
  stats.misses += 1
}

export const recordCacheWrite = (): void => {
  stats.writes += 1
}

export const recordCacheEviction = (): void => {
  stats.evictions += 1
}

export const recordCacheRevalidation = (): void => {
  stats.revalidations += 1
}

export const recordCacheError = (): void => {
  stats.errors += 1
}

export const snapshotCacheStats = (): CacheStats => ({ ...stats })

export const resetCacheStats = (): void => {
  stats.hits = 0
  stats.staleHits = 0
  stats.misses = 0
  stats.writes = 0
  stats.evictions = 0
  stats.revalidations = 0
  stats.errors = 0
}
