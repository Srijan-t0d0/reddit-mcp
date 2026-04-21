import { isHttpError } from '../clients/httpError'
import type { RuntimeBindings } from '../env'
import { createRedditHttpClient } from '../clients/redditHttp'
import { normalizeSearchListing } from '../domain'
import type {
  RawRedditComment,
  RawRedditPost,
  RawSubredditAbout,
  RawUserAbout,
  RedditListing,
  RedditThing,
} from '../domain'
import type { Listing, SearchResult, Subreddit } from '../domain'
import { cacheManager, searchKey } from '../cache'
import type { CacheFetchResult } from '../cache'
import { fetchAuthorProfiles } from './authorProfiles'
import { fetchSubreddit } from './redditSubreddits'

export type SearchSort = 'relevance' | 'hot' | 'top' | 'new' | 'comments'

export type SearchType = 'posts' | 'comments' | 'subreddits' | 'users'

export type SearchTimeframe = 'hour' | 'day' | 'week' | 'month' | 'year' | 'all'

export interface FetchSearchOptions {
  query: string
  type?: SearchType
  sort?: SearchSort
  time?: SearchTimeframe
  limit?: number
  after?: string
  before?: string
  subreddit?: string
  restrictSr?: boolean
}

const typeParamMap: Record<SearchType, string> = {
  posts: 'link',
  comments: 'comment',
  subreddits: 'sr',
  users: 'user',
}

const sanitizeParams = (params: Record<string, string | number | boolean | undefined>) =>
  Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null),
  )

const SEARCH_TTL_MS = 6 * 60 * 60 * 1000
const SEARCH_STALE_MS = 60 * 60 * 1000

export const fetchSearchResults = async (
  env: RuntimeBindings,
  options: FetchSearchOptions,
): Promise<CacheFetchResult<Listing<SearchResult>>> => {
  const trimmedQuery = options.query?.trim()
  if (!trimmedQuery) {
    throw new Error('Search query is required')
  }

  const client = createRedditHttpClient()
  const restrictSr = options.subreddit ? true : options.restrictSr
  const timeframe = options.sort === 'top' || options.sort === 'comments' ? options.time : undefined

  const params = sanitizeParams({
    raw_json: 1,
    q: trimmedQuery,
    type: options.type ? typeParamMap[options.type] : undefined,
    sort: options.sort,
    t: timeframe,
    limit: options.limit,
    after: options.after,
    before: options.before,
    restrict_sr: restrictSr ? '1' : undefined,
    sr_detail: restrictSr ? '1' : undefined,
    subreddit: options.subreddit,
  })

  const cacheKey = searchKey(env, {
    q: trimmedQuery,
    type: options.type ?? 'all',
    sort: options.sort,
    time: timeframe,
    limit: options.limit,
    after: options.after,
    before: options.before,
    subreddit: options.subreddit?.toLowerCase(),
    restrictSr: restrictSr ? '1' : '0',
  })

  return cacheManager().fetch<Listing<SearchResult>>({
    key: cacheKey,
    ttlMs: SEARCH_TTL_MS,
    staleWhileRevalidateMs: SEARCH_STALE_MS,
    loader: async () => {
      try {
        const { data } = await client.get<
          RedditListing<RawRedditPost | RawRedditComment | RawSubredditAbout | RawUserAbout>
        >('/search.json', {
          params,
        })

        const children = data.data.children
        const authors = children
          .filter((child): child is RedditThing<RawRedditPost> & { kind: 't3' } => child.kind === 't3')
          .map((child) => child.data.author)
        const authorProfiles = await fetchAuthorProfiles(env, authors)

        const subredditNameMap = new Map<string, string>()
        for (const child of children) {
          if (child.kind === 't3') {
            const name = (child.data as RawRedditPost).subreddit
            if (name) {
              subredditNameMap.set(name.toLowerCase(), name)
            }
          } else if (child.kind === 't5') {
            const name = (child.data as RawSubredditAbout).display_name
            if (name) {
              subredditNameMap.set(name.toLowerCase(), name)
            }
          }
        }

        const subredditProfiles = new Map<string, Subreddit>()
        if (subredditNameMap.size) {
          await Promise.all(
            Array.from(subredditNameMap.entries()).map(async ([key, original]) => {
              try {
                const result = await fetchSubreddit(env, original)
                if (result.value) {
                  subredditProfiles.set(key, result.value)
                }
              } catch (error) {
                if(isHttpError(error)){
                console.warn(`Failed to hydrate subreddit ${original} during search`, error.message)}
              }
            }),
          )
        }

        return normalizeSearchListing(
          data,
          options.limit,
          undefined,
          authorProfiles,
          subredditProfiles.size ? subredditProfiles : undefined,
        )
      } catch (error) {
        if (isHttpError(error) && error.status === 404) {
          return {
            items: [],
            paging: {
              after: null,
              before: null,
              limit: options.limit,
            },
          }
        }
        throw error
      }
    },
  })
}
