import type { CacheMeta } from '../domain'
import { env } from '../env'
import { InMemoryCacheStore, type CacheRecord, type CacheStore } from './store'
import {
  recordCacheError,
  recordCacheEviction,
  recordCacheHit,
  recordCacheMiss,
  recordCacheRevalidation,
  recordCacheWrite,
} from './metrics'

/**
 * Options accepted by {@link CacheManager.fetch} when retrieving a value.
 *
 * @template T Value type returned by the associated loader.
 */
export interface CacheFetchOptions<T> {
  /**
   * Unique cache key. The cache store implementation is responsible for any
   * namespacing or prefixing that should be applied.
   */
  key: string
  /**
   * Async loader invoked on cache miss (or during revalidation). The promise
   * result is stored and returned to callers.
   */
  loader: () => Promise<T>
  /**
   * Time-to-live in milliseconds for the fresh value. When expired, the value
   * is removed unless `staleWhileRevalidateMs` is provided.
   */
  ttlMs: number
  /**
   * Optional window during which stale data may be served while a background
   * revalidation takes place.
   */
  staleWhileRevalidateMs?: number
  /**
   * When `true`, a `null` loader result is cached; otherwise `null` purges the
   * existing key. Defaults to `false`.
   */
  cacheNull?: boolean
}

/**
 * Result envelope returned by {@link CacheManager.fetch} containing the value
 * along with cache metadata propagated to responders.
 */
export interface CacheFetchResult<T> {
  value: T
  cache: CacheMeta
}

const toSeconds = (valueMs: number | undefined): number | undefined => {
  if (!valueMs || valueMs <= 0) {
    return undefined
  }
  return Math.round(valueMs / 1000)
}

/**
 * High-level cache orchestrator that wraps a {@link CacheStore} implementation.
 * It adds promise-based in-flight deduplication, stale-while-revalidate support,
 * and delegates persistence to the configured store while emitting cache metrics.
 */
export class CacheManager {
  private store: CacheStore
  private inFlight = new Map<string, Promise<CacheFetchResult<unknown>>>()

  /**
   * Create a new cache manager. If no store is supplied an in-memory Map-backed
   * store is used which is suitable for single-process development.
   */
  constructor(store?: CacheStore) {
    this.store = store ?? new InMemoryCacheStore()
  }

  /**
   * Retrieve a cached value, invoking the loader on cache miss. Concurrent
   * requests for the same key share the same in-flight promise to avoid
   * duplicate upstream calls.
   */
  async fetch<T>(options: CacheFetchOptions<T>): Promise<CacheFetchResult<T>> {
    // Account-visible results must not enter the shared anonymous cache.
    if (env.REDDIT_COOKIE?.trim()) {
      return { value: await options.loader(), cache: { hit: false, maxAge: 0, staleWhileRevalidate: 0 } }
    }

    const now = Date.now()
    const baseMeta: CacheMeta = {
      hit: false,
      maxAge: toSeconds(options.ttlMs),
      staleWhileRevalidate: toSeconds(options.staleWhileRevalidateMs),
    }

    const cached = await this.store.get<T>(options.key)

    if (cached) {
      if (cached.expiresAt > now) {
        recordCacheHit()
        return {
          value: cached.value,
          cache: {
            ...baseMeta,
            hit: true,
          },
        }
      }

      if (cached.staleUntil && cached.staleUntil > now) {
        this.revalidate(options, cached).catch((error) => {
          console.warn(`Cache revalidation failed for key ${options.key}`, error)
        })
        recordCacheHit(true)
        return {
          value: cached.value,
          cache: {
            ...baseMeta,
            hit: true,
            maxAge: 0,
          },
        }
      }

      await this.store.delete(options.key)
      recordCacheEviction()
    }

    const existing = this.inFlight.get(options.key)
    if (existing) {
      const result = (await existing) as CacheFetchResult<T>
      return {
        value: result.value,
        cache: {
          ...result.cache,
          maxAge: result.cache.maxAge ?? baseMeta.maxAge,
          staleWhileRevalidate: result.cache.staleWhileRevalidate ?? baseMeta.staleWhileRevalidate,
        },
      }
    }

    recordCacheMiss()
    const promise = this.load(options, baseMeta)
    this.inFlight.set(options.key, promise as Promise<CacheFetchResult<unknown>>)

    try {
      const result = await promise
      return result
    } finally {
      this.inFlight.delete(options.key)
    }
  }

  private async load<T>(
    options: CacheFetchOptions<T>,
    baseMeta: CacheMeta,
  ): Promise<CacheFetchResult<T>> {
    try {
      const value = await options.loader()
      await this.persist(options, value)
      return {
        value,
        cache: baseMeta,
      }
    } catch (error) {
      recordCacheError()
      throw error
    }
  }

  private async revalidate<T>(
    options: CacheFetchOptions<T>,
    record: CacheRecord<T>,
  ): Promise<void> {
    const inFlight = this.inFlight.get(options.key)
    if (inFlight) {
      return
    }

    recordCacheRevalidation()
    const promise = this.load(options, {
      hit: false,
      maxAge: toSeconds(options.ttlMs),
      staleWhileRevalidate: toSeconds(options.staleWhileRevalidateMs),
    })

    this.inFlight.set(options.key, promise as Promise<CacheFetchResult<unknown>>)

    promise.catch((error) => {
      console.warn(`Cache revalidation loader failed for key ${options.key}`, error)
      recordCacheError()
      this.store.set(options.key, record)
    }).finally(() => {
      this.inFlight.delete(options.key)
    })
  }

  private async persist<T>(options: CacheFetchOptions<T>, value: T): Promise<void> {
    if (value === null && !options.cacheNull) {
      await this.store.delete(options.key)
      recordCacheEviction()
      return
    }

    const now = Date.now()
    const expiresAt = now + options.ttlMs
    const staleUntil =
      options.staleWhileRevalidateMs && options.staleWhileRevalidateMs > 0
        ? expiresAt + options.staleWhileRevalidateMs
        : undefined

    await this.store.set(options.key, {
      value,
      expiresAt,
      staleUntil,
    })
    recordCacheWrite()
  }
}

let defaultCacheManager: CacheManager | null = null

/**
 * Swap the default cache manager to use the supplied store. Primarily used at
 * process bootstrap to wire Redis or other persistent backends.
 *
 * @returns The newly instantiated {@link CacheManager} bound to the store.
 */
export const configureCacheStore = (store: CacheStore): CacheManager => {
  defaultCacheManager = new CacheManager(store)
  return defaultCacheManager
}

/**
 * Lazily obtain the process-wide cache manager, creating an in-memory instance
 * if `configureCacheStore` has not been called yet.
 */
export const cacheManager = (): CacheManager => {
  if (!defaultCacheManager) {
    defaultCacheManager = new CacheManager()
  }
  return defaultCacheManager
}
