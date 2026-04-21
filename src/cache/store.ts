export interface CacheRecord<T> {
  value: T
  expiresAt: number
  staleUntil?: number
}

export interface CacheStore {
  get<T>(key: string): Promise<CacheRecord<T> | null>
  set<T>(key: string, record: CacheRecord<T>): Promise<void>
  delete(key: string): Promise<void>
}

/**
 * Simple in-memory cache store backing the cache manager.
 * This implements the CacheStore interface so we can later
 * swap in a persistent KV store without touching the callers.
 */
export class InMemoryCacheStore implements CacheStore {
  private store = new Map<string, CacheRecord<unknown>>()

  async get<T>(key: string): Promise<CacheRecord<T> | null> {
    if (!this.store.has(key)) {
      return null
    }
    const record = this.store.get(key)
    if (!record) {
      return null
    }
    return record as CacheRecord<T>
  }

  async set<T>(key: string, record: CacheRecord<T>): Promise<void> {
    this.store.set(key, record as CacheRecord<unknown>)
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key)
  }
}
