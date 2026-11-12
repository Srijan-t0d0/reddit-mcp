import { afterEach, expect, test } from 'bun:test'
import app from './app'
import { resetEnv } from './env'

const originalToken = process.env.API_AUTH_TOKEN

afterEach(() => {
  if (originalToken === undefined) delete process.env.API_AUTH_TOKEN
  else process.env.API_AUTH_TOKEN = originalToken
  resetEnv()
})

test('Vercel health check is public and identifies the runtime', async () => {
  delete process.env.API_AUTH_TOKEN
  const response = await app.request('/health')
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({ runtime: 'vercel-bun' })
})

test('Vercel API and MCP fail closed without an authentication token', async () => {
  delete process.env.API_AUTH_TOKEN
  for (const path of ['/api/search', '/mcp']) {
    expect((await app.request(path)).status).toBe(503)
  }
})

test('Vercel API and MCP reject missing or incorrect credentials', async () => {
  process.env.API_AUTH_TOKEN = 'test-api-token'
  for (const path of ['/api/search', '/mcp']) {
    expect((await app.request(path)).status).toBe(401)
    expect((await app.request(path, {
      headers: { Authorization: 'Bearer incorrect' },
    })).status).toBe(401)
  }
})

test('Vercel connection examples include placeholder bearer headers, not the real token', async () => {
  process.env.API_AUTH_TOKEN = 'test-private-api-token'
  const response = await app.request('/')
  const html = await response.text()
  expect(html).toContain('Authorization: Bearer YOUR_API_AUTH_TOKEN')
  expect(html).not.toContain('test-private-api-token')
  expect(html).toContain('Vercel · Bun')
  expect(html).toContain('Public trials are paused due to abuse.')
  expect(html).toContain('mailto:srijandev01@gmail.com?subject=Reddit%20MCP%20access%20request')
})

test('authorized Vercel MCP requests initialize the shared server', async () => {
  process.env.API_AUTH_TOKEN = 'test-api-token'
  const response = await app.request('/mcp', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer test-api-token',
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'test', version: '1.0' } },
    }),
  })
  expect(response.status).toBe(200)
  expect(await response.text()).toContain('"serverInfo":{"name":"reddit"')
})

test('authorized Vercel API requests reach the shared routes', async () => {
  process.env.API_AUTH_TOKEN = 'test-api-token'
  const response = await app.request('/api/search', {
    headers: { Authorization: 'Bearer test-api-token' },
  })
  expect(response.status).toBe(400)
  expect(await response.json()).toMatchObject({ error: 'query param "q" is required' })
})
