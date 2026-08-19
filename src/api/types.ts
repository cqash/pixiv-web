// Pixiv API 原生数据结构（snake_case，与中继解包后的 JSON 一致）

export interface PixivImageUrls {
  square_medium?: string
  medium?: string
  large?: string
  original?: string
}

export interface PixivProfileImageUrls {
  px_50x50?: string
  px_170x170?: string
  medium?: string
}

export interface PixivUser {
  id: number
  name: string
  account: string
  profile_image_urls: PixivProfileImageUrls
  comment?: string
  is_followed?: boolean
}

export interface PixivTag {
  name: string
  translated_name?: string
}

export interface PixivMetaPage {
  image_urls: PixivImageUrls
}

export interface Illust {
  id: number
  title: string
  type: string // "illust" | "manga" | "ugoira"
  caption?: string
  image_urls: PixivImageUrls
  meta_single_page: { original_image_url?: string }
  meta_pages: PixivMetaPage[]
  user: PixivUser
  tags: PixivTag[]
  create_date: string
  page_count: number
  width: number
  height: number
  total_view: number
  total_bookmarks: number
  is_bookmarked: boolean
  restrict: number
  x_restrict: number // 0=全年龄 1=R-18 2=R-18G
  illust_ai_type: number // 2=AI 生成
  sanity_level?: number
  visible?: boolean
  is_muted?: boolean
}

export interface IllustListPage {
  illusts: Illust[]
  next_url: string | null
}

export interface PixivProfile {
  total_follow_users?: number
  total_illusts?: number
  total_manga?: number
  total_illust_bookmarks_public?: number
  total_illust_series?: number
  total_novels?: number
  [key: string]: unknown
}

export interface UserDetail {
  user: PixivUser
  profile: PixivProfile
}

export interface PixivComment {
  id: number
  comment: string
  date: string
  user: PixivUser
  parent_comment?: { id: number; user: { id: number; name: string } } | null
  has_replies?: boolean
  stamp?: { stamp_id: number; stamp_url: string } | null
}

export interface CommentListPage {
  comments: PixivComment[]
  next_url: string | null
}

export interface UserPreview {
  user: PixivUser
  illusts: Illust[]
  is_muted?: boolean
}

export interface UserListPage {
  user_previews: UserPreview[]
  next_url: string | null
}

export interface TrendingTag {
  tag: string
  translated_name?: string
  illust: Illust
}

export interface TrendingTagsPage {
  trend_tags: TrendingTag[]
}

export interface AutocompleteTag {
  name: string
  translated_name?: string
}

export interface AutocompleteResult {
  tags: AutocompleteTag[]
}

// ---- 中继自有模型（camelCase） ----

export interface RegisterResponse {
  accessToken: string
  refreshToken: string
  expiresIn: number // 秒
  accountKey?: string
  serverVersion: string
  capabilities: string[]
  requestId: string
}

export interface RelayEnvelopeRequest {
  method: string
  url: string
  headers: Record<string, string>
  bodyBase64: string
  timeoutMs: number
}

export interface RelayEnvelopeResponse {
  status: number
  headers: Record<string, string>
  bodyBase64: string
  requestId: string
}

export interface SyncEntry<T = unknown> {
  key: string
  data: T
  updatedAt: number
  deleted: boolean
}

export interface SyncPullResponse<T = unknown> {
  items: SyncEntry<T>[]
  syncToken: string
  hasMore: boolean
  requestId: string
}

export interface SyncPushResponse {
  accepted: number
  syncToken: string
  conflicts: unknown[]
  requestId: string
}

export interface RecoverPage {
  page: number
  url: string
  width: number
  height: number
}

export interface RecoverResponse {
  status: 'ready' | 'fetching' | 'not_found'
  pages?: RecoverPage[]
  source?: string
  meta?: Record<string, unknown>
  retryAfterSec?: number
}

export interface PixivOAuthTokenResponse {
  access_token: string
  refresh_token: string
  expires_in: number
  token_type: string
  scope: string
  user: {
    id: string
    name: string
    account: string
    profile_image_urls: PixivProfileImageUrls
  }
  response?: unknown
}
