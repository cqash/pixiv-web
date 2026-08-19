<script setup lang="ts">
// 设置页：浏览画质 / 内容过滤 / 屏蔽 / 主题 / 数据同步 / 账号 / 关于
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useSettingsStore, type AppSettings } from '../stores/settings'
import { usePixivAuthStore } from '../stores/pixivAuth'
import { useRelayAuthStore } from '../stores/relayAuth'
import { getLastSyncInfo, syncNow } from '../services/syncService'

const router = useRouter()
const settingsStore = useSettingsStore()
const pixiv = usePixivAuthStore()
const relay = useRelayAuthStore()

const settings = computed(() => settingsStore.settings)

// ---- toast ----
const toast = ref('')
let toastTimer: ReturnType<typeof setTimeout> | null = null
function showToast(text: string) {
  toast.value = text
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toast.value = ''
  }, 2000)
}

function setTheme(theme: AppSettings['theme']) {
  settingsStore.update({ theme })
}

// ---- 数据同步 ----
const syncing = ref(false)
const lastSyncText = ref('')

function refreshLastSyncText() {
  const { lastSyncAt, lastSyncResult } = getLastSyncInfo()
  if (lastSyncAt <= 0) {
    lastSyncText.value = '从未同步'
    return
  }
  const d = new Date(lastSyncAt)
  const pad = (n: number) => String(n).padStart(2, '0')
  lastSyncText.value = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())} ${lastSyncResult}`
}

onMounted(refreshLastSyncText)

async function runSyncNow() {
  if (syncing.value) return
  syncing.value = true
  try {
    const r = await syncNow()
    showToast(r.message)
  } finally {
    syncing.value = false
    refreshLastSyncText()
  }
}

function toggleSyncEnabled() {
  const enabled = !settings.value.syncEnabled
  settingsStore.update({ syncEnabled: enabled })
  if (enabled) void runSyncNow() // 开启后立即跑一轮全量合并
}

// ---- 屏蔽词 ----
const newMuteTag = ref('')
function addMuteTag() {
  const t = newMuteTag.value.trim()
  if (!t) return
  settingsStore.addMuteTag(t)
  newMuteTag.value = ''
}

// ---- 账号 ----
const serverDisplay = computed(() => relay.serverUrl || '同源')

async function copyAccountKey() {
  if (!relay.accountKey) {
    showToast('静态 token 模式无 accountKey')
    return
  }
  try {
    await navigator.clipboard.writeText(relay.accountKey)
    showToast('已复制')
  } catch {
    showToast('复制失败')
  }
}

function logoutAll() {
  if (!confirm('确定退出登录？')) return
  pixiv.logout()
  relay.logout()
  router.replace({ name: 'login' })
}
</script>

<template>
  <div class="settings-page">
    <button class="secondary back-btn" @click="router.back()">← 返回</button>

    <!-- 浏览 -->
    <section class="card">
      <h2 class="card-title">浏览</h2>
      <p class="card-desc">列表与详情页的图片画质</p>
      <div class="row">
        <span class="row-label">列表预览画质</span>
        <div class="segmented">
          <button
            v-for="opt in [
              { v: 0, label: '缩略' },
              { v: 1, label: '中等' },
              { v: 2, label: '大图' },
            ]"
            :key="opt.v"
            class="seg-btn"
            :class="{ active: settings.previewQuality === opt.v }"
            @click="settingsStore.update({ previewQuality: opt.v as 0 | 1 | 2 })"
          >
            {{ opt.label }}
          </button>
        </div>
      </div>
      <div class="row">
        <span class="row-label">详情画质</span>
        <div class="segmented">
          <button
            v-for="opt in [
              { v: 0, label: '大图' },
              { v: 1, label: '原图' },
            ]"
            :key="opt.v"
            class="seg-btn"
            :class="{ active: settings.detailQuality === opt.v }"
            @click="settingsStore.update({ detailQuality: opt.v as 0 | 1 })"
          >
            {{ opt.label }}
          </button>
        </div>
      </div>
    </section>

    <!-- 内容 -->
    <section class="card">
      <h2 class="card-title">内容</h2>
      <p class="card-desc">内容过滤与显示偏好</p>
      <label class="check-row">
        <input
          type="checkbox"
          :checked="settings.antiSocialDeath"
          @change="settingsStore.update({ antiSocialDeath: !settings.antiSocialDeath })"
        />
        <span>防社死模式（R18 图遮罩）</span>
      </label>
      <label class="check-row">
        <input
          type="checkbox"
          :checked="settings.showR18Rank"
          @change="settingsStore.update({ showR18Rank: !settings.showR18Rank })"
        />
        <span>显示 R18 排行</span>
      </label>
      <label class="check-row">
        <input
          type="checkbox"
          :checked="settings.aiFilter"
          @change="settingsStore.update({ aiFilter: !settings.aiFilter })"
        />
        <span>过滤 AI 生成作品</span>
      </label>
    </section>

    <!-- 屏蔽 -->
    <section class="card">
      <h2 class="card-title">屏蔽</h2>
      <p class="card-desc">命中屏蔽词或屏蔽作者的作品不会出现在列表中</p>
      <p class="group-label">屏蔽词</p>
      <div class="chips">
        <span v-for="tag in settings.muteTags" :key="tag" class="chip">
          {{ tag }}
          <button class="chip-x" @click="settingsStore.removeMuteTag(tag)">×</button>
        </span>
        <span v-if="settings.muteTags.length === 0" class="empty-hint">无</span>
      </div>
      <div class="add-row">
        <input
          v-model="newMuteTag"
          type="text"
          placeholder="输入屏蔽词，回车添加"
          @keyup.enter="addMuteTag"
        />
        <button class="secondary add-btn" :disabled="!newMuteTag.trim()" @click="addMuteTag">
          添加
        </button>
      </div>
      <p class="group-label">屏蔽作者</p>
      <div class="mute-users">
        <div v-for="uid in settings.muteUsers" :key="uid" class="mute-user">
          <span class="mute-user-id">ID: {{ uid }}</span>
          <button class="chip-x" @click="settingsStore.removeMuteUser(uid)">×</button>
        </div>
        <span v-if="settings.muteUsers.length === 0" class="empty-hint">
          无（可在作品详情页作者行点「屏蔽」添加）
        </span>
      </div>
    </section>

    <!-- 主题 -->
    <section class="card">
      <h2 class="card-title">主题</h2>
      <p class="card-desc">界面配色，跟随系统时按系统深浅色切换</p>
      <div class="segmented">
        <button
          v-for="opt in [
            { v: 'auto', label: '跟随系统' },
            { v: 'light', label: '浅色' },
            { v: 'dark', label: '深色' },
          ]"
          :key="opt.v"
          class="seg-btn"
          :class="{ active: settings.theme === opt.v }"
          @click="setTheme(opt.v as AppSettings['theme'])"
        >
          {{ opt.label }}
        </button>
      </div>
    </section>

    <!-- 数据同步 -->
    <section class="card">
      <h2 class="card-title">数据同步</h2>
      <p class="card-desc">与鸿蒙端 ArkPix 经中继服务器同步历史/设置/屏蔽</p>
      <label class="check-row">
        <input type="checkbox" :checked="settings.syncEnabled" @change="toggleSyncEnabled" />
        <span>开启同步</span>
      </label>
      <div class="row">
        <span class="row-label">上次同步</span>
        <span class="row-value">{{ lastSyncText }}</span>
      </div>
      <div class="btn-row">
        <button
          class="secondary"
          :disabled="!settings.syncEnabled || syncing"
          @click="runSyncNow"
        >
          {{ syncing ? '同步中…' : '立即同步' }}
        </button>
      </div>
    </section>

    <!-- 账号 -->
    <section class="card">
      <h2 class="card-title">账号</h2>
      <p class="card-desc">当前登录信息与中继服务器</p>
      <div class="row">
        <span class="row-label">Pixiv 账号</span>
        <span class="row-value">
          {{ pixiv.user ? `${pixiv.user.name}（ID: ${pixiv.user.id}）` : '未登录' }}
        </span>
      </div>
      <div class="row">
        <span class="row-label">中继服务器</span>
        <span class="row-value">{{ serverDisplay }}</span>
      </div>
      <div class="btn-row">
        <button class="secondary" @click="copyAccountKey">导出同步账号</button>
        <button class="secondary" @click="router.push({ name: 'history' })">历史记录</button>
        <button class="secondary danger" @click="logoutAll">退出登录</button>
      </div>
    </section>

    <!-- 关于 -->
    <section class="card">
      <h2 class="card-title">关于</h2>
      <p class="card-desc">ArkPix Web 0.1.0 — 自托管中继驱动的 Pixiv 第三方 Web 客户端</p>
    </section>

    <div v-if="toast" class="toast">{{ toast }}</div>
  </div>
</template>

<style scoped>
.settings-page {
  max-width: 720px;
  margin: 0 auto;
  padding: 16px;
}
.back-btn {
  margin-bottom: 12px;
}
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
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}
.row:last-child {
  margin-bottom: 0;
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
.segmented {
  display: flex;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
}
.seg-btn {
  padding: 6px 14px;
  font-size: 13px;
  background: transparent;
  color: var(--text-secondary);
  border-radius: 0;
  border-right: 1px solid var(--border);
}
.seg-btn:last-child {
  border-right: none;
}
.seg-btn.active {
  background: var(--accent);
  color: #fff;
}
.check-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 0;
  font-size: 13px;
  cursor: pointer;
}
.check-row input[type='checkbox'] {
  width: 16px;
  height: 16px;
  accent-color: var(--accent);
}
.group-label {
  margin: 10px 0 6px;
  font-size: 13px;
  font-weight: 600;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  font-size: 12px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 999px;
}
.chip-x {
  padding: 0 2px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 13px;
}
.chip-x:hover {
  color: var(--accent-danger);
}
.add-row {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}
.add-btn {
  flex-shrink: 0;
}
.mute-users {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.mute-user {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}
.mute-user-id {
  font-size: 13px;
}
.empty-hint {
  font-size: 12px;
  color: var(--text-secondary);
}
.btn-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.btn-row .danger {
  color: var(--accent-danger);
  border-color: var(--accent-danger);
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
@media (max-width: 767px) {
  .settings-page {
    padding: 8px;
  }
}
</style>
