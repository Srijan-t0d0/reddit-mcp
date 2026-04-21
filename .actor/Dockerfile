FROM oven/bun:1 AS builder
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production
COPY . .

FROM oven/bun:1-slim
WORKDIR /app
COPY --from=builder /app .
CMD ["bun", "run", "src/apify.ts"]
