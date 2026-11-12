# Reddit MCP

Reddit MCP server, REST API, and Apify scraper.

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
