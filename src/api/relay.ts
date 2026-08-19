// 中继客户端：带鉴权的 fetch（401 单飞刷新重放）+ /relay/v1/request 信封封装

import { ApiError, parseErrorResponse } from './relayAuthApi'
import { getValidRelayToken, refreshRelayTokens, useRelayAuthStore } from '../stores/relayAuth'
import { base64ToUtf8, utf8ToBase64 } from '../utils/base64'
import type { RelayEnvelopeRequest, RelayEnvelopeResponse } from './types'

/** 带 Bearer 的 fetch；外层 401 时刷新 relay token 并重放一次 */
export async function authorizedFetch(
  path: string,
  init: RequestInit = {},
  allowRetry = true,
): Promise<Response> {
  const store = useRelayAuthStore()
  const token = await getValidRelayToken()
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${token}`)
  const resp = await fetch(store.serverUrl + path, { ...init, headers })
  if (resp.status === 401 && allowRetry && !store.staticMode) {
    const ok = await refreshRelayTokens()
    if (!ok) throw new ApiError(401, 'INVALID_TOKEN', '中继登录已过期，请重新登录')
    return authorizedFetch(path, init, false)
  }
  return resp
}

/** 带鉴权 POST JSON，解析统一错误格式 */
export async function authorizedPostJson<T>(path: string, body: unknown): Promise<T> {
  const resp = await authorizedFetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!resp.ok) throw await parseErrorResponse(resp)
  return (await resp.json()) as T
}

export async function authorizedGetJson<T>(path: string): Promise<T> {
  const resp = await authorizedFetch(path)
  if (!resp.ok) throw await parseErrorResponse(resp)
  return (await resp.json()) as T
}

export interface RelayCallInput {
  method?: string
  url: string
  headers?: Record<string, string>
  /** 请求体原文（utf-8），无 body 传 '' */
  body?: string
  timeoutMs?: number
}

export interface RelayCallResult {
  /** 上游（Pixiv）真实状态码 */
  status: number
  headers: Record<string, string>
  /** 上游响应体原文（utf-8 解码后） */
  bodyText: string
}

/**
 * 调 /relay/v1/request 透传 Pixiv API。
 * 外层 HTTP 200 ≠ 业务成功，调用方必须判 result.status。
 */
export async function relayRequest(input: RelayCallInput): Promise<RelayCallResult> {
  const envelope: RelayEnvelopeRequest = {
    method: input.method ?? 'GET',
    url: input.url,
    headers: input.headers ?? {},
    bodyBase64: input.body ? utf8ToBase64(input.body) : '',
    timeoutMs: input.timeoutMs ?? 30000,
  }
  const resp = await authorizedPostJson<RelayEnvelopeResponse>('/relay/v1/request', envelope)
  return {
    status: resp.status,
    headers: resp.headers ?? {},
    bodyText: resp.bodyBase64 ? base64ToUtf8(resp.bodyBase64) : '',
  }
}

/** 图片中继 URL 构造（含绝对 serverUrl 前缀；同源部署时 serverUrl 为空串） */
export function buildImageUrl(pixivUrl: string): string {
  const store = useRelayAuthStore()
  if (pixivUrl.startsWith('/img/v1/fetch') || pixivUrl.includes('/img/v1/fetch?')) return pixivUrl
  return `${store.serverUrl}/img/v1/fetch?url=${encodeURIComponent(pixivUrl)}`
}
