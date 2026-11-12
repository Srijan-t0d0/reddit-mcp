/**
 * Reddit HTTP client — native fetch() implementation.
 * Works on Bun, Node, and Cloudflare Workers.
 */

import { env } from '../env'
import { HttpError } from './httpError'

const REDDIT_BASE_URL = 'https://www.reddit.com'

// Static pool of browser User-Agent strings (replaces `user-agents` npm package)
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
  'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:126.0) Gecko/20100101 Firefox/126.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:126.0) Gecko/20100101 Firefox/126.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 Edg/125.0.0.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 OPR/111.0.0.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
]

const randomUserAgent = (): string =>
  USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]

// Webshare per-request session rotation: numeric suffix in the username picks
// a fresh sticky session (and therefore a fresh exit IP). Randomising it per
// request gives effective rotation without depending on the "-rotate" keyword.
// Template: http://<base>-{N}:<pw>@p.webshare.io:80  →  {N} is replaced.
const SESSION_PLACEHOLDER = '{N}'
const randomSession = (): string =>
  String(10_000 + Math.floor(Math.random() * 70_000))

const buildProxyUrl = (raw: string): string =>
  raw.includes(SESSION_PLACEHOLDER)
    ? raw.replace(SESSION_PLACEHOLDER, randomSession())
    : raw

export interface RedditHttpOptions {
  baseURL?: string
  timeoutMs?: number
}

export interface RedditHttpClient {
  get<T>(path: string, options?: { params?: Record<string, string | number | boolean | undefined> }): Promise<{ data: T }>
}

export const createRedditHttpClient = (
  options?: RedditHttpOptions,
): RedditHttpClient => {
  const baseURL = options?.baseURL ?? REDDIT_BASE_URL
  const timeoutMs = options?.timeoutMs ?? 100_000

  return {
    async get<T>(path: string, opts?: { params?: Record<string, string | number | boolean | undefined> }): Promise<{ data: T }> {
      const url = new URL(path, baseURL)

      if (opts?.params) {
        for (const [key, value] of Object.entries(opts.params)) {
          if (value !== undefined && value !== null) {
            url.searchParams.set(key, String(value))
          }
        }
      }

      const cookie = env.REDDIT_COOKIE?.trim()
      if (cookie && !/^[\x20-\x7e]+$/.test(cookie)) {
        throw new Error('REDDIT_COOKIE must be a single-line Cookie header value')
      }
      if (cookie && url.origin !== REDDIT_BASE_URL) {
        throw new Error('Authenticated Reddit requests must use https://www.reddit.com')
      }

      const init: RequestInit & { proxy?: string } = {
        method: 'GET',
        headers: {
          'User-Agent': randomUserAgent(),
          'Accept': 'application/json',
          'Accept-Encoding': 'gzip, deflate, br',
          ...(cookie ? { Cookie: cookie } : {}),
        },
        signal: AbortSignal.timeout(timeoutMs),
        // Never forward the account cookie through a redirect.
        ...(cookie ? { redirect: 'manual' as const } : {}),
      }

      if (env.PROXY_URL) {
        init.proxy = buildProxyUrl(env.PROXY_URL)
      }

      const response = await fetch(url.toString(), init)

      if (!response.ok) {
        throw new HttpError(response.status, response.statusText, url.toString())
      }

      const data = (await response.json()) as T
      return { data }
    },
  }
}
