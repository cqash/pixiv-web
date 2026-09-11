<script setup lang="ts">
// 运行时设置热改：恢复缓存 TTL / 接口限流 / 注册邀请码（缓存两项在「缓存」页编辑）
import { onMounted, ref } from 'vue'
import { getSettings, patchSettings, type AdminSettings } from '../../api/admin'

interface Field {
  key: string
  label: string
  hint: string
  /** number：正整数输入；text：自由文本（如 CSV 邀请码列表） */
  type: 'number' | 'text'
}

const fields: Field[] = [
  { key: 'recover_ttl_days', label: '恢复缓存 TTL（天）', hint: '已删除作品页面/元数据缓存保留天数', type: 'number' },
  {
    key: 'recover_negative_ttl_days',
    label: '恢复负缓存 TTL（天）',
    hint: '「作品不存在」结论的缓存天数',
    type: 'number',
  },
  { key: 'rate_write_per_min', label: '写接口限流（次/分）', hint: '每账号写类端点速率', type: 'number' },
  { key: 'rate_img_per_min', label: '图片接口限流（次/分）', hint: '每 IP 图片代理端点速率', type: 'number' },
  {
    key: 'invite_codes',
    label: '注册邀请码',
    hint: '逗号或换行分隔，保存时去重规范化；留空 = 开放注册（公网部署慎用）',
    type: 'text',
  },
]

const settings = ref<AdminSettings | null>(null)
const inputs = ref<Record<string, string>>({})
const error = ref('')
const saving = ref(false)

const toast = ref('')
let toastTimer: ReturnType<typeof setTimeout> | null = null
function showToast(text: string) {
  toast.value = text
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toast.value = ''
  }, 2500)
}

const sourceLabels: Record<string, string> = {
  db: '数据库覆盖',
  env: '环境变量',
  default: '默认值',
}

function fillInputs(s: AdminSettings) {
  for (const f of fields) {
    if (s[f.key]) inputs.value[f.key] = String(s[f.key].value)
  }
}

onMounted(async () => {
  try {
    const r = await getSettings()
    settings.value = r.settings
    fillInputs(r.settings)
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败'
  }
})

async function save() {
  if (saving.value) return
  const patch: Record<string, number | string> = {}
  for (const f of fields) {
    const raw = inputs.value[f.key] ?? ''
    if (f.type === 'number') {
      const v = Number(raw)
      if (!Number.isInteger(v) || v <= 0) {
        showToast(`「${f.label}」必须是正整数`)
        return
      }
      patch[f.key] = v
    } else {
      const csv = normalizeCodes(raw)
      if (csv === '' && !window.confirm('邀请码留空将开放注册（任何人无需邀请码即可注册），确定继续？')) {
        return
      }
      patch[f.key] = csv
    }
  }
  saving.value = true
  try {
    const r = await patchSettings(patch)
    settings.value = r.settings
    fillInputs(r.settings)
    showToast('已保存并立即生效')
  } catch (e) {
    showToast(e instanceof Error ? e.message : '保存失败')
  } finally {
    saving.value = false
  }
}

// normalizeCodes 逗号/空白/换行分隔 → 去空去重的 CSV（与后端 parseInviteCodes 一致）。
function normalizeCodes(raw: string): string {
  return [...new Set(raw.split(/[\s,]+/).filter(Boolean))].join(',')
}
</script>

<template>
  <div>
    <section class="card">
      <h2 class="card-title">运行时设置</h2>
      <p class="card-desc">
        PATCH 后立即热生效并落库（优先级：数据库覆盖 &gt; 环境变量 &gt; 默认值）。缓存上限与水位在「缓存」页编辑。
      </p>
      <p v-if="error" class="error-text">{{ error }}</p>
      <template v-else-if="settings">
        <div v-for="f in fields" :key="f.key" class="form-row">
          <label class="form-label" :for="f.key">
            {{ f.label }}
            <span class="key-text">{{ f.key }}</span>
            <span v-if="settings[f.key]" class="source-badge" :class="settings[f.key].source">
              {{ sourceLabels[settings[f.key].source] ?? settings[f.key].source }}
            </span>
          </label>
          <p class="form-hint">{{ f.hint }}</p>
          <textarea v-if="f.type === 'text'" :id="f.key" v-model="inputs[f.key]" rows="3" />
          <input v-else :id="f.key" v-model="inputs[f.key]" type="number" min="1" step="1" />
        </div>
        <div class="btn-row">
          <button :disabled="saving" @click="save">{{ saving ? '保存中…' : '保存' }}</button>
        </div>
      </template>
      <p v-else class="empty-hint">加载中…</p>
    </section>

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
  max-width: 560px;
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
.form-row {
  margin-bottom: 14px;
}
.form-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}
.key-text {
  font-size: 11px;
  color: var(--text-secondary);
}
.form-hint {
  margin: 2px 0 4px;
  font-size: 12px;
  color: var(--text-secondary);
}
.source-badge {
  display: inline-block;
  padding: 1px 8px;
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
.btn-row {
  display: flex;
  gap: 8px;
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
