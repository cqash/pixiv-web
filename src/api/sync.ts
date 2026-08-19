// /sync/v1 同步协议封装：分批 push / hasMore 续页 pull / 敏感字段剔除 / 每域游标持久化
// 协议权威：ArkPix/docs\backend-design.md §7；结构对齐鸿蒙端 SyncService.ets

import { authorizedGetJson, authorizedPostJson } from './relay'
import { ApiError } from './relayAuthApi'
import type { SyncEntry, SyncPullResponse, SyncPushResponse } from './types'

/** 单域单次 push 上限（协议 §7.2） */
export const SYNC_BATCH_LIMIT = 500

const TOKENS_KEY = 'arkpix.web.sync'

/** baseToken 过旧/不一致：服务端要求清空本地该域后全量重建 */
export class SyncFullRequiredError extends Error {
  constructor(public domain: string) {
    super(`同步域 ${domain} 需要全量重建（SYNC_FULL_REQUIRED）`)
    this.name = 'SyncFullRequiredError'
  }
}

function isFullRequired(e: unknown): boolean {
  return (
    e instanceof ApiError &&
    (e.status === 409 || e.code === 'SYNC_FULL_REQUIRED')
  )
}

/** 递归剔除任何层级键名含 "token"（不区分大小写）的字段，避免整批 400 SENSITIVE_FIELD_REJECTED */
export function stripTokenFields<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map((v) => stripTokenFields(v)) as T
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (k.toLowerCase().includes('token')) continue
    out[k] = stripTokenFields(v)
  }
  return out as T
}

// ---- syncToken 按域持久化：localStorage `arkpix.web.sync` = { [domain]: token } ----

function loadTokens(): Record<string, string> {
  try {
    const raw = localStorage.getItem(TOKENS_KEY)
    if (!raw) return {}
    const obj = JSON.parse(raw) as Record<string, unknown>
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === 'string') out[k] = v
    }
    return out
  } catch {
    return {}
  }
}

export function getSyncToken(domain: string): string {
  return loadTokens()[domain] ?? ''
}

export function setSyncToken(domain: string, token: string): void {
  const tokens = loadTokens()
  if (token) tokens[domain] = token
  else delete tokens[domain]
  localStorage.setItem(TOKENS_KEY, JSON.stringify(tokens))
}

/**
 * 推送一个域的条目：≤500 条/批自动分批，每批成功后落盘最新 syncToken。
 * 返回最终 syncToken（items 为空时不发请求，原样返回 baseToken）。
 * 409 SYNC_FULL_REQUIRED → 抛 SyncFullRequiredError，由上层清游标全量重建。
 */
export async function pushDomain<T>(
  domain: string,
  items: SyncEntry<T>[],
  baseToken: string,
): Promise<string> {
  let token = baseToken
  for (let offset = 0; offset < items.length; offset += SYNC_BATCH_LIMIT) {
    const batch = items.slice(offset, offset + SYNC_BATCH_LIMIT).map((e) => ({
      key: e.key,
      data: stripTokenFields(e.data),
      updatedAt: e.updatedAt,
      deleted: e.deleted,
    }))
    let resp: SyncPushResponse
    try {
      resp = await authorizedPostJson<SyncPushResponse>('/sync/v1/push', {
        domain,
        baseToken: token,
        items: batch,
      })
    } catch (e) {
      if (isFullRequired(e)) throw new SyncFullRequiredError(domain)
      throw e
    }
    if (resp.syncToken) {
      token = resp.syncToken
      setSyncToken(domain, token)
    }
  }
  return token
}

/**
 * 拉取一个域 since 之后的全部条目：hasMore 自动续页直到拉完。
 * 每页成功后落盘 syncToken；返回累计条目与最终 syncToken。
 * 409 SYNC_FULL_REQUIRED → 抛 SyncFullRequiredError。
 */
export async function pullDomain<T>(
  domain: string,
  since: string,
  limit = 100,
): Promise<{ items: SyncEntry<T>[]; syncToken: string }> {
  const items: SyncEntry<T>[] = []
  let token = since
  for (;;) {
    const path = `/sync/v1/pull?domain=${encodeURIComponent(domain)}&since=${encodeURIComponent(token)}&limit=${limit}`
    let resp: SyncPullResponse<T>
    try {
      resp = await authorizedGetJson<SyncPullResponse<T>>(path)
    } catch (e) {
      if (isFullRequired(e)) throw new SyncFullRequiredError(domain)
      throw e
    }
    items.push(...(resp.items ?? []))
    if (resp.syncToken) {
      token = resp.syncToken
      setSyncToken(domain, token)
    }
    if (!resp.hasMore) break
  }
  return { items, syncToken: token }
}
