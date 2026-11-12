import { afterEach, expect, test } from 'bun:test'
import { createRedditHttpClient } from './redditHttp'
import { resetEnv, setEnv } from '../env'
import { CacheManager } from '../cache/cacheManager'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
  resetEnv()
})

test('sends the configured cookie only to Reddit and refuses redirects', async () => {
  setEnv({ REDDIT_COOKIE: ' reddit_session=test-session; over18=1 ' })
  let calls = 0
  globalThis.fetch = (async (url, init) => {
    calls++
    expect(String(url)).toBe('https://www.reddit.com/r/test.json')
    expect(new Headers(init?.headers).get('Cookie')).toBe('reddit_session=test-session; over18=1')
    expect(init?.redirect).toBe('manual')
    return Response.json({ ok: true })
  }) as typeof fetch

  const client = createRedditHttpClient()
  expect((await client.get('/r/test.json')).data).toEqual({ ok: true })
  await expect(client.get('https://example.com/')).rejects.toThrow('must use https://www.reddit.com')
  expect(calls).toBe(1)
})

test('rejects redirect responses without following them', async () => {
  setEnv({ REDDIT_COOKIE: 'reddit_session=test' })
  globalThis.fetch = (async (_url, init) => {
    expect(init?.redirect).toBe('manual')
    return new Response(null, { status: 302, headers: { Location: 'https://example.com/' } })
  }) as typeof fetch
  await expect(createRedditHttpClient().get('/r/test.json')).rejects.toMatchObject({ status: 302 })
})

test('anonymous requests have no cookie and keep default redirect behavior', async () => {
  globalThis.fetch = (async (_url, init) => {
    expect(new Headers(init?.headers).has('Cookie')).toBe(false)
    expect(init?.redirect).toBeUndefined()
    return Response.json({})
  }) as typeof fetch
  await createRedditHttpClient().get('/r/test.json')
})

test('rejects multiline cookies before making a request without exposing the value', async () => {
  setEnv({ REDDIT_COOKIE: 'secret\r\nInjected: value' })
  globalThis.fetch = (async () => { throw new Error('unexpected fetch') }) as unknown as typeof fetch
  await expect(createRedditHttpClient().get('/r/test.json')).rejects.toThrow(
    'REDDIT_COOKIE must be a single-line Cookie header value',
  )
})

test('authenticated requests neither read nor populate the anonymous cache', async () => {
  const cache = new CacheManager()
  let value = 'anonymous'
  const options = { key: 'same-key', ttlMs: 60_000, loader: async () => value }
  await cache.fetch(options)
  setEnv({ REDDIT_COOKIE: 'reddit_session=test' })
  value = 'private'
  const result = await cache.fetch(options)
  expect(result.value).toBe('private')
  expect(result.cache.maxAge).toBe(0)
  resetEnv()
  expect((await cache.fetch(options)).value).toBe('anonymous')
})
