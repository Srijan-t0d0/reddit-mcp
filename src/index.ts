import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { env, setEnv } from './env'
import { fetchPostById } from './services/redditPosts'
import { fetchSubredditPosts } from './services/redditPosts'
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

// ── Initialize env from process.env (Bun/Node) ────────────────────────
setEnv(process.env as Record<string, string | undefined>)

// ── MCP Server ──────────────────────────────────────────────────────────

const server = new McpServer({
  name: 'reddit',
  version: '1.0.0',
})

// ── Tools ───────────────────────────────────────────────────────────────

server.tool(
  'search_reddit',
  'Search Reddit for posts, comments, subreddits, or users',
  {
    query: z.string().describe('Search query'),
    type: z.enum(['posts', 'comments', 'subreddits', 'users']).optional().describe('Type of results to search for'),
    sort: z.enum(['relevance', 'hot', 'top', 'new', 'comments']).optional().describe('Sort order'),
    time: z.enum(['hour', 'day', 'week', 'month', 'year', 'all']).optional().describe('Time filter (for top/comments sort)'),
    subreddit: z.string().optional().describe('Restrict search to a specific subreddit'),
    limit: z.number().min(1).max(100).optional().describe('Number of results (default 25)'),
    after: z.string().optional().describe('Pagination cursor — fetch next page'),
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
    time: z.enum(['hour', 'day', 'week', 'month', 'year', 'all']).optional().describe('Time filter (for top/controversial)'),
    limit: z.number().min(1).max(100).optional().describe('Number of posts (default 25)'),
    after: z.string().optional().describe('Pagination cursor — fetch next page'),
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
    time: z.enum(['hour', 'day', 'week', 'month', 'year', 'all']).optional().describe('Time filter (for top/controversial)'),
    limit: z.number().min(1).max(100).optional().describe('Number of items (default 25)'),
    after: z.string().optional().describe('Pagination cursor — fetch next page'),
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
    time: z.enum(['hour', 'day', 'week', 'month', 'year', 'all']).optional().describe('Time filter (for top/controversial)'),
    limit: z.number().min(1).max(100).optional().describe('Total number of posts to return'),
    perSubreddit: z.number().min(1).max(50).optional().describe('Posts to fetch per subreddit before merging'),
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

// ── Start ───────────────────────────────────────────────────────────────

const transport = new StdioServerTransport()
await server.connect(transport)
console.error('Reddit MCP server running on stdio')
