// 管理端 /admin/v1 封装（设计文档 §14）：Bearer ADMIN_TOKEN 鉴权，独立于 relay/pixiv 双 token 体系。
// token 存 localStorage（arkpix.web.admin）；401 = token 失效 → 清 token 并跳 /admin/login。

import { ApiError, parseErrorResponse } from './relayAuthApi'

const TOKEN_KEY = 'arkpix.web.admin'

export function getAdminToken(): string {
  return localStorage.getItem(TOKEN_KEY) ?? ''
}

export function setAdminToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearAdminToken() {
  localStorage.removeItem(TOKEN_KEY)
}

/** 带 admin Bearer 的 fetch；401 时清 token 并整页跳转登录页（避免与 router 模块循环依赖） */
async function adminFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${getAdminToken()}`)
  const resp = await fetch(path, { ...init, headers })
  if (resp.status === 401) {
    clearAdminToken()
    if (!location.pathname.startsWith('/admin/login')) location.assign('/admin/login')
    throw new ApiError(401, 'INVALID_TOKEN', '管理 token 无效或已失效，请重新登录')
  }
  return resp
}

async function adminGetJson<T>(path: string): Promise<T> {
  const resp = await adminFetch(path)
  if (!resp.ok) throw await parseErrorResponse(resp)
  return (await resp.json()) as T
}

async function adminSendJson<T>(method: string, path: string, body?: unknown): Promise<T> {
  const resp = await adminFetch(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!resp.ok) throw await parseErrorResponse(resp)
  return (await resp.json()) as T
}

// ---- 类型（字段名以后端 internal/admin 为准）----

/** 单个可热改设置项：生效值 + 来源 */
export interface SettingInfo {
  value: number
  source: 'db' | 'env' | 'default'
}

export type AdminSettings = Record<string, SettingInfo>

export interface AdminOverview {
  serverVersion: string
  uptimeSec: number
  accounts: number
  devices: number
  cache: { bytes: number; entries: number }
  /** 恢复缓存按状态计数（status → 条数） */
  recoverCache: Record<string, number>
  settings: AdminSettings
}

export interface CacheStats {
  bytes: number
  entries: number
  maxBytes: number
  highWatermark: number
  layout: string
  dir: string
}

export interface CacheEvictResult {
  freedBytes: number
  freedEntries: number
  bytes: number
  entries: number
}

export interface AccountItem {
  id: number
  /** 毫秒时间戳 */
  createdAt: number
  deviceCount: number
  syncEntryCount: number
}

export interface DeviceItem {
  id: number
  deviceName: string
  /** 毫秒时间戳 */
  createdAt: number
  accessExpiresAt: number
  refreshExpiresAt: number
}

// ---- 端点 ----

export const getOverview = () => adminGetJson<AdminOverview>('/admin/v1/overview')

export const getSettings = () =>
  adminGetJson<{ settings: AdminSettings }>('/admin/v1/settings')

/** PATCH 部分键值（数字）；全部校验通过才生效，未知键/非法值 400 */
export const patchSettings = (patch: Record<string, number>) =>
  adminSendJson<{ settings: AdminSettings }>('PATCH', '/admin/v1/settings', patch)

export const getCacheStats = () => adminGetJson<CacheStats>('/admin/v1/cache/stats')

/** 阻塞式按水位淘汰，返回释放量与淘汰后用量 */
export const evictCache = () =>
  adminSendJson<CacheEvictResult>('POST', '/admin/v1/cache/evict')

export const listAccounts = (cursor = '', limit = 20) =>
  adminGetJson<{ items: AccountItem[]; nextCursor: string }>(
    `/admin/v1/accounts?limit=${limit}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
  )

export const listDevices = (accountId: number) =>
  adminGetJson<{ items: DeviceItem[] }>(`/admin/v1/accounts/${accountId}/devices`)

export const deleteDevice = (deviceId: number) =>
  adminSendJson<{ deleted: boolean }>('DELETE', `/admin/v1/devices/${deviceId}`)

export const deleteAccount = (accountId: number) =>
  adminSendJson<{ deleted: boolean }>('DELETE', `/admin/v1/accounts/${accountId}`)
