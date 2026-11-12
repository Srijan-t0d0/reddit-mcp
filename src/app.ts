/** Vercel Bun entry point; reuse the existing HTTP and MCP routes. */
import { Hono } from 'hono'
import { bearerAuth } from 'hono/bearer-auth'
import worker from './worker'

const app = new Hono()

app.use('*', async (c, next) => {
  if (c.req.path === '/mcp' || c.req.path.startsWith('/api/')) {
    const token = process.env.API_AUTH_TOKEN
    if (!token) {
      return c.json({ ok: false, error: 'API authentication is not configured' }, 503)
    }
    return bearerAuth({ token })(c, next)
  }
  await next()
})

app.all('*', (c) => worker.fetch(c.req.raw, {
  ...process.env,
  RUNTIME: 'vercel-bun',
}))

export default app
