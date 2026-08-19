// 瀑布流列表状态的模块级缓存（跨组件实例共享，内存级，页面刷新即失效）
// 用途：详情页返回上级列表时原样恢复，不重拉（推荐等接口每次重拉返回新随机列表）
// 注意：必须放在独立模块，写在 <script setup> 顶层会变成每实例一份，缓存失效

import type { Illust } from '../api/types'

export interface WaterfallSnapshot {
  items: Illust[]
  nextUrl: string | null
}

const stateCache = new Map<string, WaterfallSnapshot>()

export function saveWaterfallSnapshot(key: string, snap: WaterfallSnapshot): void {
  stateCache.set(key, snap)
}

export function loadWaterfallSnapshot(key: string): WaterfallSnapshot | null {
  return stateCache.get(key) ?? null
}

export function clearWaterfallSnapshot(key: string): void {
  stateCache.delete(key)
}
