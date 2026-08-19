// Pixiv OAuth token 授予：经中继打 oauth.secure.pixiv.net（浏览器无法直连）
// 参数与鸿蒙端 OAuthService 对齐；refresh_token 轮换制，响应的新 refresh_token 必须写回

import { relayRequest } from './relay'
import type { PixivOAuthTokenResponse } from './types'

const OAUTH_TOKEN_URL = 'https://oauth.secure.pixiv.net/auth/token'
const CLIENT_ID = 'MOBrBDS8blbauoSck0ZfDbtuzpyT'
const CLIENT_SECRET = 'lsACyCD94FhDUtGTXi3QzcFE2uU1hqtDaKeqrdwj'

export class PixivCredentialInvalidError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PixivCredentialInvalidError'
  }
}

/** 用 refresh_token 换 token 对；凭证失效抛 PixivCredentialInvalidError，临时故障抛普通 Error */
export async function pixivTokenGrant(refreshToken: string): Promise<PixivOAuthTokenResponse> {
  const form = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    include_policy: 'true',
  })
  const result = await relayRequest({
    method: 'POST',
    url: OAUTH_TOKEN_URL,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  })
  const bodyText = result.bodyText
  if (result.status !== 200) {
    // invalid_grant 等 OAuth 错误 = 凭证失效；5xx/网络 = 临时故障
    if (result.status === 400 || result.status === 401 || result.status === 403) {
      let msg = 'Pixiv 凭证失效'
      try {
        const err = JSON.parse(bodyText) as { errors?: { system?: { message?: string } }; error_description?: string }
        msg = err.error_description ?? err.errors?.system?.message ?? msg
      } catch { /* 保留默认 */ }
      throw new PixivCredentialInvalidError(msg)
    }
    throw new Error(`Pixiv token 接口异常（上游 ${result.status}）`)
  }
  const data = JSON.parse(bodyText) as PixivOAuthTokenResponse
  if (!data.access_token || !data.user?.id) {
    throw new PixivCredentialInvalidError('Pixiv token 响应缺少 access_token 或用户信息')
  }
  return data
}

/** 从粘贴内容提取 refresh_token：兼容鸿蒙端导出的 JSON（refreshToken/refresh_token 字段），去内部空白 */
export function extractRefreshToken(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) return ''
  if (trimmed.startsWith('{')) {
    try {
      const obj = JSON.parse(trimmed) as Record<string, unknown>
      const t = obj.refreshToken ?? obj.refresh_token
      if (typeof t === 'string') return t.replace(/\s+/g, '')
    } catch { /* 按纯文本处理 */ }
  }
  return trimmed.replace(/\s+/g, '')
}

/** 判断 Pixiv API 响应是否为鉴权错误（内层 status 语义，对齐鸿蒙端 isAuthErrorResponse） */
export function isPixivAuthError(status: number, bodyText: string): boolean {
  if (status === 401) return true
  if (status !== 400) return false
  const lower = bodyText.toLowerCase()
  return (
    lower.includes('invalid access token') ||
    lower.includes('invalid_grant') ||
    lower.includes('invalid refresh token') ||
    lower.includes('access token has expired')
  )
}
