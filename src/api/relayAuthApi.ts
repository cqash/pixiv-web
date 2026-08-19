// 中继认证原始调用（无状态、不依赖 store）：register / refresh

import type { RegisterResponse } from './types'

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public requestId = '',
    public retryAfter?: number,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

/** 规范化服务器地址：去空白、去尾斜杠；空串 = 同源（vite 代理 / embed 托管） */
export function normalizeServerUrl(input: string): string {
  let s = input.trim().replace(/\/+$/, '')
  return s
}

export async function parseErrorResponse(resp: Response): Promise<ApiError> {
  const retryAfterHeader = resp.headers.get('Retry-After')
  const retryAfter = retryAfterHeader ? Number(retryAfterHeader) : undefined
  let requestId = resp.headers.get('X-Request-Id') ?? ''
  try {
    const body = (await resp.json()) as {
      error?: { code?: string; message?: string; requestId?: string }
    }
    if (body.error) {
      return new ApiError(
        resp.status,
        body.error.code ?? 'UNKNOWN',
        body.error.message ?? resp.statusText,
        body.error.requestId ?? requestId,
        retryAfter,
      )
    }
  } catch {
    /* 非 JSON 错误体 */
  }
  return new ApiError(resp.status, 'HTTP_' + resp.status, resp.statusText, requestId, retryAfter)
}

export async function postJson<T>(
  base: string,
  path: string,
  body: unknown,
  token?: string,
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`
  const resp = await fetch(base + path, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
  if (!resp.ok) throw await parseErrorResponse(resp)
  return (await resp.json()) as T
}

export function register(
  base: string,
  deviceName: string,
  inviteCode?: string,
  accountKey?: string,
): Promise<RegisterResponse> {
  const body: Record<string, string> = { deviceName }
  if (inviteCode) body.inviteCode = inviteCode
  if (accountKey) body.accountKey = accountKey
  return postJson<RegisterResponse>(base, '/auth/v1/register', body)
}

export function refresh(base: string, refreshToken: string): Promise<RegisterResponse> {
  return postJson<RegisterResponse>(base, '/auth/v1/refresh', { refreshToken })
}
