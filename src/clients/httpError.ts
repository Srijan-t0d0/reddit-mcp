/**
 * Lightweight HTTP error class — replaces AxiosError for fetch-based requests.
 */

export class HttpError extends Error {
  public readonly status: number
  public readonly statusText: string
  public readonly url: string

  constructor(status: number, statusText: string, url: string) {
    super(`HTTP ${status} ${statusText} — ${url}`)
    this.name = 'HttpError'
    this.status = status
    this.statusText = statusText
    this.url = url
  }
}

export const isHttpError = (error: unknown): error is HttpError => {
  return error instanceof HttpError
}
