import { isHttpError } from '../clients/httpError'
import type { RuntimeBindings } from '../env'
import { createRedditHttpClient } from '../clients/redditHttp'
import type { Comment, Listing, Post } from '../domain'
import { normalizeCommentListing, normalizePost, normalizePostListing } from '../domain'
import type { RawMoreChildren, RawRedditComment, RawRedditPost, RedditListing, RedditThing } from '../domain'
import { cacheManager, postKey, subredditPostsKey } from '../cache'
import type { CacheFetchResult } from '../cache'
import { fetchSubreddit } from './redditSubreddits'
import { fetchAuthorProfile, fetchAuthorProfiles } from './authorProfiles'

type RedditCommentsResponse = [
  RedditListing<RawRedditPost>,
  RedditListing<RawRedditComment | RawMoreChildren>,
]

export type CommentSort =
  | 'confidence'
  | 'top'
  | 'new'
  | 'controversial'
  | 'old'
  | 'random'
  | 'qa'

export type SubredditPostSort = 'hot' | 'new' | 'rising' | 'top' | 'controversial'

export type ListingTimeframe = 'hour' | 'day' | 'week' | 'month' | 'year' | 'all'

export interface FetchPostOptions {
  includeComments?: boolean
  sort?: CommentSort
  limit?: number
  depth?: number
  context?: number
  after?: string
  before?: string
  thread?: string
}

export interface FetchPostResult {
  post: Post
  comments?: Listing<Comment>
}

export interface FetchSubredditPostsOptions {
  sort?: SubredditPostSort
  time?: ListingTimeframe
  limit?: number
  after?: string
  before?: string
}

const sanitizeParams = (params: Record<string, string | number | undefined>) =>
  Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null),
  )

const POST_DETAILS_TTL_MS = 6 * 60 * 60 * 1000
const POST_DETAILS_STALE_MS = 60 * 60 * 1000
const SUBREDDIT_POSTS_TTL_MS = 2 * 60 * 60 * 1000
const SUBREDDIT_POSTS_STALE_MS = 45 * 60 * 1000

const msToSeconds = (value: number): number => Math.round(value / 1000)

export const fetchPostById = async (
  env: RuntimeBindings,
  postId: string,
  options: FetchPostOptions = {},
): Promise<CacheFetchResult<FetchPostResult | null>> => {
  const normalizedId = postId.trim()
  if (!normalizedId) {
    return {
      value: null,
      cache: {
        hit: false,
        maxAge: msToSeconds(POST_DETAILS_TTL_MS),
      },
    }
  }

  const includeComments = Boolean(options.includeComments)
  const thread = options.thread
    ? options.thread.startsWith('t1_')
      ? options.thread.slice(3)
      : options.thread
    : undefined
  const params = sanitizeParams({
    raw_json: 1,
    sort: options.sort,
    depth: options.depth,
    limit: options.limit,
    context: options.context,
    after: options.after,
    before: options.before,
    comment: thread,
  })

  const cacheKey = postKey(env, normalizedId, {
    includeComments,
    sort: options.sort,
    limit: options.limit,
    depth: options.depth,
    context: options.context,
    after: options.after,
    before: options.before,
    comment: thread,
  })

  return cacheManager().fetch<FetchPostResult | null>({
    key: cacheKey,
    ttlMs: POST_DETAILS_TTL_MS,
    staleWhileRevalidateMs: POST_DETAILS_STALE_MS,
    cacheNull: true,
    loader: async () => {
      const client = createRedditHttpClient()
      try {
        const { data } = await client.get<RedditCommentsResponse>(`/comments/${normalizedId}.json`, {
          params,
        })

        const [postListing, commentsListing] = data
        const postThing = postListing.data.children.find((child) => child.kind === 't3')
        if (!postThing) {
          return null
        }

        const rawPost = postThing.data
        const [subredditResult, authorProfile] = await Promise.all([
          fetchSubreddit(env, rawPost.subreddit),
          fetchAuthorProfile(env, rawPost.author),
        ])
        const post = normalizePost(
          rawPost,
          subredditResult.value ?? undefined,
          authorProfile ?? undefined,
        )

        if (!includeComments) {
          return { post }
        }

        const comments = normalizeCommentListing(commentsListing, options.limit)

        return {
          post,
          comments,
        }
      } catch (error) {
        if (isHttpError(error)) {
          if (error.status === 404) {
            return null
          }
          if (error.status === 403) {
            throw new Error('Reddit API returned 403 Forbidden')
          }
        }
        throw error
      }
    },
  })
}

export const fetchSubredditPosts = async (
  env: RuntimeBindings,
  subreddit: string,
  options: FetchSubredditPostsOptions = {},
): Promise<CacheFetchResult<Listing<Post> | null>> => {
  const name = subreddit.trim()
  if (!name) {
    return {
      value: null,
      cache: {
        hit: false,
        maxAge: msToSeconds(SUBREDDIT_POSTS_TTL_MS),
      },
    }
  }

  const sort = options.sort ?? 'hot'
  const path = sort === 'hot' ? `/r/${name}.json` : `/r/${name}/${sort}.json`
  const timeframe = ['top', 'controversial'].includes(sort) ? options.time : undefined

  const params = sanitizeParams({
    raw_json: 1,
    limit: options.limit,
    after: options.after,
    before: options.before,
    t: timeframe,
  })

  const cacheKey = subredditPostsKey(env, name, {
    sort,
    time: timeframe,
    limit: options.limit,
    after: options.after,
    before: options.before,
  })

  return cacheManager().fetch<Listing<Post> | null>({
    key: cacheKey,
    ttlMs: SUBREDDIT_POSTS_TTL_MS,
    staleWhileRevalidateMs: SUBREDDIT_POSTS_STALE_MS,
    cacheNull: true,
    loader: async () => {
      const client = createRedditHttpClient()
      try {
        const [listingResponse, subredditResult] = await Promise.all([
          client.get<RedditListing<RawRedditPost>>(path, {
            params,
          }),
          fetchSubreddit(env, name),
        ])

        const listingData = listingResponse.data
        const authors = listingData.data.children
          .filter((child): child is RedditThing<RawRedditPost> & { kind: 't3' } => child.kind === 't3')
          .map((child) => child.data.author)
        const authorProfiles = await fetchAuthorProfiles(env, authors)

        return normalizePostListing(
          listingData,
          options.limit,
          undefined,
          subredditResult.value ?? undefined,
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
