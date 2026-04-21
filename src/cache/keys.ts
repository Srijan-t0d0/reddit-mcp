import type { RuntimeBindings } from '../env'

const normalizeEnv = (env: RuntimeBindings): string =>
  (env.ENVIRONMENT ?? 'local').toLowerCase()

const normalizeIdentifier = (value: string): string => value.trim().toLowerCase()

const encodeValue = (value: unknown): string => {
  if (Array.isArray(value)) {
    return value.map((item) => encodeValue(item)).join(',')
  }
  if (value && typeof value === 'object') {
    return `{${encodeRecord(value as Record<string, unknown>)}}`
  }
  if (typeof value === 'boolean') {
    return value ? '1' : '0'
  }
  if (value === null || value === undefined) {
    return ''
  }
  return String(value)
}

const encodeRecord = (record: Record<string, unknown>): string =>
  Object.entries(record)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${encodeValue(value)}`)
    .join('&')

const joinParts = (...parts: string[]): string => parts.filter(Boolean).join(':')

export const subredditAboutKey = (env: RuntimeBindings, name: string): string =>
  joinParts('reddit', normalizeEnv(env), 'subreddits', normalizeIdentifier(name), 'about')

export const subredditPostsKey = (
  env: RuntimeBindings,
  name: string,
  params: Record<string, unknown>,
): string =>
  joinParts(
    'reddit',
    normalizeEnv(env),
    'subreddits',
    normalizeIdentifier(name),
    'posts',
    encodeRecord(params),
  )

export const postKey = (
  env: RuntimeBindings,
  postId: string,
  params: Record<string, unknown>,
): string =>
  joinParts('reddit', normalizeEnv(env), 'posts', normalizeIdentifier(postId), encodeRecord(params))

export const userAboutKey = (env: RuntimeBindings, username: string): string =>
  joinParts('reddit', normalizeEnv(env), 'users', normalizeIdentifier(username), 'about')

export const userOverviewKey = (
  env: RuntimeBindings,
  username: string,
  params: Record<string, unknown>,
): string =>
  joinParts(
    'reddit',
    normalizeEnv(env),
    'users',
    normalizeIdentifier(username),
    'overview',
    encodeRecord(params),
  )

export const searchKey = (env: RuntimeBindings, params: Record<string, unknown>): string =>
  joinParts('reddit', normalizeEnv(env), 'search', encodeRecord(params))

export const multiFeedKey = (
  env: RuntimeBindings,
  subreddits: string[],
  params: Record<string, unknown>,
): string =>
  joinParts(
    'reddit',
    normalizeEnv(env),
    'feeds',
    'multi',
    encodeValue(subreddits.map((name) => normalizeIdentifier(name))),
    encodeRecord(params),
  )
