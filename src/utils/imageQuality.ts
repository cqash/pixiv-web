// 图片画质选档：直接取 API 返回的档位字段，不做 URL 字符串变换（对齐鸿蒙端 ImageUrlUtils）

import type { Illust, PixivImageUrls } from '../api/types'

/** 列表预览画质：0=缩略 1=中 2=大 */
export type PreviewQuality = 0 | 1 | 2
/** 详情/查看器画质：0=大图 1=原图 */
export type DetailQuality = 0 | 1

function first(...candidates: Array<string | undefined>): string {
  for (const c of candidates) if (c) return c
  return ''
}

export function pickPreviewUrl(illust: Illust, quality: PreviewQuality): string {
  const u = illust.image_urls
  switch (quality) {
    case 0:
      return first(u.square_medium, u.medium, u.large)
    case 1:
      return first(u.medium, u.large, u.original)
    case 2:
      return first(u.large, u.medium, u.original)
  }
}

function pageUrls(illust: Illust, pageIndex: number): PixivImageUrls {
  const hasMetaPage = illust.page_count > 1 && pageIndex < illust.meta_pages.length
  return hasMetaPage ? illust.meta_pages[pageIndex].image_urls : illust.image_urls
}

export function pickDetailUrl(illust: Illust, pageIndex: number, quality: DetailQuality): string {
  const hasMetaPage = illust.page_count > 1 && pageIndex < illust.meta_pages.length
  const u = pageUrls(illust, pageIndex)
  if (quality === 1) {
    return hasMetaPage
      ? first(u.original, u.large, u.medium)
      : first(illust.meta_single_page?.original_image_url, u.large, u.original, u.medium)
  }
  return first(u.large, u.medium)
}

/** 推断图片扩展名（下载文件名用） */
export function imageExt(url: string): string {
  const m = /\.(jpe?g|png|gif|webp)(\?|$)/i.exec(url)
  return m ? m[1].toLowerCase() : 'jpg'
}
