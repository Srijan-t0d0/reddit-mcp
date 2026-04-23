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

// ── Homepage ─────────────────────────────────────────────────────────

app.get('/', (c) => {
  const baseUrl = new URL(c.req.url).origin
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Reddit MCP — API &amp; MCP Server</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  :root{--bg:#0a0a0a;--surface:#111;--border:#222;--text:#e5e5e5;--muted:#888;--accent:#ff4500;--accent2:#ff6934;--code-bg:#161616;--green:#22c55e}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:var(--bg);color:var(--text);line-height:1.6;-webkit-font-smoothing:antialiased}
  a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline}
  .container{max-width:720px;margin:0 auto;padding:48px 24px 80px}
  header{margin-bottom:48px}
  h1{font-size:2rem;font-weight:700;letter-spacing:-0.03em;margin-bottom:4px}
  h1 span{color:var(--accent)}
  .tagline{color:var(--muted);font-size:1.05rem}
  .badge-row{display:flex;gap:8px;margin-top:16px;flex-wrap:wrap}
  .badge{display:inline-flex;align-items:center;gap:6px;font-size:.75rem;font-weight:600;text-transform:uppercase;letter-spacing:.04em;padding:4px 10px;border-radius:100px;border:1px solid var(--border);color:var(--muted)}
  .badge .dot{width:6px;height:6px;border-radius:50%;background:var(--green);display:inline-block}
  section{margin-bottom:40px}
  h2{font-size:1.1rem;font-weight:600;letter-spacing:-0.01em;margin-bottom:16px;color:var(--text)}
  .endpoint{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:14px 18px;margin-bottom:10px;display:flex;align-items:baseline;gap:12px;flex-wrap:wrap}
  .method{font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;padding:3px 8px;border-radius:4px;flex-shrink:0}
  .get{background:#22c55e18;color:#22c55e;border:1px solid #22c55e33}
  .post{background:#3b82f618;color:#3b82f6;border:1px solid #3b82f633}
  .path{font-family:'SF Mono',SFMono-Regular,Menlo,Consolas,monospace;font-size:.9rem;color:var(--text)}
  .path em{color:var(--muted);font-style:normal}
  .desc{font-size:.82rem;color:var(--muted);width:100%;margin-top:2px}
  .try-link{font-size:.75rem;color:var(--accent);margin-left:auto;flex-shrink:0;white-space:nowrap}
  .code-block{background:var(--code-bg);border:1px solid var(--border);border-radius:10px;padding:16px 20px;overflow-x:auto;margin-top:8px}
  .code-block code{font-family:'SF Mono',SFMono-Regular,Menlo,Consolas,monospace;font-size:.82rem;color:var(--muted);line-height:1.7;white-space:pre;display:block;word-wrap:break-word;overflow-wrap:break-word}
  @media(max-width:600px){.code-block code{font-size:.72rem}}
  .code-block .comment{color:#555}
  .mcp-box{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:20px 22px}
  .mcp-box p{font-size:.9rem;color:var(--muted);margin-bottom:12px}
  code{font-family:'SF Mono',SFMono-Regular,Menlo,Consolas,monospace}
  p code,.desc code,.install-card>p code{background:var(--code-bg);padding:2px 7px;border-radius:4px;font-size:.78rem;color:var(--text);white-space:nowrap}
  .mcp-box>p code{background:var(--code-bg);padding:2px 7px;border-radius:4px;font-size:.82rem}
  .tools-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px;margin-top:12px}
  .tool{font-size:.8rem;padding:8px 12px;border-radius:6px;background:var(--code-bg);border:1px solid var(--border);font-family:'SF Mono',SFMono-Regular,Menlo,Consolas,monospace;color:var(--text)}
  .install-card{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:20px 22px;margin-bottom:12px}
  .install-card h3{font-size:.95rem;font-weight:600;margin-bottom:8px;color:var(--text)}
  .install-card p{font-size:.85rem;color:var(--muted);margin-bottom:10px}
  .install-card code{font-size:.8rem}
  .tool-ref-item{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:16px 20px;margin-bottom:10px}
  .tool-ref-item h4{font-size:.9rem;font-weight:600;color:var(--accent);font-family:'SF Mono',SFMono-Regular,Menlo,Consolas,monospace;margin-bottom:4px}
  .tool-ref-item p{font-size:.84rem;color:var(--muted);margin-bottom:8px}
  .params{font-size:.78rem;color:var(--muted);font-family:'SF Mono',SFMono-Regular,Menlo,Consolas,monospace;padding:6px 10px;background:var(--code-bg);border-radius:6px}
  .params em{color:var(--accent);font-style:normal;font-weight:600}
  footer{margin-top:56px;padding-top:24px;border-top:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px}
  footer span{font-size:.8rem;color:var(--muted)}
</style>
</head>
<body>
<div class="container">
  <header>
    <h1><span>Reddit</span> MCP</h1>
    <p class="tagline">Reddit data as a REST API and MCP server. No API key needed.</p>
    <div class="badge-row">
      <span class="badge"><span class="dot"></span> Live</span>
      <span class="badge">Cloudflare Workers</span>
      <span class="badge">MCP Compatible</span>
      <span class="badge">v1.0.0</span>
    </div>
  </header>

  <section>
    <h2>REST API</h2>
    <div class="endpoint">
      <span class="method get">GET</span>
      <span class="path">/api/search?q=<em>{query}</em></span>
      <a class="try-link" href="${baseUrl}/api/search?q=cloudflare&limit=3" target="_blank">Try it →</a>
      <span class="desc">Search Reddit for posts, comments, subreddits, or users</span>
    </div>
    <div class="endpoint">
      <span class="method get">GET</span>
      <span class="path">/api/r/<em>{subreddit}</em></span>
      <a class="try-link" href="${baseUrl}/api/r/technology" target="_blank">Try it →</a>
      <span class="desc">Get subreddit info — subscribers, description, rules</span>
    </div>
    <div class="endpoint">
      <span class="method get">GET</span>
      <span class="path">/api/r/<em>{subreddit}</em>/posts</span>
      <a class="try-link" href="${baseUrl}/api/r/javascript/posts?limit=3" target="_blank">Try it →</a>
      <span class="desc">Get posts from a subreddit with sort &amp; time filters</span>
    </div>
    <div class="endpoint">
      <span class="method get">GET</span>
      <span class="path">/api/post/<em>{id}</em></span>
      <span class="desc">Get a post by ID, optionally with comments</span>
    </div>
    <div class="endpoint">
      <span class="method get">GET</span>
      <span class="path">/api/user/<em>{username}</em></span>
      <a class="try-link" href="${baseUrl}/api/user/spez" target="_blank">Try it →</a>
      <span class="desc">Get a user profile — karma, account age, etc.</span>
    </div>
    <div class="endpoint">
      <span class="method get">GET</span>
      <span class="path">/api/user/<em>{username}</em>/activity</span>
      <span class="desc">Get a user's recent posts and comments</span>
    </div>
    <div class="endpoint">
      <span class="method post">POST</span>
      <span class="path">/api/feed</span>
      <span class="desc">Combined feed from multiple subreddits, merged by date</span>
    </div>
  </section>

  <section>
    <h2>Quick Start</h2>
    <div class="code-block"><code><span class="comment"># Search Reddit</span>
curl "${baseUrl}/api/search?q=rust+programming&limit=5"

<span class="comment"># Get top posts from r/webdev</span>
curl "${baseUrl}/api/r/webdev/posts?sort=top&time=week&limit=10"

<span class="comment"># Multi-subreddit feed</span>
curl -X POST "${baseUrl}/api/feed" \\
  -H "Content-Type: application/json" \\
  -d '{"subreddits":["typescript","rust","golang"],"limit":15}'</code></div>
  </section>

  <section>
    <h2>MCP Server</h2>
    <div class="mcp-box">
      <p>This server speaks the <a href="https://modelcontextprotocol.io" target="_blank">Model Context Protocol</a> over Streamable HTTP. Connect any MCP client — no API key needed.</p>
      <div class="code-block" style="margin-bottom:16px"><code>${baseUrl}/mcp</code></div>
      <p style="font-size:.82rem;color:var(--muted);margin-bottom:8px">Available tools:</p>
      <div class="tools-grid">
        <div class="tool">search_reddit</div>
        <div class="tool">get_post</div>
        <div class="tool">get_subreddit</div>
        <div class="tool">get_subreddit_posts</div>
        <div class="tool">get_user</div>
        <div class="tool">get_user_activity</div>
        <div class="tool">get_multi_feed</div>
      </div>
    </div>
  </section>

  <section>
    <h2>Install</h2>

    <div class="install-card">
      <h3>Claude Desktop</h3>
      <p>Claude Desktop only supports stdio servers natively, so bridge through <code>mcp-remote</code>. Add to <code>~/Library/Application Support/Claude/claude_desktop_config.json</code> (macOS) or <code>%APPDATA%\\Claude\\claude_desktop_config.json</code> (Windows):</p>
      <div class="code-block"><code>{
  "mcpServers": {
    "reddit": {
      "command": "npx",
      "args": ["mcp-remote", "${baseUrl}/mcp"]
    }
  }
}</code></div>
    </div>

    <div class="install-card">
      <h3>Claude Code (CLI)</h3>
      <p>Run this in your terminal:</p>
      <div class="code-block"><code>claude mcp add reddit --transport http ${baseUrl}/mcp</code></div>
    </div>

    <div class="install-card">
      <h3>Cursor</h3>
      <p>Add to <code>.cursor/mcp.json</code> in your project root:</p>
      <div class="code-block"><code>{
  "mcpServers": {
    "reddit": {
      "url": "${baseUrl}/mcp"
    }
  }
}</code></div>
    </div>

    <div class="install-card">
      <h3>Windsurf</h3>
      <p>Add to <code>~/.codeium/windsurf/mcp_config.json</code>:</p>
      <div class="code-block"><code>{
  "mcpServers": {
    "reddit": {
      "serverUrl": "${baseUrl}/mcp"
    }
  }
}</code></div>
    </div>

    <div class="install-card">
      <h3>Cline (VS Code)</h3>
      <p>Open Cline settings → MCP Servers → add:</p>
      <div class="code-block"><code>{
  "mcpServers": {
    "reddit": {
      "type": "streamableHttp",
      "url": "${baseUrl}/mcp"
    }
  }
}</code></div>
    </div>

    <div class="install-card">
      <h3>Local (stdio via npx)</h3>
      <p>Run the MCP server locally with Bun:</p>
      <div class="code-block"><code><span class="comment"># Clone and run</span>
git clone https://github.com/your-org/reddit-mcp.git
cd reddit-mcp && bun install
bun run start</code></div>
      <p style="margin-top:10px">Then add to your MCP client config:</p>
      <div class="code-block"><code>{
  "mcpServers": {
    "reddit": {
      "command": "bun",
      "args": ["run", "start"],
      "cwd": "/path/to/reddit-mcp"
    }
  }
}</code></div>
    </div>
  </section>

  <section>
    <h2>Tool Reference</h2>
    <div class="tool-ref">
      <div class="tool-ref-item">
        <h4>search_reddit</h4>
        <p>Search Reddit for posts, comments, subreddits, or users.</p>
        <div class="params">query <em>(required)</em>, type, sort, time, subreddit, limit, after</div>
      </div>
      <div class="tool-ref-item">
        <h4>get_post</h4>
        <p>Get a Reddit post by ID, optionally with comments.</p>
        <div class="params">postId <em>(required)</em>, includeComments, commentSort, commentLimit, commentDepth</div>
      </div>
      <div class="tool-ref-item">
        <h4>get_subreddit</h4>
        <p>Get information about a subreddit.</p>
        <div class="params">name <em>(required)</em></div>
      </div>
      <div class="tool-ref-item">
        <h4>get_subreddit_posts</h4>
        <p>Get posts from a subreddit with sort and time filters.</p>
        <div class="params">subreddit <em>(required)</em>, sort, time, limit, after</div>
      </div>
      <div class="tool-ref-item">
        <h4>get_user</h4>
        <p>Get a Reddit user profile.</p>
        <div class="params">username <em>(required)</em></div>
      </div>
      <div class="tool-ref-item">
        <h4>get_user_activity</h4>
        <p>Get a user's recent posts and comments.</p>
        <div class="params">username <em>(required)</em>, type, sort, time, limit, after</div>
      </div>
      <div class="tool-ref-item">
        <h4>get_multi_feed</h4>
        <p>Combined feed from multiple subreddits, merged and sorted.</p>
        <div class="params">subreddits <em>(required)</em>, sort, time, limit, perSubreddit</div>
      </div>
    </div>
  </section>

  <footer>
    <span>No API key required · No proxy needed · Runs on the edge</span>
    <a href="${baseUrl}/health">Status</a>
  </footer>
</div>
</body>
</html>`
  return c.html(html)
})

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
        let text = formatPost(post, { truncate: false })
        if (comments?.items.length) {
          text += `\n\n── Comments (${comments.items.length}) ──\n\n`
          text += comments.items.map((c) => formatComment(c, 0, { truncate: false })).join('\n\n')
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
        const formatted = listing.items.map((p) => formatPost(p)).join('\n\n---\n\n')
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
        const formatted = result.listing.items.map((p) => formatPost(p)).join('\n\n---\n\n')
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

  return await transport.handleRequest(c.req.raw)
})

// ── Export ─────────────────────────────────────────────────────────────

export default app
