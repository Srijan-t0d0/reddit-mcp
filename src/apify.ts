/**
 * Apify Actor entry point.
 * Reads input from Apify's key-value store, runs the appropriate service,
 * and pushes results to the default dataset.
 */

import { env, mergeEnv, setEnv } from './env'
import { fetchPostById, fetchSubredditPosts } from './services/redditPosts'
import { fetchSearchResults } from './services/redditSearch'
import { fetchSubreddit } from './services/redditSubreddits'
import { fetchUser, fetchUserOverview } from './services/redditUsers'
import { fetchMultiSubredditFeed } from './services/redditFeeds'
import type { SearchType, SearchSort, SearchTimeframe } from './services/redditSearch'
import type { SubredditPostSort, ListingTimeframe, CommentSort } from './services/redditPosts'
import type { UserOverviewSort } from './services/redditUsers'

// ── Initialize env from process.env ────────────────────────────────────
setEnv(process.env as Record<string, string | undefined>)

interface ActorInput {
  action: string
  query?: string
  postId?: string
  subreddit?: string
  subreddits?: string[]
  username?: string
  sort?: string
  time?: string
  type?: string
  limit?: number
  includeComments?: boolean
  proxyUrl?: string
}

const KV_STORE_URL = `${process.env.APIFY_API_BASE_URL ?? 'https://api.apify.com/v2'}/key-value-stores/${process.env.APIFY_DEFAULT_KEY_VALUE_STORE_ID}`
const DATASET_URL = `${process.env.APIFY_API_BASE_URL ?? 'https://api.apify.com/v2'}/datasets/${process.env.APIFY_DEFAULT_DATASET_ID}`
const TOKEN = process.env.APIFY_TOKEN ?? ''

const getInput = async (): Promise<ActorInput> => {
  if (process.env.APIFY_DEFAULT_KEY_VALUE_STORE_ID) {
    const res = await fetch(`${KV_STORE_URL}/records/INPUT?token=${TOKEN}`)
    if (res.ok) return res.json() as Promise<ActorInput>
  }
  // Fallback: read from stdin for local testing
  const text = await Bun.stdin.text()
  return text ? JSON.parse(text) : { action: 'searchPosts', query: 'test' }
}

const pushData = async (items: unknown[]) => {
  if (process.env.APIFY_DEFAULT_DATASET_ID) {
    await fetch(`${DATASET_URL}/items?token=${TOKEN}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(items),
    })
  } else {
    // Local mode: print to stdout
    console.log(JSON.stringify(items, null, 2))
  }
}

const run = async () => {
  const input = await getInput()

  if (input.proxyUrl) {
    mergeEnv({ PROXY_URL: input.proxyUrl })
  }

  let results: unknown[] = []

  switch (input.action) {
    case 'searchPosts': {
      if (!input.query) throw new Error('query is required for searchPosts')
      const res = await fetchSearchResults(env, {
        query: input.query,
        type: input.type as SearchType | undefined,
        sort: (input.sort ?? 'relevance') as SearchSort,
        time: input.time as SearchTimeframe | undefined,
        subreddit: input.subreddit,
        limit: input.limit,
      })
      results = res.value.items
      break
    }

    case 'getPost': {
      if (!input.postId) throw new Error('postId is required for getPost')
      const res = await fetchPostById(env, input.postId, {
        includeComments: input.includeComments,
        sort: (input.sort as CommentSort) ?? undefined,
        limit: input.limit,
      })
      if (res.value) {
        results = [res.value]
      }
      break
    }

    case 'getSubreddit': {
      if (!input.subreddit) throw new Error('subreddit is required for getSubreddit')
      const res = await fetchSubreddit(env, input.subreddit)
      if (res.value) {
        results = [res.value]
      }
      break
    }

    case 'getSubredditPosts': {
      if (!input.subreddit) throw new Error('subreddit is required for getSubredditPosts')
      const res = await fetchSubredditPosts(env, input.subreddit, {
        sort: (input.sort as SubredditPostSort) ?? undefined,
        time: (input.time as ListingTimeframe) ?? undefined,
        limit: input.limit,
      })
      if (res.value) {
        results = res.value.items
      }
      break
    }

    case 'getUser': {
      if (!input.username) throw new Error('username is required for getUser')
      const res = await fetchUser(env, input.username)
      if (res.value) {
        results = [res.value]
      }
      break
    }

    case 'getUserActivity': {
      if (!input.username) throw new Error('username is required for getUserActivity')
      const res = await fetchUserOverview(env, input.username, {
        type: input.type as 'posts' | 'comments' | undefined,
        sort: (input.sort as UserOverviewSort) ?? undefined,
        limit: input.limit,
      })
      if (res.value) {
        results = res.value.items
      }
      break
    }

    case 'getMultiFeed': {
      const subs = input.subreddits ?? (input.subreddit ? [input.subreddit] : [])
      if (!subs.length) throw new Error('subreddits is required for getMultiFeed')
      const res = await fetchMultiSubredditFeed(env, subs, {
        sort: (input.sort as SubredditPostSort) ?? undefined,
        time: (input.time as ListingTimeframe) ?? undefined,
        limit: input.limit,
      })
      results = res.listing.items
      break
    }

    default:
      throw new Error(`Unknown action: ${input.action}. Valid actions: searchPosts, getPost, getSubreddit, getSubredditPosts, getUser, getUserActivity, getMultiFeed`)
  }

  await pushData(results)
  console.log(`Done. Pushed ${results.length} items.`)
}

run().catch((err) => {
  console.error('Actor failed:', err)
  process.exit(1)
})
