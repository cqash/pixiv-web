// 管理端页面共用格式化：字节数 / 毫秒时间戳 / 运行时长

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '-'
  if (n < 1024) return `${n} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let v = n
  let u = -1
  do {
    v /= 1024
    u++
  } while (v >= 1024 && u < units.length - 1)
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${units[u]}`
}

/** 毫秒时间戳 → 本地 yyyy-MM-dd HH:mm:ss */
export function formatMs(ms: number): string {
  if (!ms) return '-'
  const d = new Date(ms)
  if (Number.isNaN(d.getTime())) return '-'
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

/** 秒 → 「N 天 N 小时 N 分」人类可读运行时长 */
export function formatUptime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '-'
  const d = Math.floor(sec / 86400)
  const h = Math.floor((sec % 86400) / 3600)
  const m = Math.floor((sec % 3600) / 60)
  if (d > 0) return `${d} 天 ${h} 小时`
  if (h > 0) return `${h} 小时 ${m} 分`
  return `${m} 分 ${Math.floor(sec % 60)} 秒`
}
