# Reddit MCP

Reddit MCP server and REST API, with a Cloudflare Worker deployment target and an optional Apify scraper adapter. Apify is not required.

## Quick start

Install [Bun](https://bun.sh), then run:

```sh
bun install --frozen-lockfile
cp .env.example .env
bun run start  # stdio MCP server
# Or: bun run api  # REST API on http://localhost:3000
```

Edit `.env` only if you need a cookie or proxy. Anonymous requests need neither. `.env` and local Wrangler `.dev.vars` files are ignored by Git; `.env.example` contains no credentials.

For an MCP client, configure `bun run src/index.ts` as the command, with this repository as the working directory. For Cloudflare development, run `bun run worker:dev`; deploy with `bun run worker:deploy` after configuring Wrangler authentication.

## Optional proxy (Bun only)

Set `PROXY_URL` in `.env` to an HTTP proxy URL such as `http://username:password@proxy.example.com:8080`. Cookie-authenticated requests use the same proxy. Use a trusted proxy: it handles authenticated Reddit traffic.

For Webshare session rotation, include `{N}` in the proxy username; each request replaces it with a random session number.

Proxy routing uses Bun's `fetch` extension. It is **not supported by this implementation on Cloudflare Workers or standard Node.js**. A cookie alone does not prevent Reddit from blocking datacenter IP addresses.

## Checks

```sh
bun test
bun run typecheck
bun run typecheck:worker
```

## Optional Reddit cookie

Set `REDDIT_COOKIE` to the **Cookie request header value** from a logged-in request to `https://www.reddit.com`, for example `reddit_session=...; other_cookie=...`. Do not include the `Cookie:` prefix, a `Set-Cookie` response header, or a JSON cookie export. The value must be one line.

This setting applies to all Reddit requests made by the MCP server, REST API, and Apify scraper. Without it, requests remain anonymous. Cookies are not automatically refreshed. Replace the secret when the session expires.

**Security:** All callers use the same Reddit account. A public server can expose content that this account can access, including private communities. Use a dedicated account and restrict server access before using a sensitive account. Never commit cookies or put them in tool arguments, URLs, logs, or `wrangler.toml`. Authenticated results bypass the shared application cache. Authenticated redirects are rejected to prevent forwarding the cookie elsewhere.

### Cloudflare Workers

Store the cookie as a Worker secret (the command prompts for its value):

```sh
bunx wrangler secret put REDDIT_COOKIE
bun run worker:deploy
```

For local Wrangler development, use an untracked `.dev.vars` file:

```dotenv
REDDIT_COOKIE="reddit_session=..."
```

### Local MCP, REST API, or scraper

Provide `REDDIT_COOKIE` through the process environment or an untracked `.env` file. Bun loads `.env` automatically.

```sh
bun run start  # stdio MCP
bun run api    # REST API
bun run apify  # scraper
```

### Apify

Set `REDDIT_COOKIE` as a secret environment variable in the Actor configuration. No cookie input field is needed: `src/apify.ts` loads it from the environment.

Cookies do not guarantee that Reddit will accept requests from Cloudflare or proxy IP addresses.
