/**
 * Cloudflare Workers entry point — Hono app combining REST API + MCP (Streamable HTTP).
 */

import { Hono } from 'hono'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { z } from 'zod'
import type { RuntimeBindings } from './env'
import { setEnv, env } from './env'
import { fetchPostById, fetchSubredditPosts } from './services/redditPosts'
import { fetchSearchResults } from './services/redditSearch'
import { fetchSubreddit } from './services/redditSubreddits'
import { fetchUser, fetchUserOverview } from './services/redditUsers'
import { fetchMultiSubredditFeed } from './services/redditFeeds'
import {
  formatPost,
  formatComment,
  formatSubreddit,
  formatUser,
  formatOverviewEntry,
  formatSearchResult,
} from './formatters'

// ── Types ──────────────────────────────────────────────────────────────

type Env = RuntimeBindings

const app = new Hono<{ Bindings: Env }>()

// ── Middleware: initialize env from CF bindings ────────────────────────

app.use('*', async (c, next) => {
  setEnv(c.env as Record<string, string | undefined>)
  await next()
})

// ── REST API Helpers ──────────────────────────────────────────────────

const num = (v: string | undefined, fallback?: number) => {
  if (v === undefined) return fallback
  const n = Number(v)
  return Number.isNaN(n) ? fallback : n
}

const ok = <T>(data: T, meta?: Record<string, unknown>) =>
  ({ ok: true as const, ...meta, data })

const fail = (message: string, status: number) =>
  ({ ok: false as const, error: message, status })

// ── REST Routes ───────────────────────────────────────────────────────

app.get('/health', (c) => {
  return c.json({ ok: true, version: '1.0.0', runtime: 'cloudflare-workers' })
})

app.get('/api/search', async (c) => {
  const q = c.req.query('q')
  if (!q) return c.json(fail('query param "q" is required', 400), 400)

  const result = await fetchSearchResults(env, {
    query: q,
    type: c.req.query('type') as any,
    sort: (c.req.query('sort') as any) ?? 'relevance',
    time: c.req.query('time') as any,
    subreddit: c.req.query('subreddit'),
    limit: num(c.req.query('limit'), 25),
    after: c.req.query('after'),
  })

  return c.json(ok(result.value, { cache: result.cache }))
})

app.get('/api/post/:id', async (c) => {
  const id = c.req.param('id')
  const query = c.req.query()

  const result = await fetchPostById(env, id, {
    includeComments: query.comments === 'true',
    sort: (query.commentSort as any) ?? undefined,
    limit: num(query.commentLimit),
    depth: num(query.commentDepth),
  })

  if (!result.value) return c.json(fail(`Post "${id}" not found`, 404), 404)
  return c.json(ok(result.value, { cache: result.cache }))
})

app.get('/api/r/:subreddit', async (c) => {
  const subreddit = c.req.param('subreddit')
  const result = await fetchSubreddit(env, subreddit)
  if (!result.value) return c.json(fail(`Subreddit "r/${subreddit}" not found`, 404), 404)
  return c.json(ok(result.value, { cache: result.cache }))
})

app.get('/api/r/:subreddit/posts', async (c) => {
  const subreddit = c.req.param('subreddit')
  const query = c.req.query()

  const result = await fetchSubredditPosts(env, subreddit, {
    sort: (query.sort as any) ?? 'hot',
    time: query.time as any,
    limit: num(query.limit, 25),
    after: query.after,
  })

  if (!result.value) return c.json(fail(`Subreddit "r/${subreddit}" not found`, 404), 404)
  return c.json(ok(result.value, { cache: result.cache }))
})

app.get('/api/user/:username', async (c) => {
  const username = c.req.param('username')
  const result = await fetchUser(env, username)
  if (!result.value) return c.json(fail(`User "u/${username}" not found`, 404), 404)
  return c.json(ok(result.value, { cache: result.cache }))
})

app.get('/api/user/:username/activity', async (c) => {
  const username = c.req.param('username')
  const query = c.req.query()

  const result = await fetchUserOverview(env, username, {
    type: query.type as any,
    sort: (query.sort as any) ?? undefined,
    time: query.time as any,
    limit: num(query.limit, 25),
    after: query.after,
  })

  if (!result.value) return c.json(fail(`User "u/${username}" not found`, 404), 404)
  return c.json(ok(result.value, { cache: result.cache }))
})

