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

  // Warn once if PROXY_URL is set (not usable in CF Workers or native fetch)
  if (env.PROXY_URL) {
    console.warn('[redditHttp] PROXY_URL is set but ignored — native fetch does not support HTTP proxies.')
  }

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

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'User-Agent': randomUserAgent(),
          'Accept': 'application/json',
          'Accept-Encoding': 'gzip, deflate, br',
        },
        signal: AbortSignal.timeout(timeoutMs),
      })

      if (!response.ok) {
        throw new HttpError(response.status, response.statusText, url.toString())
      }

      const data = (await response.json()) as T
      return { data }
    },
  }
}
