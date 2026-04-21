import { fetchSubredditPosts } from './redditPosts'
import type { RuntimeBindings } from '../env'
import type { CacheMeta, Listing, PagingInfo, Post } from '../domain'
import type { ListingTimeframe, SubredditPostSort } from './redditPosts'
import { combineCacheMeta } from '../cache'

export interface MultiSubredditFeedOptions {
  sort?: SubredditPostSort
  time?: ListingTimeframe
  limit?: number
  perSubreddit?: number
}

export interface MultiSubredditSourceMeta {
  name: string
  postsFetched: number
  paging?: PagingInfo
  error?: string
  cache?: CacheMeta
}

export interface MultiSubredditFeedResult {
  listing: Listing<Post>
  sources: MultiSubredditSourceMeta[]
  cache: CacheMeta
}

const parseCreatedUtc = (value: string): number => {
  const timestamp = Date.parse(value)
  return Number.isNaN(timestamp) ? 0 : timestamp
}

export const fetchMultiSubredditFeed = async (
  env: RuntimeBindings,
  subreddits: string[],
  options: MultiSubredditFeedOptions = {},
): Promise<MultiSubredditFeedResult> => {
  const sanitizedSubreddits = Array.from(
    new Set(subreddits.map((name) => name.trim()).filter((name) => name.length > 0)),
  )

  if (!sanitizedSubreddits.length) {
    return {
      listing: {
        items: [],
        paging: {
          after: null,
          before: null,
          limit: options.limit,
        },
      },
      sources: [],
      cache: {
        hit: false,
      },
    }
  }

  const perSubredditLimit = options.perSubreddit ?? options.limit ?? 25

  const results = await Promise.all(
    sanitizedSubreddits.map(async (name) => {
      try {
        const listingResult = await fetchSubredditPosts(env, name, {
          sort: options.sort,
          time: options.time,
          limit: perSubredditLimit,
        })
        return {
          name,
          result: listingResult,
          error: undefined as string | undefined,
        }
      } catch (error) {
        return {
          name,
          result: null,
          error: error instanceof Error ? error.message : 'Unknown error',
        }
      }
    }),
  )

  const combined = new Map<string, Post>()
  const sources: MultiSubredditSourceMeta[] = []
  const cacheSignals: CacheMeta[] = []

  for (const result of results) {
    const cacheMeta = result.result?.cache
    if (cacheMeta) {
      cacheSignals.push(cacheMeta)
    }

    if (!result.result || !result.result.value) {
      sources.push({
        name: result.name,
        postsFetched: 0,
        error: result.error ?? 'Unable to fetch subreddit feed',
        cache: cacheMeta,
      })
      continue
    }

    const listing = result.result.value

    sources.push({
      name: result.name,
      postsFetched: listing.items.length,
      paging: listing.paging,
      cache: cacheMeta,
    })

    for (const post of listing.items) {
      if (!combined.has(post.fullname)) {
        combined.set(post.fullname, post)
      }
    }
  }

  const sortedItems = Array.from(combined.values()).sort(
    (a, b) => parseCreatedUtc(b.createdUtc) - parseCreatedUtc(a.createdUtc),
  )

  const limit = options.limit ?? sortedItems.length
  const limitedItems = sortedItems.slice(0, limit)

  const listing: Listing<Post> = {
    items: limitedItems,
    paging: {
      after: null,
      before: null,
      limit,
    },
  }

  return {
    listing,
    sources,
    cache: combineCacheMeta(...cacheSignals),
  }
}
