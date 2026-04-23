/**
 * MCP text formatters — shared between stdio and worker MCP entry points.
 */

import type { Comment, OverviewEntry, Post, SearchResult, Subreddit, UserSummary } from './domain'

export const formatPost = (post: Post, opts: { truncate?: boolean } = {}): string => {
  const { truncate = true } = opts
  const lines = [
    `📝 ${post.title}`,
    `   r/${post.subreddit.name} • u/${post.author.name} • ${post.createdUtc}`,
    `   ⬆ ${post.score} | 💬 ${post.numComments}${post.over18 ? ' | 🔞 NSFW' : ''}`,
    `   https://reddit.com${post.permalink}`,
  ]
  if (post.selftext) {
    const snippet = truncate && post.selftext.length > 500 ? `${post.selftext.slice(0, 500)}…` : post.selftext
    lines.push(`\n${snippet}`)
  }
  if (post.url && !post.isSelf) {
    lines.push(`   🔗 ${post.url}`)
  }
  return lines.join('\n')
}

export const formatComment = (comment: Comment, indent = 0, opts: { truncate?: boolean } = {}): string => {
  const { truncate = true } = opts
  const pad = '  '.repeat(indent)
  const body = truncate && comment.body.length > 300 ? `${comment.body.slice(0, 300)}…` : comment.body
  const lines = [
    `${pad}💬 u/${comment.author} • ⬆ ${comment.score} • ${comment.createdUtc}`,
    `${pad}${body}`,
  ]
  if (comment.replies?.length) {
    for (const reply of comment.replies.slice(0, 3)) {
      lines.push(formatComment(reply, indent + 1, opts))
    }
  }
  return lines.join('\n')
}

export const formatSubreddit = (sub: Subreddit): string => {
  const lines = [
    `📌 r/${sub.name}${sub.nsfw ? ' 🔞' : ''}`,
    `   ${sub.title}`,
    `   👥 ${sub.subscribers.toLocaleString()} subscribers`,
  ]
  if (sub.activeUserCount) {
    lines.push(`   🟢 ${sub.activeUserCount.toLocaleString()} online`)
  }
  if (sub.publicDescription) {
    lines.push(`   ${sub.publicDescription}`)
  }
  return lines.join('\n')
}

export const formatUser = (user: UserSummary): string => {
  const lines = [
    `👤 u/${user.username}`,
    `   Joined: ${user.createdUtc}`,
    `   Karma: ${user.karma?.total?.toLocaleString() ?? 'N/A'} (post: ${user.karma?.link?.toLocaleString() ?? '?'}, comment: ${user.karma?.comment?.toLocaleString() ?? '?'})`,
  ]
  if (user.isEmployee) lines.push('   🏢 Reddit Employee')
  if (user.isGold) lines.push('   ⭐ Reddit Premium')
  if (user.isMod) lines.push('   🛡️ Moderator')
  if (user.subreddit?.publicDescription) {
    lines.push(`   Bio: ${user.subreddit.publicDescription}`)
  }
  return lines.join('\n')
}

export const formatOverviewEntry = (entry: OverviewEntry): string => {
  if (entry.kind === 'post' && entry.post) return formatPost(entry.post)
  if (entry.kind === 'comment' && entry.comment) return formatComment(entry.comment)
  return ''
}

export const formatSearchResult = (result: SearchResult): string => {
  switch (result.kind) {
    case 'post':
      return formatPost(result.post)
    case 'comment':
      return formatComment(result.comment)
    case 'subreddit':
      return formatSubreddit(result.subreddit)
    case 'user':
      return formatUser(result.user)
  }
}
