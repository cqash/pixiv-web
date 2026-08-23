<script setup lang="ts">
// 账号管理：游标分页账号表格 + 行内展开设备列表 + 吊销设备 / 删除账号
import { onMounted, ref } from 'vue'
import {
  deleteAccount,
  deleteDevice,
  listAccounts,
  listDevices,
  type AccountItem,
  type DeviceItem,
} from '../../api/admin'
import { formatMs } from './format'

const items = ref<AccountItem[]>([])
const nextCursor = ref('')
const loading = ref(false)
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

async function loadMore() {
  if (loading.value) return
  loading.value = true
  try {
    const r = await listAccounts(nextCursor.value)
    items.value.push(...r.items)
    nextCursor.value = r.nextCursor
    error.value = ''
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败'
  } finally {
    loading.value = false
  }
}

async function reload() {
  items.value = []
  nextCursor.value = ''
  expanded.value = {}
  await loadMore()
}

onMounted(loadMore)

// ---- 行内展开设备 ----
interface DevicesState {
  loading: boolean
  items?: DeviceItem[]
  error?: string
}
const expanded = ref<Record<number, DevicesState>>({})

async function toggleDevices(accountId: number) {
  if (expanded.value[accountId]) {
    delete expanded.value[accountId]
    return
  }
  expanded.value[accountId] = { loading: true }
  try {
    const r = await listDevices(accountId)
    expanded.value[accountId] = { loading: false, items: r.items }
  } catch (e) {
    expanded.value[accountId] = {
      loading: false,
      error: e instanceof Error ? e.message : '加载失败',
    }
  }
}

// ---- 吊销设备 ----
async function revokeDevice(account: AccountItem, device: DeviceItem) {
  if (!confirm(`确定吊销设备「${device.deviceName}」（ID: ${device.id}）？其 token 将立即失效。`))
    return
  try {
    await deleteDevice(device.id)
    showToast('设备已吊销')
    account.deviceCount = Math.max(0, account.deviceCount - 1)
    const st = expanded.value[account.id]
    if (st?.items) st.items = st.items.filter((d) => d.id !== device.id)
  } catch (e) {
    showToast(e instanceof Error ? e.message : '吊销失败')
  }
}

// ---- 删除账号 ----
async function removeAccount(account: AccountItem) {
  if (
    !confirm(
      `确定删除账号 #${account.id}？\n将级联删除其全部设备、同步数据与恢复缓存，此操作不可恢复！`,
    )
  )
    return
  if (!confirm(`再次确认：删除账号 #${account.id} 不可恢复，确定继续？`)) return
  try {
    await deleteAccount(account.id)
    showToast(`账号 #${account.id} 已删除`)
    items.value = items.value.filter((a) => a.id !== account.id)
  } catch (e) {
    showToast(e instanceof Error ? e.message : '删除失败')
  }
}
</script>

<template>
  <div>
    <section class="card">
      <div class="header-row">
        <h2 class="card-title">账号（{{ items.length }}{{ nextCursor ? '+' : '' }}）</h2>
        <button class="secondary" @click="reload">刷新</button>
      </div>
      <p v-if="error" class="error-text">{{ error }}</p>
      <table v-if="items.length" class="table">
        <thead>
          <tr>
            <th>ID</th>
            <th>注册时间</th>
            <th>设备数</th>
            <th>同步条目</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody v-for="a in items" :key="a.id">
          <tr>
            <td>{{ a.id }}</td>
            <td>{{ formatMs(a.createdAt) }}</td>
            <td>{{ a.deviceCount }}</td>
            <td>{{ a.syncEntryCount }}</td>
            <td class="ops">
              <button class="secondary op-btn" @click="toggleDevices(a.id)">
                {{ expanded[a.id] ? '收起设备' : '设备' }}
              </button>
              <button class="secondary op-btn danger" @click="removeAccount(a)">删除</button>
            </td>
          </tr>
          <tr v-if="expanded[a.id]" class="devices-row">
            <td colspan="5">
              <p v-if="expanded[a.id].loading" class="empty-hint">设备加载中…</p>
              <p v-else-if="expanded[a.id].error" class="error-text">{{ expanded[a.id].error }}</p>
              <table v-else-if="expanded[a.id].items?.length" class="table inner">
                <thead>
                  <tr>
                    <th>设备 ID</th>
                    <th>设备名</th>
                    <th>注册时间</th>
                    <th>Access 过期</th>
                    <th>Refresh 过期</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="d in expanded[a.id].items" :key="d.id">
                    <td>{{ d.id }}</td>
                    <td>{{ d.deviceName || '（未命名）' }}</td>
                    <td>{{ formatMs(d.createdAt) }}</td>
                    <td>{{ formatMs(d.accessExpiresAt) }}</td>
                    <td>{{ formatMs(d.refreshExpiresAt) }}</td>
                    <td>
                      <button class="secondary op-btn danger" @click="revokeDevice(a, d)">
                        吊销
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
              <p v-else class="empty-hint">该账号无设备</p>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else-if="!loading" class="empty-hint">暂无账号</p>
      <div class="btn-row">
        <button v-if="nextCursor" class="secondary" :disabled="loading" @click="loadMore">
          {{ loading ? '加载中…' : '加载更多' }}
        </button>
      </div>
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
}
.header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.card-title {
  margin: 0;
  font-size: 15px;
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
.table.inner {
  background: var(--bg);
  border-radius: var(--radius);
}
.devices-row > td {
  padding: 8px 16px;
}
.ops {
  white-space: nowrap;
}
.op-btn {
  padding: 4px 10px;
  font-size: 12px;
  margin-right: 6px;
}
.op-btn.danger {
  color: var(--accent-danger);
  border-color: var(--accent-danger);
}
.btn-row {
  display: flex;
  gap: 8px;
  margin-top: 12px;
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
