// Pixiv 账号 token 状态：access/refresh + 当前用户，localStorage 持久化
// refresh_token 轮换制：每次刷新后新 refresh_token 必须写回（多设备共用会互相作废）

import { defineStore } from 'pinia'
import {
  PixivCredentialInvalidError,
  pixivTokenGrant,
} from '../api/pixivOAuth'
import type { PixivProfileImageUrls } from '../api/types'

const STORAGE_KEY = 'arkpix.web.pixiv'

export interface PixivAccount {
  id: string
  name: string
  account: string
  profileImage: string
}

interface PersistedPixivAuth {
  accessToken: string
  refreshToken: string
  expiresAt: number // Unix 毫秒
  user: PixivAccount | null
}

interface PixivAuthState extends PersistedPixivAuth {}

function loadPersisted(): PersistedPixivAuth | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const obj = JSON.parse(raw) as PersistedPixivAuth
    if (!obj.refreshToken) return null
    return obj
  } catch {
    return null
  }
}

export const usePixivAuthStore = defineStore('pixivAuth', {
  state: (): PixivAuthState => ({
    accessToken: '',
    refreshToken: '',
    expiresAt: 0,
    user: null,
    ...(loadPersisted() ?? {}),
  }),
  getters: {
    isLoggedIn: (s) => !!s.refreshToken,
  },
  actions: {
    persist() {
      const data: PersistedPixivAuth = {
        accessToken: this.accessToken,
        refreshToken: this.refreshToken,
        expiresAt: this.expiresAt,
        user: this.user,
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    },
    applyGrant(resp: {
      access_token: string
      refresh_token: string
      expires_in: number
      user: { id: string; name: string; account: string; profile_image_urls: PixivProfileImageUrls }
    }) {
      this.accessToken = resp.access_token
      this.refreshToken = resp.refresh_token // 轮换制：写回新 refresh_token
      this.expiresAt = Date.now() + resp.expires_in * 1000
      this.user = {
        id: resp.user.id,
        name: resp.user.name,
        account: resp.user.account,
        profileImage:
          resp.user.profile_image_urls?.medium ?? resp.user.profile_image_urls?.px_170x170 ?? '',
      }
      this.persist()
    },
    /** 粘贴 refresh_token 登录；错误描述经异常抛出（PixivCredentialInvalidError=凭证失效） */
    async loginWithRefreshToken(refreshToken: string) {
      const resp = await pixivTokenGrant(refreshToken)
      this.applyGrant(resp)
    },
    logout() {
      this.accessToken = ''
      this.refreshToken = ''
      this.expiresAt = 0
      this.user = null
      localStorage.removeItem(STORAGE_KEY)
    },
  },
})

// ---- 单飞刷新锁 ----
let refreshing: Promise<boolean> | null = null

export function refreshPixivTokens(): Promise<boolean> {
  if (refreshing) return refreshing
  refreshing = (async () => {
    const store = usePixivAuthStore()
    if (!store.refreshToken) return false
    try {
      const resp = await pixivTokenGrant(store.refreshToken)
      store.applyGrant(resp)
      return true
    } catch (e) {
      if (e instanceof PixivCredentialInvalidError) store.logout()
      return false
    }
  })().finally(() => {
    refreshing = null
  })
  return refreshing
}

const TOKEN_REFRESH_MARGIN_MS = 60_000

export async function getValidPixivToken(): Promise<string> {
  const store = usePixivAuthStore()
  if (!store.refreshToken) throw new PixivCredentialInvalidError('未登录 Pixiv')
  if (!store.accessToken || store.expiresAt - Date.now() < TOKEN_REFRESH_MARGIN_MS) {
    const ok = await refreshPixivTokens()
    if (!ok) throw new PixivCredentialInvalidError('Pixiv 凭证已失效，请重新登录')
  }
  return store.accessToken
}
