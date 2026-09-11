<script setup lang="ts">
// 管理端概览：版本/运行时长/账号/设备/缓存/恢复缓存计数 + 生效设置表（含来源）
import { onMounted, ref } from 'vue'
import { getOverview, type AdminOverview } from '../../api/admin'
import { formatBytes, formatUptime } from './format'

const data = ref<AdminOverview | null>(null)
const error = ref('')

const settingLabels: Record<string, string> = {
  cache_max_bytes: '缓存上限（字节）',
  cache_high_watermark: '缓存淘汰水位',
  recover_ttl_days: '恢复缓存 TTL（天）',
  recover_negative_ttl_days: '恢复负缓存 TTL（天）',
  rate_write_per_min: '写接口限流（次/分）',
  rate_img_per_min: '图片接口限流（次/分）',
  invite_codes: '注册邀请码',
}

const sourceLabels: Record<string, string> = {
  db: '数据库覆盖',
  env: '环境变量',
  default: '默认值',
}

function settingDisplay(key: string, value: number | string): string {
  if (key === 'cache_max_bytes') return `${formatBytes(Number(value))}（${value}）`
  if (key === 'invite_codes' && value === '') return '（空 = 开放注册）'
  return String(value)
}

onMounted(async () => {
  try {
    data.value = await getOverview()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败'
  }
})
</script>

<template>
  <div>
    <p v-if="error" class="error-text">{{ error }}</p>
    <template v-else-if="data">
      <div class="stat-grid">
        <section class="card stat">
          <p class="stat-value">{{ data.serverVersion }}</p>
          <p class="stat-label">服务端版本</p>
        </section>
        <section class="card stat">
          <p class="stat-value">{{ formatUptime(data.uptimeSec) }}</p>
          <p class="stat-label">运行时长</p>
        </section>
        <section class="card stat">
          <p class="stat-value">{{ data.accounts }}</p>
          <p class="stat-label">账号数</p>
        </section>
        <section class="card stat">
          <p class="stat-value">{{ data.devices }}</p>
          <p class="stat-label">设备数</p>
        </section>
        <section class="card stat">
          <p class="stat-value">{{ formatBytes(data.cache.bytes) }}</p>
          <p class="stat-label">缓存用量（{{ data.cache.entries }} 条）</p>
        </section>
        <section class="card stat">
          <p class="stat-value">
            {{
              Object.values(data.recoverCache).reduce((a, b) => a + b, 0)
            }}
          </p>
          <p class="stat-label">恢复缓存条目</p>
        </section>
      </div>

      <section class="card">
        <h2 class="card-title">恢复缓存按状态</h2>
        <div v-if="Object.keys(data.recoverCache).length" class="kv-list">
          <div v-for="(n, status) in data.recoverCache" :key="status" class="row">
            <span class="row-label">{{ status }}</span>
            <span class="row-value">{{ n }}</span>
          </div>
        </div>
        <p v-else class="empty-hint">无</p>
      </section>

      <section class="card">
        <h2 class="card-title">生效设置</h2>
        <p class="card-desc">优先级：数据库覆盖 &gt; 环境变量 &gt; 默认值；可在「设置」页热改</p>
        <table class="table">
          <thead>
            <tr>
              <th>设置项</th>
              <th>生效值</th>
              <th>来源</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(info, key) in data.settings" :key="key">
              <td>
                <div>{{ settingLabels[key] ?? key }}</div>
                <div class="key-text">{{ key }}</div>
              </td>
              <td>{{ settingDisplay(key, info.value) }}</td>
              <td>
                <span class="source-badge" :class="info.source">
                  {{ sourceLabels[info.source] ?? info.source }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </section>
    </template>
    <p v-else class="empty-hint">加载中…</p>
  </div>
</template>

<style scoped>
.stat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 12px;
  margin-bottom: 12px;
}
.card {
  padding: 16px;
  margin-bottom: 12px;
  background: var(--bg-card);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
}
.stat {
  margin-bottom: 0;
}
.stat-value {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  word-break: break-all;
}
.stat-label {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--text-secondary);
}
.card-title {
  margin: 0;
  font-size: 15px;
}
.card-desc {
  margin: 4px 0 12px;
  font-size: 12px;
  color: var(--text-secondary);
}
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 4px 0;
}
.row-label {
  font-size: 13px;
}
.row-value {
  font-size: 13px;
  color: var(--text-secondary);
}
.table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.table th,
.table td {
  text-align: left;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border);
}
.table th {
  color: var(--text-secondary);
  font-weight: 600;
  font-size: 12px;
}
.key-text {
  font-size: 11px;
  color: var(--text-secondary);
}
.source-badge {
  display: inline-block;
  padding: 2px 8px;
  font-size: 11px;
  border-radius: 999px;
  border: 1px solid var(--border);
  color: var(--text-secondary);
}
.source-badge.db {
  color: var(--accent);
  border-color: var(--accent);
}
.source-badge.env {
  color: var(--accent-danger);
  border-color: var(--accent-danger);
}
.empty-hint {
  font-size: 12px;
  color: var(--text-secondary);
}
.error-text {
  font-size: 13px;
  color: var(--accent-danger);
}
</style>
