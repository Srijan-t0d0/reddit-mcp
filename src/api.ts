/**
 * REST API — Elysia server for RapidAPI / standalone deployment.
 *
 * Endpoints mirror the MCP tools:
 *   GET /search
 *   GET /post/:id
 *   GET /r/:subreddit
 *   GET /r/:subreddit/posts
 *   GET /user/:username
 *   GET /user/:username/activity
 *   POST /feed
 */

import { Elysia, t } from 'elysia'
import { env, setEnv } from './env'
import { fetchPostById, fetchSubredditPosts } from './services/redditPosts'
import { fetchSearchResults } from './services/redditSearch'
import { fetchSubreddit } from './services/redditSubreddits'
import { fetchUser, fetchUserOverview } from './services/redditUsers'
import { fetchMultiSubredditFeed } from './services/redditFeeds'

// ── Initialize env from process.env (Bun/Node) ────────────────────────
setEnv(process.env as Record<string, string | undefined>)

// ── Helpers ─────────────────────────────────────────────────────────────

const num = (v: string | undefined, fallback?: number) => {
  if (v === undefined) return fallback
  const n = Number(v)
  return Number.isNaN(n) ? fallback : n
}

const ok = <T>(data: T, meta?: Record<string, unknown>) => ({
  ok: true as const,
  ...meta,
  data,
})

const fail = (message: string, status: number) => ({
  ok: false as const,
  error: message,
  status,
})

// ── App ─────────────────────────────────────────────────────────────────

const app = new Elysia()
  .onError(({ error }) => {
    console.error(error)
    const message = 'message' in error ? error.message : 'Internal server error'
    return fail(message, 500)
  })

  // ── Search ──────────────────────────────────────────────────────────

  .get('/search', async ({ query }) => {
    if (!query.q) return fail('query param "q" is required', 400)

    const result = await fetchSearchResults(env, {
      query: query.q,
      type: query.type as any,
      sort: (query.sort as any) ?? 'relevance',
      time: query.time as any,
      subreddit: query.subreddit,
      limit: num(query.limit, 25),
      after: query.after,
    })

    return ok(result.value, { cache: result.cache })
  }, {
    query: t.Object({
      q: t.String(),
      type: t.Optional(t.String()),
      sort: t.Optional(t.String()),
      time: t.Optional(t.String()),
      subreddit: t.Optional(t.String()),
      limit: t.Optional(t.String()),
      after: t.Optional(t.String()),
    }),
  })

  // ── Post by ID ──────────────────────────────────────────────────────

  .get('/post/:id', async ({ params, query }) => {
    const result = await fetchPostById(env, params.id, {
      includeComments: query.comments === 'true',
      sort: (query.commentSort as any) ?? undefined,
      limit: num(query.commentLimit),
      depth: num(query.commentDepth),
    })

    if (!result.value) return fail(`Post "${params.id}" not found`, 404)
    return ok(result.value, { cache: result.cache })
  }, {
    params: t.Object({ id: t.String() }),
    query: t.Object({
      comments: t.Optional(t.String()),
      commentSort: t.Optional(t.String()),
      commentLimit: t.Optional(t.String()),
      commentDepth: t.Optional(t.String()),
    }),
  })

  // ── Subreddit info ──────────────────────────────────────────────────

  .get('/r/:subreddit', async ({ params }) => {
    const result = await fetchSubreddit(env, params.subreddit)
    if (!result.value) return fail(`Subreddit "r/${params.subreddit}" not found`, 404)
    return ok(result.value, { cache: result.cache })
  }, {
    params: t.Object({ subreddit: t.String() }),
  })

  // ── Subreddit posts ─────────────────────────────────────────────────

  .get('/r/:subreddit/posts', async ({ params, query }) => {
    const result = await fetchSubredditPosts(env, params.subreddit, {
      sort: (query.sort as any) ?? 'hot',
      time: query.time as any,
      limit: num(query.limit, 25),
      after: query.after,
    })

    if (!result.value) return fail(`Subreddit "r/${params.subreddit}" not found`, 404)
    return ok(result.value, { cache: result.cache })
  }, {
    params: t.Object({ subreddit: t.String() }),
    query: t.Object({
      sort: t.Optional(t.String()),
      time: t.Optional(t.String()),
      limit: t.Optional(t.String()),
      after: t.Optional(t.String()),
    }),
  })

  // ── User profile ───────────────────────────────────────────────────

  .get('/user/:username', async ({ params }) => {
    const result = await fetchUser(env, params.username)
    if (!result.value) return fail(`User "u/${params.username}" not found`, 404)
    return ok(result.value, { cache: result.cache })
  }, {
    params: t.Object({ username: t.String() }),
  })

  // ── User activity ──────────────────────────────────────────────────

  .get('/user/:username/activity', async ({ params, query }) => {
    const result = await fetchUserOverview(env, params.username, {
      type: query.type as any,
      sort: (query.sort as any) ?? undefined,
      time: query.time as any,
      limit: num(query.limit, 25),
      after: query.after,
    })

    if (!result.value) return fail(`User "u/${params.username}" not found`, 404)
    return ok(result.value, { cache: result.cache })
  }, {
    params: t.Object({ username: t.String() }),
    query: t.Object({
      type: t.Optional(t.String()),
      sort: t.Optional(t.String()),
      time: t.Optional(t.String()),
      limit: t.Optional(t.String()),
      after: t.Optional(t.String()),
    }),
  })

  // ── Multi-subreddit feed ───────────────────────────────────────────

  .post('/feed', async ({ body }) => {
    if (!body.subreddits?.length) return fail('"subreddits" array is required', 400)

    const result = await fetchMultiSubredditFeed(env, body.subreddits, {
      sort: body.sort as any,
      time: body.time as any,
      limit: body.limit,
      perSubreddit: body.perSubreddit,
    })

    return ok({
      listing: result.listing,
      sources: result.sources,
    }, { cache: result.cache })
  }, {
    body: t.Object({
      subreddits: t.Array(t.String()),
      sort: t.Optional(t.String()),
      time: t.Optional(t.String()),
      limit: t.Optional(t.Number()),
      perSubreddit: t.Optional(t.Number()),
    }),
  })

  // ── Health ─────────────────────────────────────────────────────────

  .get('/health', () => ({ ok: true, version: '1.0.0' }))

const PORT = Number(process.env.PORT ?? 3000)

app.listen(PORT, () => {
  console.log(`Reddit API running on http://localhost:${PORT}`)
})
