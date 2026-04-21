export interface RuntimeBindings {
  APP_VERSION?: string
  ENVIRONMENT?: string
  REDIS_URL?: string
  CACHE_LOG_INTERVAL_MS?: string
  METRICS_AUTH_USERNAME?: string
  METRICS_AUTH_PASSWORD?: string
  PROXY_URL?: string
  [key: string]: string | undefined
}

export let env: RuntimeBindings = {}

export const setEnv = (overrides: Partial<RuntimeBindings> = {}): RuntimeBindings => {
  const sanitizedEntries = Object.entries(overrides).filter(([, value]) => value !== undefined)
  const sanitizedOverrides = Object.fromEntries(sanitizedEntries) as RuntimeBindings
  env = { ...sanitizedOverrides }
  return env
}

export const mergeEnv = (overrides: Partial<RuntimeBindings>): RuntimeBindings => {
  env = {
    ...env,
    ...overrides,
  }
  return env
}

export const resetEnv = (): RuntimeBindings => {
  env = {}
  return env
}
