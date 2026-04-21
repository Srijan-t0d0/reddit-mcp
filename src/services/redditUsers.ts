import { isHttpError } from '../clients/httpError'
import type { RuntimeBindings } from '../env'
import { createRedditHttpClient } from '../clients/redditHttp'
import { normalizeOverviewListing, normalizeUser } from '../domain'
import type { RawRedditComment, RawRedditPost, RawUserAbout, RedditListing } from '../domain'
import type { Listing, OverviewEntry, UserSummary } from '../domain'
import { cacheManager, userAboutKey, userOverviewKey } from '../cache'
import type { CacheFetchResult } from '../cache'

interface RedditUserAboutResponse {
  kind: string
  data: RawUserAbout
}

const isUserAboutResponse = (data: unknown): data is RedditUserAboutResponse => {
  if (!data || typeof data !== 'object') return false
  const value = data as RedditUserAboutResponse
  return typeof value.kind === 'string' && value.kind === 't2' && !!value.data
}

export type UserOverviewType = 'posts' | 'comments'

export type UserOverviewSort = 'hot' | 'new' | 'top' | 'controversial'

export interface FetchUserOverviewOptions {
  type?: UserOverviewType
  sort?: UserOverviewSort
  time?: 'hour' | 'day' | 'week' | 'month' | 'year' | 'all'
  limit?: number
  after?: string
  before?: string
}

const USER_PROFILE_TTL_MS = 24 * 60 * 60 * 1000
const USER_PROFILE_STALE_MS = 6 * 60 * 60 * 1000
const USER_OVERVIEW_TTL_MS = 2 * 60 * 60 * 1000
const USER_OVERVIEW_STALE_MS = 30 * 60 * 1000

const msToSeconds = (value: number): number => Math.round(value / 1000)

export const fetchUser = async (
  env: RuntimeBindings,
  username: string,
): Promise<CacheFetchResult<UserSummary | null>> => {
  const normalized = username.trim()
  if (
    !normalized ||
    normalized === '[deleted]' ||
    normalized.toLowerCase() === 'automoderator'
  ) {
    return {
      value: null,
      cache: {
        hit: false,
        maxAge: msToSeconds(USER_PROFILE_TTL_MS),
      },
    }
  }

  return cacheManager().fetch<UserSummary | null>({
    key: userAboutKey(env, normalized),
    ttlMs: USER_PROFILE_TTL_MS,
    staleWhileRevalidateMs: USER_PROFILE_STALE_MS,
    cacheNull: true,
    loader: async () => {
      const client = createRedditHttpClient()
      try {
        const { data } = await client.get<RedditUserAboutResponse>(`/user/${normalized}/about.json`, {
          params: { raw_json: 1 },
        })

        if (isUserAboutResponse(data)) {
          return normalizeUser(data.data)
        }

        return null
      } catch (error) {
        if (isHttpError(error) && error.status === 404) {
          return null
        }
        throw error
      }
    },
  })
}

export const fetchUserOverview = async (
  env: RuntimeBindings,
  username: string,
  options: FetchUserOverviewOptions = {},
): Promise<CacheFetchResult<Listing<OverviewEntry> | null>> => {
  const normalized = username.trim()
  if (!normalized) {
    return {
      value: null,
      cache: {
        hit: false,
        maxAge: msToSeconds(USER_OVERVIEW_TTL_MS),
      },
    }
  }

  const typeParam = options.type === 'posts' ? 'links' : options.type === 'comments' ? 'comments' : undefined
  const timeframe = options.sort === 'top' || options.sort === 'controversial' ? options.time : undefined

  const params = Object.fromEntries(
    Object.entries({
      raw_json: 1,
      limit: options.limit,
      after: options.after,
      before: options.before,
      sort: options.sort,
      t: timeframe,
      type: typeParam,
    }).filter(([, value]) => value !== undefined && value !== null),
  )

  const cacheKey = userOverviewKey(env, normalized, {
    type: options.type ?? 'all',
    sort: options.sort,
    time: timeframe,
    limit: options.limit,
    after: options.after,
    before: options.before,
  })

  return cacheManager().fetch<Listing<OverviewEntry> | null>({
    key: cacheKey,
    ttlMs: USER_OVERVIEW_TTL_MS,
    staleWhileRevalidateMs: USER_OVERVIEW_STALE_MS,
    cacheNull: true,
    loader: async () => {
      const client = createRedditHttpClient()
      try {
        const [listingResponse, authorProfileResult] = await Promise.all([
          client
            .get<RedditListing<RawRedditPost | RawRedditComment>>(
              `/user/${normalized}/overview.json`,
              {
                params,
              },
            )
            .catch((error) => {
              if (isHttpError(error) && (error.status === 404 || error.status === 403)) {
                return null
              }
              throw error
            }),
          fetchUser(env, normalized),
        ])

        if (!listingResponse || !authorProfileResult.value) {
          return {
            items: [],
            paging: {
              after: null,
              before: null,
              limit: options.limit,
            },
          }
        }

        const authorProfiles = new Map<string, UserSummary>()
        authorProfiles.set(normalized, authorProfileResult.value)

        return normalizeOverviewListing(
          listingResponse.data,
          options.limit,
          undefined,
          authorProfiles,
        )
      } catch (error) {
        if (isHttpError(error) && error.status === 404) {
          return null
        }
        throw error
      }
    },
  })
}
