// Pixiv API 层：全部经中继 /relay/v1/request 调用，响应为原生 Pixiv JSON
// 内层 status（Pixiv 真实状态码）鉴权错误 → 单飞刷新 Pixiv token 并重放一次

import { isPixivAuthError, PixivCredentialInvalidError } from './pixivOAuth'
import { relayRequest } from './relay'
import { getValidPixivToken, refreshPixivTokens } from '../stores/pixivAuth'
import type {
  AutocompleteResult,
  CommentListPage,
  Illust,
  IllustListPage,
  TrendingTagsPage,
  UserDetail,
  UserListPage,
} from './types'

const API_BASE = 'https://app-api.pixiv.net'

export class PixivApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
    this.name = 'PixivApiError'
  }
}

async function pixivFetch(
  method: string,
  url: string,
  formBody?: URLSearchParams,
  allowRetry = true,
): Promise<string> {
  const token = await getValidPixivToken()
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'Accept-Language': 'zh-CN',
  }
  if (formBody) headers['Content-Type'] = 'application/x-www-form-urlencoded'
  const result = await relayRequest({
    method,
    url,
    headers,
    body: formBody ? formBody.toString() : '',
  })
  if (result.status >= 200 && result.status < 300) return result.bodyText
  if (isPixivAuthError(result.status, result.bodyText) && allowRetry) {
    const ok = await refreshPixivTokens()
    if (!ok) throw new PixivCredentialInvalidError('Pixiv 凭证已失效，请重新登录')
    return pixivFetch(method, url, formBody, false)
  }
  let msg = `Pixiv 请求失败（${result.status}）`
  try {
    const err = JSON.parse(result.bodyText) as {
      error?: { user_message?: string; message?: string }
    }
    msg = err.error?.user_message || err.error?.message || msg
  } catch { /* 保留默认 */ }
  throw new PixivApiError(result.status, msg)
}

async function getJson<T>(pathWithQuery: string): Promise<T> {
  const text = await pixivFetch('GET', pathWithQuery)
  return (text ? JSON.parse(text) : {}) as T
}

/** 通用游标续页：next_url 原样作为 url 再走中继 */
export async function fetchNext<T>(nextUrl: string): Promise<T> {
  const text = await pixivFetch('GET', nextUrl)
  return (text ? JSON.parse(text) : {}) as T
}

function q(params: Record<string, string | number | undefined>): string {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') sp.set(k, String(v))
  }
  return sp.toString()
}

// ---- 列表端点 ----

export const fetchRecommended = () =>
  getJson<IllustListPage>(`${API_BASE}/v1/illust/recommended?filter=for_android`)

export const fetchFollowIllusts = (restrict: 'public' | 'private' = 'public') =>
  getJson<IllustListPage>(`${API_BASE}/v2/illust/follow?${q({ restrict, filter: 'for_android' })}`)

export const fetchNewIllusts = () =>
  getJson<IllustListPage>(`${API_BASE}/v1/illust/new?filter=for_android`)

export const fetchRanking = (mode: string, date?: string) =>
  getJson<IllustListPage>(
    `${API_BASE}/v1/illust/ranking?${q({ mode, date, filter: 'for_android' })}`,
  )

export const fetchIllustDetail = (illustId: number | string) =>
  getJson<{ illust: Illust }>(
    `${API_BASE}/v1/illust/detail?${q({ illust_id: illustId, filter: 'for_android' })}`,
  )

export const fetchRelated = (illustId: number | string) =>
  getJson<IllustListPage>(
    `${API_BASE}/v2/illust/related?${q({ illust_id: illustId, filter: 'for_android' })}`,
  )

export const fetchComments = (illustId: number | string) =>
  getJson<CommentListPage>(`${API_BASE}/v3/illust/comments?${q({ illust_id: illustId })}`)

export const fetchCommentReplies = (commentId: number | string) =>
  getJson<CommentListPage>(`${API_BASE}/v2/illust/comment/replies?${q({ comment_id: commentId })}`)

export const fetchUserDetail = (userId: number | string) =>
  getJson<UserDetail>(`${API_BASE}/v1/user/detail?${q({ user_id: userId })}`)

export const fetchUserIllusts = (userId: number | string, type: 'illust' | 'manga' = 'illust') =>
  getJson<IllustListPage>(
    `${API_BASE}/v1/user/illusts?${q({ user_id: userId, type, filter: 'for_android' })}`,
  )

export const fetchUserBookmarks = (
  userId: number | string,
  restrict: 'public' | 'private' = 'public',
) =>
  getJson<IllustListPage>(
    `${API_BASE}/v1/user/bookmarks/illust?${q({ user_id: userId, restrict, filter: 'for_android' })}`,
  )

export interface SearchOptions {
  sort?: 'date_desc' | 'date_asc' | 'popular_desc'
  searchTarget?: 'partial_match_for_tags' | 'exact_match_for_tags' | 'title_and_caption'
  duration?: 'within_last_day' | 'within_last_week' | 'within_last_month'
}

export const searchIllust = (word: string, opts: SearchOptions = {}) =>
  getJson<IllustListPage>(
    `${API_BASE}/v1/search/illust?${q({
      word,
      filter: 'for_android',
      sort: opts.sort,
      search_target: opts.searchTarget,
      duration: opts.duration,
    })}`,
  )

export const searchUser = (word: string) =>
  getJson<UserListPage>(`${API_BASE}/v1/search/user?${q({ word })}`)

export const fetchAutocomplete = (word: string) =>
  getJson<AutocompleteResult>(
    `${API_BASE}/v2/search/autocomplete?${q({ word, merge_plain_keyword_results: 'true' })}`,
  )

export const fetchTrendingTags = () =>
  getJson<TrendingTagsPage>(`${API_BASE}/v1/trending-tags/illust?filter=for_android`)

// ---- 写操作（必须 application/x-www-form-urlencoded） ----

export async function bookmarkAdd(
  illustId: number | string,
  restrict: 'public' | 'private' = 'public',
  tags: string[] = [],
): Promise<void> {
  const form = new URLSearchParams({ illust_id: String(illustId), restrict })
  for (const t of tags) form.append('tags[]', t)
  await pixivFetch('POST', `${API_BASE}/v2/illust/bookmark/add`, form)
}

export async function bookmarkDelete(illustId: number | string): Promise<void> {
  await pixivFetch(
    'POST',
    `${API_BASE}/v1/illust/bookmark/delete`,
    new URLSearchParams({ illust_id: String(illustId) }),
  )
}

export async function followAdd(
  userId: number | string,
  restrict: 'public' | 'private' = 'public',
): Promise<void> {
  await pixivFetch(
    'POST',
    `${API_BASE}/v1/user/follow/add`,
    new URLSearchParams({ user_id: String(userId), restrict }),
  )
}

export async function followDelete(userId: number | string): Promise<void> {
  await pixivFetch(
    'POST',
    `${API_BASE}/v1/user/follow/delete`,
    new URLSearchParams({ user_id: String(userId) }),
  )
}

export async function commentAdd(
  illustId: number | string,
  comment: string,
  parentCommentId?: number | string,
): Promise<void> {
  const form = new URLSearchParams({ illust_id: String(illustId), comment })
  if (parentCommentId) form.set('parent_comment_id', String(parentCommentId))
  await pixivFetch('POST', `${API_BASE}/v1/illust/comment/add`, form)
}
