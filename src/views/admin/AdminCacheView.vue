<script setup lang="ts">
// 缓存管理：用量进度条 / 条目数 / 布局与目录 / 立即淘汰 / 热改缓存上限与水位
import { computed, onMounted, ref } from 'vue'
import {
  evictCache,
  getCacheStats,
  patchSettings,
  type CacheStats,
} from '../../api/admin'
import { formatBytes } from './format'

const stats = ref<CacheStats | null>(null)
const error = ref('')

const toast = ref('')
let toastTimer: ReturnType<typeof setTimeout> | null = null
function showToast(text: string) {
  toast.value = text
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toast.value = ''
  }, 2500)
}

const usagePercent = computed(() => {
  if (!stats.value || stats.value.maxBytes <= 0) return 0
  return Math.min(100, (stats.value.bytes / stats.value.maxBytes) * 100)
})

const watermarkPercent = computed(() =>
  stats.value ? Math.min(100, stats.value.highWatermark * 100) : 0,
)

// ---- 热改设置 ----
const maxBytesInput = ref('')
const watermarkInput = ref('')
const saving = ref(false)
let formInitialized = false

async function load() {
  try {
    stats.value = await getCacheStats()
    error.value = ''
    if (!formInitialized) {
      // 表单初值跟随首次加载结果，之后不覆盖用户编辑中的值
      formInitialized = true
      maxBytesInput.value = String(stats.value.maxBytes)
      watermarkInput.value = String(stats.value.highWatermark)
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败'
  }
}

onMounted(load)

// ---- 立即淘汰 ----
const evicting = ref(false)
async function runEvict() {
  if (evicting.value) return
  evicting.value = true
  try {
    const r = await evictCache()
    showToast(`已淘汰 ${r.freedEntries} 条，释放 ${formatBytes(r.freedBytes)}`)
    await load()
  } catch (e) {
    showToast(e instanceof Error ? e.message : '淘汰失败')
  } finally {
    evicting.value = false
  }
}

async function saveLimits() {
  if (saving.value) return
  const maxBytes = Number(maxBytesInput.value)
  const watermark = Number(watermarkInput.value)
  if (!Number.isInteger(maxBytes) || maxBytes <= 0) {
    showToast('缓存上限必须是正整数（字节）')
    return
  }
  if (!(watermark > 0 && watermark < 1)) {
    showToast('淘汰水位必须是 (0, 1) 之间的小数')
    return
  }
  saving.value = true
  try {
    await patchSettings({ cache_max_bytes: maxBytes, cache_high_watermark: watermark })
    showToast('已保存并生效')
    await load()
  } catch (e) {
    showToast(e instanceof Error ? e.message : '保存失败')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div>
    <p v-if="error" class="error-text">{{ error }}</p>
    <template v-else-if="stats">
      <section class="card">
        <h2 class="card-title">磁盘缓存用量</h2>
        <div class="progress">
          <div class="progress-fill" :style="{ width: usagePercent + '%' }"></div>
          <div class="progress-mark" :style="{ left: watermarkPercent + '%' }"></div>
        </div>
        <div class="row">
          <span class="row-label">用量</span>
          <span class="row-value">
            {{ formatBytes(stats.bytes) }} / {{ formatBytes(stats.maxBytes) }}（{{ usagePercent.toFixed(1) }}%）
          </span>
        </div>
        <div class="row">
          <span class="row-label">条目数</span>
          <span class="row-value">{{ stats.entries }}</span>
        </div>
        <div class="row">
          <span class="row-label">淘汰水位</span>
          <span class="row-value">{{ (stats.highWatermark * 100).toFixed(0) }}%（进度条竖线位置）</span>
        </div>
        <div class="row">
          <span class="row-label">布局</span>
          <span class="row-value">{{ stats.layout }}</span>
        </div>
        <div class="row">
          <span class="row-label">目录</span>
          <span class="row-value">{{ stats.dir }}</span>
        </div>
        <div class="btn-row">
          <button class="secondary" :disabled="evicting" @click="runEvict">
            {{ evicting ? '淘汰中…' : '立即淘汰' }}
          </button>
          <button class="secondary" @click="load">刷新</button>
        </div>
      </section>

      <section class="card">
        <h2 class="card-title">缓存限制</h2>
        <p class="card-desc">热改后立即生效并落库（覆盖环境变量与默认值）</p>
        <div class="form-row">
          <label class="form-label" for="cache-max">缓存上限 cache_max_bytes（字节）</label>
          <input id="cache-max" v-model="maxBytesInput" type="number" min="1" step="1" />
        </div>
        <div class="form-row">
          <label class="form-label" for="cache-wm">淘汰水位 cache_high_watermark（0~1）</label>
          <input id="cache-wm" v-model="watermarkInput" type="number" min="0" max="1" step="0.01" />
        </div>
        <div class="btn-row">
          <button :disabled="saving" @click="saveLimits">{{ saving ? '保存中…' : '保存' }}</button>
        </div>
      </section>
    </template>
    <p v-else class="empty-hint">加载中…</p>

    <div v-if="toast" class="toast">{{ toast }}</div>
  </div>
</template>

<style scoped>
.card {
  padding: 16px;
  margin-bottom: 12px;
  background: var(--bg-card);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
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
.progress {
  position: relative;
  height: 10px;
  margin: 8px 0 12px;
  background: var(--bg);
  border-radius: 999px;
  overflow: hidden;
}
.progress-fill {
  height: 100%;
  background: var(--accent);
  border-radius: 999px;
  transition: width 0.3s;
}
.progress-mark {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  background: var(--accent-danger);
}
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}
.row-label {
  font-size: 13px;
  flex-shrink: 0;
}
.row-value {
  font-size: 13px;
  color: var(--text-secondary);
  word-break: break-all;
  text-align: right;
}
.btn-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.form-row {
  margin-bottom: 12px;
}
.form-label {
  display: block;
  margin-bottom: 4px;
  font-size: 13px;
}
.empty-hint {
  font-size: 12px;
  color: var(--text-secondary);
}
.error-text {
  font-size: 13px;
  color: var(--accent-danger);
}
.toast {
  position: fixed;
  left: 50%;
  bottom: 48px;
  transform: translateX(-50%);
  padding: 8px 20px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.75);
  color: #fff;
  font-size: 13px;
  z-index: 1100;
}
</style>
