import { isHttpError } from '../clients/httpError'
import type { RuntimeBindings } from '../env'
import { createRedditHttpClient } from '../clients/redditHttp'
import { normalizeSubreddit } from '../domain'
import type { RawSubredditAbout } from '../domain'
import type { Subreddit } from '../domain'
import { cacheManager, subredditAboutKey } from '../cache'
import type { CacheFetchResult } from '../cache'

interface SubredditAboutResponse {
  kind: string
  data: RawSubredditAbout
}

const isSubredditAbout = (payload: unknown): payload is SubredditAboutResponse => {
  if (!payload || typeof payload !== 'object') return false
  const value = payload as SubredditAboutResponse
  return value.kind === 't5' && !!value.data
}

const SUBREDDIT_ABOUT_TTL_MS = 48 * 60 * 60 * 1000
const SUBREDDIT_ABOUT_STALE_MS = 12 * 60 * 60 * 1000

const msToSeconds = (value: number): number => Math.round(value / 1000)

export const fetchSubreddit = async (
  env: RuntimeBindings,
  name: string,
): Promise<CacheFetchResult<Subreddit | null>> => {
  const trimmed = name.trim()
  if (!trimmed) {
    return {
      value: null,
      cache: {
        hit: false,
        maxAge: msToSeconds(SUBREDDIT_ABOUT_TTL_MS),
      },
    }
  }

  return cacheManager().fetch<Subreddit | null>({
    key: subredditAboutKey(env, trimmed),
    ttlMs: SUBREDDIT_ABOUT_TTL_MS,
    staleWhileRevalidateMs: SUBREDDIT_ABOUT_STALE_MS,
    cacheNull: true,
    loader: async () => {
      const client = createRedditHttpClient()
      try {
        const { data } = await client.get<SubredditAboutResponse>(`/r/${trimmed}/about.json`, {
          params: { raw_json: 1 },
        })

        if (isSubredditAbout(data)) {
          return normalizeSubreddit(data.data)
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
