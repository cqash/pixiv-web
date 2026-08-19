// 图片加载服务：/img/v1/fetch 需 Bearer 头，浏览器 <img> 裸引不可行 → fetch→blob→objectURL
// 内存 LRU（引用计数 + 空闲淘汰）+ 并发闸 + 同 URL 去重 + 失败重试一次
// 注意：错误响应是 JSON 不是图片，必须校验 blob.type；图片限流 300/min/账号

import { authorizedFetch, buildImageUrl } from './relay'

const MAX_ENTRIES = 200
const MAX_CONCURRENT = 6

interface CacheEntry {
  objectUrl: string
  refs: number
}

const cache = new Map<string, CacheEntry>() // key = pixiv 原始 URL
const inflight = new Map<string, Promise<string>>()
let active = 0
const waiters: Array<() => void> = []

async function acquireSlot(): Promise<void> {
  if (active >= MAX_CONCURRENT) {
    await new Promise<void>((resolve) => waiters.push(resolve))
  }
  active++
}

function releaseSlot(): void {
  active--
  waiters.shift()?.()
}

function touch(key: string, entry: CacheEntry): void {
  cache.delete(key)
  cache.set(key, entry)
}

function evictIfNeeded(): void {
  while (cache.size > MAX_ENTRIES) {
    let evicted = false
    for (const [k, v] of cache) {
      if (v.refs === 0) {
        URL.revokeObjectURL(v.objectUrl)
        cache.delete(k)
        evicted = true
        break
      }
    }
    if (!evicted) return // 全在引用中，先超容用着
  }
}

async function fetchImageBlob(pixivUrl: string): Promise<Blob> {
  const url = buildImageUrl(pixivUrl)
  let lastError: unknown = null
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const resp = await authorizedFetch(url)
      if (resp.ok) {
        const blob = await resp.blob()
        if (blob.type.startsWith('image/')) return blob
        throw new Error('图片响应非 image 类型')
      }
      if (resp.status === 404) throw new Error('图片不存在（404）')
      // 502/429/其他：重试一次
      lastError = new Error(`图片加载失败（${resp.status}）`)
    } catch (e) {
      lastError = e
      if (e instanceof Error && e.message.includes('404')) throw e
    }
  }
  throw lastError instanceof Error ? lastError : new Error('图片加载失败')
}

/**
 * 加载图片并返回 objectURL（引用计数 +1）。
 * 调用方（CachedImage）在卸载/换源时必须 releaseImage 配对释放。
 */
export async function loadImage(pixivUrl: string): Promise<string> {
  const cached = cache.get(pixivUrl)
  if (cached) {
    cached.refs++
    touch(pixivUrl, cached)
    return cached.objectUrl
  }
  const existing = inflight.get(pixivUrl)
  if (existing) return existing.then((objectUrl) => {
    const e = cache.get(pixivUrl)
    if (e) e.refs++
    return objectUrl
  })
  const p = (async () => {
    await acquireSlot()
    try {
      const blob = await fetchImageBlob(pixivUrl)
      const objectUrl = URL.createObjectURL(blob)
      const entry: CacheEntry = { objectUrl, refs: 1 }
      cache.set(pixivUrl, entry)
      touch(pixivUrl, entry)
      evictIfNeeded()
      return objectUrl
    } finally {
      releaseSlot()
      inflight.delete(pixivUrl)
    }
  })()
  inflight.set(pixivUrl, p)
  return p
}

/** 释放引用；归零后留在缓存里做 LRU 复用，淘汰时才 revoke */
export function releaseImage(pixivUrl: string): void {
  const entry = cache.get(pixivUrl)
  if (!entry) return
  entry.refs = Math.max(0, entry.refs - 1)
  evictIfNeeded()
}

/** 主动失效（如详情页收藏状态变更后强制重拉的场景） */
export function invalidateImage(pixivUrl: string): void {
  const entry = cache.get(pixivUrl)
  if (entry) {
    URL.revokeObjectURL(entry.objectUrl)
    cache.delete(pixivUrl)
  }
}
