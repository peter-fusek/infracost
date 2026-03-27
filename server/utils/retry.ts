/**
 * Retry wrapper with exponential backoff for collector API calls.
 * Retries on transient failures (network errors, 5xx, rate limits).
 */

const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504])

function isRetryable(error: unknown): boolean {
  if (error instanceof TypeError && error.message.includes('fetch')) return true // network error
  if (error instanceof DOMException && error.name === 'AbortError') return false // timeout — don't retry
  if (error && typeof error === 'object' && 'status' in error) {
    return RETRYABLE_STATUS_CODES.has((error as { status: number }).status)
  }
  return false
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: { attempts?: number; baseDelayMs?: number; label?: string } = {},
): Promise<T> {
  const { attempts = 3, baseDelayMs = 1000, label = 'operation' } = options

  let lastError: unknown
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn()
    }
    catch (err) {
      lastError = err
      if (attempt === attempts || !isRetryable(err)) throw err

      const delay = baseDelayMs * Math.pow(2, attempt - 1)
      console.warn(`[retry] ${label} attempt ${attempt}/${attempts} failed, retrying in ${delay}ms`)
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }

  throw lastError
}

/**
 * Fetch with retry — wraps native fetch with retry on transient failures.
 * Throws on non-retryable errors and after all attempts exhausted.
 * Returns the Response (caller must check .ok).
 */
export async function fetchWithRetry(
  url: string,
  init?: RequestInit,
  options?: { attempts?: number; label?: string },
): Promise<Response> {
  return withRetry(async () => {
    const response = await fetch(url, init)
    if (!response.ok && RETRYABLE_STATUS_CODES.has(response.status)) {
      throw Object.assign(new Error(`HTTP ${response.status}`), { status: response.status })
    }
    return response
  }, { ...options, label: options?.label ?? url.split('?')[0]!.split('/').slice(-2).join('/') })
}
