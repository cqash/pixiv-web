// Relay 服务端认证状态：token 对 + 服务器地址，localStorage 持久化
// 注意：refresh 轮换制（refreshToken 单次使用），必须经 refreshTokens() 单飞锁串行刷新

import { defineStore } from 'pinia'
import { refresh as refreshRequest, normalizeServerUrl } from '../api/relayAuthApi'

const STORAGE_KEY = 'arkpix.web.relay'

interface PersistedRelayAuth {
  serverUrl: string
  accessToken: string
  refreshToken: string
  expiresAt: number // Unix 毫秒；静态 token 模式为 Infinity
  accountKey: string
  staticMode: boolean
}

interface RelayAuthState extends PersistedRelayAuth {}

function loadPersisted(): PersistedRelayAuth | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const obj = JSON.parse(raw) as Partial<PersistedRelayAuth>
    if (!obj.accessToken) return null
    return {
      serverUrl: obj.serverUrl ?? '',
      accessToken: obj.accessToken,
      refreshToken: obj.refreshToken ?? '',
      expiresAt: obj.expiresAt ?? 0,
      accountKey: obj.accountKey ?? '',
      staticMode: obj.staticMode ?? false,
    }
  } catch {
    return null
  }
}

export const useRelayAuthStore = defineStore('relayAuth', {
  state: (): RelayAuthState => ({
    serverUrl: '',
    accessToken: '',
    refreshToken: '',
    expiresAt: 0,
    accountKey: '',
    staticMode: false,
    ...(loadPersisted() ?? {}),
  }),
  getters: {
    isLoggedIn: (s) => !!s.accessToken,
  },
  actions: {
    persist() {
      const data: PersistedRelayAuth = {
        serverUrl: this.serverUrl,
        accessToken: this.accessToken,
        refreshToken: this.refreshToken,
        expiresAt: this.expiresAt,
        accountKey: this.accountKey,
        staticMode: this.staticMode,
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    },
    applyTokenResponse(serverUrl: string, resp: {
      accessToken: string
      refreshToken: string
      expiresIn: number
      accountKey?: string
    }) {
      this.serverUrl = normalizeServerUrl(serverUrl)
      this.accessToken = resp.accessToken
      this.refreshToken = resp.refreshToken
      this.expiresAt = Date.now() + resp.expiresIn * 1000
      if (resp.accountKey) this.accountKey = resp.accountKey
      this.staticMode = false
      this.persist()
    },
    /** STATIC_TOKENS 部署：直接填预置 token，永不过期，无需 refresh */
    loginWithStaticToken(serverUrl: string, token: string) {
      this.serverUrl = normalizeServerUrl(serverUrl)
      this.accessToken = token.trim()
      this.refreshToken = ''
      this.expiresAt = Number.POSITIVE_INFINITY
      this.accountKey = ''
      this.staticMode = true
      this.persist()
    },
    logout() {
      this.serverUrl = ''
      this.accessToken = ''
      this.refreshToken = ''
      this.expiresAt = 0
      this.accountKey = ''
      this.staticMode = false
      localStorage.removeItem(STORAGE_KEY)
    },
  },
})

// ---- 单飞刷新锁：并发请求共享同一次 refresh，避免轮换制下双发双双 401 ----
let refreshing: Promise<boolean> | null = null

export function refreshRelayTokens(): Promise<boolean> {
  if (refreshing) return refreshing
  refreshing = (async () => {
    const store = useRelayAuthStore()
    if (!store.refreshToken) return false
    try {
      const resp = await refreshRequest(store.serverUrl, store.refreshToken)
      store.applyTokenResponse(store.serverUrl, resp)
      return true
    } catch (e) {
      // refresh token 失效 → 清凭据回登录页
      if (e instanceof Error && 'status' in e && (e as { status: number }).status === 401) {
        store.logout()
      }
      return false
    }
  })().finally(() => {
    refreshing = null
  })
  return refreshing
}

const TOKEN_REFRESH_MARGIN_MS = 60_000

/** 取可用 access token：临期（60s 内过期）自动单飞刷新 */
export async function getValidRelayToken(): Promise<string> {
  const store = useRelayAuthStore()
  if (!store.accessToken) throw new Error('未登录中继服务器')
  if (!store.staticMode && store.expiresAt - Date.now() < TOKEN_REFRESH_MARGIN_MS) {
    const ok = await refreshRelayTokens()
    if (!ok) throw new Error('中继登录已过期，请重新登录')
  }
  return store.accessToken
}