app.post('/api/feed', async (c) => {
  const body = await c.req.json<{
    subreddits?: string[]
    sort?: string
    time?: string
    limit?: number
    perSubreddit?: number
  }>()

  if (!body.subreddits?.length) return c.json(fail('"subreddits" array is required', 400), 400)

  const result = await fetchMultiSubredditFeed(env, body.subreddits, {
    sort: body.sort as any,
    time: body.time as any,
    limit: body.limit,
    perSubreddit: body.perSubreddit,
  })

  return c.json(ok({ listing: result.listing, sources: result.sources }, { cache: result.cache }))
})

// ── MCP (Streamable HTTP transport) ───────────────────────────────────

const createMcpServer = (): McpServer => {
  const server = new McpServer({
    name: 'reddit',
    version: '1.0.0',
  })

  server.tool(
    'search_reddit',
    'Search Reddit for posts, comments, subreddits, or users',
    {
      query: z.string().describe('Search query'),
      type: z.enum(['posts', 'comments', 'subreddits', 'users']).optional().describe('Type of results to search for'),
      sort: z.enum(['relevance', 'hot', 'top', 'new', 'comments']).optional().describe('Sort order'),
      time: z.enum(['hour', 'day', 'week', 'month', 'year', 'all']).optional().describe('Time filter'),
      subreddit: z.string().optional().describe('Restrict search to a specific subreddit'),
      limit: z.number().min(1).max(100).optional().describe('Number of results (default 25)'),
      after: z.string().optional().describe('Pagination cursor'),
    },
    async (params) => {
      try {
        const result = await fetchSearchResults(env, {
          query: params.query,
          type: params.type,
          sort: params.sort,
          time: params.time,
          subreddit: params.subreddit,
          limit: params.limit,
          after: params.after,
        })
        const listing = result.value
        const formatted = listing.items.map(formatSearchResult).join('\n\n---\n\n')
        const header = `Found ${listing.items.length} results for "${params.query}"${params.subreddit ? ` in r/${params.subreddit}` : ''}`
        const paging = listing.paging?.after ? `\n\n📄 More results available — use after: "${listing.paging.after}"` : ''
        return { content: [{ type: 'text', text: `${header}\n\n${formatted}${paging}` }] }
      } catch (error) {
        return { content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true }
      }
    },
  )

  server.tool(
    'get_post',
    'Get a Reddit post by ID, optionally with comments',
    {
      postId: z.string().describe('Reddit post ID (e.g. "1k2x3y4")'),
      includeComments: z.boolean().optional().describe('Include comments (default false)'),
      commentSort: z.enum(['confidence', 'top', 'new', 'controversial', 'old', 'random', 'qa']).optional().describe('Comment sort order'),
      commentLimit: z.number().min(1).max(500).optional().describe('Max comments to fetch'),
      commentDepth: z.number().min(0).max(10).optional().describe('Max comment reply depth'),
    },
    async (params) => {
      try {
        const result = await fetchPostById(env, params.postId, {
          includeComments: params.includeComments,
          sort: params.commentSort,
          limit: params.commentLimit,
          depth: params.commentDepth,
        })
        if (!result.value) {
          return { content: [{ type: 'text', text: `Post "${params.postId}" not found.` }] }
        }
        const { post, comments } = result.value
        let text = formatPost(post)
        if (comments?.items.length) {
          text += `\n\n── Comments (${comments.items.length}) ──\n\n`
          text += comments.items.map((c) => formatComment(c)).join('\n\n')
        }
        return { content: [{ type: 'text', text }] }
      } catch (error) {
        return { content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true }
      }
    },
  )

  server.tool(
    'get_subreddit',
    'Get information about a subreddit',
    {
      name: z.string().describe('Subreddit name (without r/ prefix)'),
    },
    async (params) => {
      try {
        const result = await fetchSubreddit(env, params.name)
        if (!result.value) {
          return { content: [{ type: 'text', text: `Subreddit "r/${params.name}" not found.` }] }
        }
        return { content: [{ type: 'text', text: formatSubreddit(result.value) }] }
      } catch (error) {
        return { content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true }
      }
    },
  )

  server.tool(
    'get_subreddit_posts',
    'Get posts from a subreddit',
    {
      subreddit: z.string().describe('Subreddit name (without r/ prefix)'),
      sort: z.enum(['hot', 'new', 'rising', 'top', 'controversial']).optional().describe('Sort order (default "hot")'),
      time: z.enum(['hour', 'day', 'week', 'month', 'year', 'all']).optional().describe('Time filter'),
      limit: z.number().min(1).max(100).optional().describe('Number of posts (default 25)'),
      after: z.string().optional().describe('Pagination cursor'),
    },
    async (params) => {
      try {
        const result = await fetchSubredditPosts(env, params.subreddit, {
          sort: params.sort,
          time: params.time,
          limit: params.limit,
          after: params.after,
        })
        if (!result.value) {
          return { content: [{ type: 'text', text: `Subreddit "r/${params.subreddit}" not found.` }] }
        }
        const listing = result.value
        const formatted = listing.items.map(formatPost).join('\n\n---\n\n')
        const header = `r/${params.subreddit} — ${params.sort ?? 'hot'} (${listing.items.length} posts)`
        const paging = listing.paging?.after ? `\n\n📄 More posts available — use after: "${listing.paging.after}"` : ''
        return { content: [{ type: 'text', text: `${header}\n\n${formatted}${paging}` }] }
      } catch (error) {
        return { content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true }
      }
    },
  )

  server.tool(
    'get_user',
    'Get a Reddit user profile',
    {
      username: z.string().describe('Reddit username (without u/ prefix)'),
    },
    async (params) => {
      try {
        const result = await fetchUser(env, params.username)
        if (!result.value) {
          return { content: [{ type: 'text', text: `User "u/${params.username}" not found.` }] }
        }
        return { content: [{ type: 'text', text: formatUser(result.value) }] }
      } catch (error) {
        return { content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true }
      }
    },
  )

  server.tool(
    'get_user_activity',
    'Get a user\'s recent posts and comments',
    {
      username: z.string().describe('Reddit username (without u/ prefix)'),
      type: z.enum(['posts', 'comments']).optional().describe('Filter to only posts or comments'),
      sort: z.enum(['hot', 'new', 'top', 'controversial']).optional().describe('Sort order'),
      time: z.enum(['hour', 'day', 'week', 'month', 'year', 'all']).optional().describe('Time filter'),
      limit: z.number().min(1).max(100).optional().describe('Number of items (default 25)'),
      after: z.string().optional().describe('Pagination cursor'),
    },
    async (params) => {
      try {
        const result = await fetchUserOverview(env, params.username, {
          type: params.type,
          sort: params.sort,
          time: params.time,
          limit: params.limit,
          after: params.after,
        })
        if (!result.value) {
          return { content: [{ type: 'text', text: `User "u/${params.username}" not found or has no public activity.` }] }
        }
        const listing = result.value
        const formatted = listing.items.map(formatOverviewEntry).filter(Boolean).join('\n\n---\n\n')
        const header = `u/${params.username} — activity (${listing.items.length} items)`
        const paging = listing.paging?.after ? `\n\n📄 More available — use after: "${listing.paging.after}"` : ''
        return { content: [{ type: 'text', text: `${header}\n\n${formatted}${paging}` }] }
      } catch (error) {
        return { content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true }
      }
    },
  )

  server.tool(
    'get_multi_feed',
    'Get a combined feed from multiple subreddits, merged and sorted by date',
    {
      subreddits: z.array(z.string()).min(1).max(25).describe('List of subreddit names (without r/ prefix)'),
      sort: z.enum(['hot', 'new', 'rising', 'top', 'controversial']).optional().describe('Sort order (default "hot")'),
      time: z.enum(['hour', 'day', 'week', 'month', 'year', 'all']).optional().describe('Time filter'),
      limit: z.number().min(1).max(100).optional().describe('Total posts to return'),
      perSubreddit: z.number().min(1).max(50).optional().describe('Posts per subreddit before merging'),
    },
    async (params) => {
      try {
        const result = await fetchMultiSubredditFeed(env, params.subreddits, {
          sort: params.sort,
          time: params.time,
          limit: params.limit,
          perSubreddit: params.perSubreddit,
        })
        const formatted = result.listing.items.map(formatPost).join('\n\n---\n\n')
        const sourcesSummary = result.sources
          .map((s) => `  r/${s.name}: ${s.postsFetched} posts${s.error ? ` (⚠ ${s.error})` : ''}`)
          .join('\n')
        const header = `Multi-feed: ${params.subreddits.map((s) => `r/${s}`).join(', ')} (${result.listing.items.length} posts)\n\nSources:\n${sourcesSummary}`
        return { content: [{ type: 'text', text: `${header}\n\n${formatted}` }] }
      } catch (error) {
        return { content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true }
      }
    },
  )

  return server
}

// ── MCP Route Handlers (Streamable HTTP — stateless) ──────────────────

app.all('/mcp', async (c) => {
  const server = createMcpServer()
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless — no session persistence
  })

  await server.connect(transport)

  const response = await transport.handleRequest(c.req.raw)

  // Close the transport (stateless mode — one request per connection)
  await server.close()

  return response
})

// ── Export ─────────────────────────────────────────────────────────────

export default app
