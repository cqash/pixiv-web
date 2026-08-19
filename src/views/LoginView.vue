<script setup lang="ts">
// 登录页：第 1 步中继服务器（注册/导入 accountKey/静态 token）→ 第 2 步 Pixiv token 粘贴
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ApiError, register } from '../api/relayAuthApi'
import { extractRefreshToken, PixivCredentialInvalidError } from '../api/pixivOAuth'
import { useRelayAuthStore } from '../stores/relayAuth'
import { usePixivAuthStore } from '../stores/pixivAuth'

const router = useRouter()
const route = useRoute()
const relay = useRelayAuthStore()
const pixiv = usePixivAuthStore()

// 步骤：已登录 relay（或 ?step=pixiv）直接进 Pixiv token 步骤
const step = ref<'server' | 'pixiv'>(
  relay.isLoggedIn || route.query.step === 'pixiv' ? 'pixiv' : 'server',
)

// ---- 第 1 步：中继服务器 ----
type ServerMode = 'register' | 'accountKey' | 'staticToken'
const serverUrl = ref(relay.serverUrl)
const mode = ref<ServerMode>('register')
const inviteCode = ref('')
const accountKey = ref('')
const staticToken = ref('')

// ---- 第 2 步：Pixiv token ----
const pixivTokenInput = ref('')

const submitting = ref(false)
const errorMsg = ref('')

const deviceName = computed(() => {
  const ua = navigator.userAgent
  const m = /(Chrome|Firefox|Safari|Edg)\/[\d.]+/.exec(ua)
  return `Web/${m ? m[1] : 'Browser'}`
})

function showError(e: unknown) {
  if (e instanceof ApiError) {
    errorMsg.value = `${e.message}${e.requestId ? `（${e.code}, ref: ${e.requestId}）` : `（${e.code}）`}`
  } else if (e instanceof PixivCredentialInvalidError) {
    errorMsg.value = `Pixiv 凭证失效：${e.message}`
  } else if (e instanceof Error) {
    errorMsg.value = e.message
  } else {
    errorMsg.value = '未知错误'
  }
}

async function submitServer() {
  errorMsg.value = ''
  submitting.value = true
  try {
    if (mode.value === 'staticToken') {
      if (!staticToken.value.trim()) {
        errorMsg.value = '请填写静态 token'
        return
      }
      relay.loginWithStaticToken(serverUrl.value, staticToken.value)
    } else {
      const resp = await register(
        serverUrl.value,
        deviceName.value,
        inviteCode.value.trim() || undefined,
        mode.value === 'accountKey' ? accountKey.value.trim() : undefined,
      )
      relay.applyTokenResponse(serverUrl.value, resp)
    }
    step.value = 'pixiv'
  } catch (e) {
    showError(e)
  } finally {
    submitting.value = false
  }
}

async function submitPixiv() {
  errorMsg.value = ''
  const token = extractRefreshToken(pixivTokenInput.value)
  if (!token) {
    errorMsg.value = '请粘贴 refresh_token（支持鸿蒙端「导出 Token」的 JSON 内容）'
    return
  }
  submitting.value = true
  try {
    await pixiv.loginWithRefreshToken(token)
    router.replace({ name: 'home' })
  } catch (e) {
    showError(e)
  } finally {
    submitting.value = false
  }
}

function backToServer() {
  relay.logout()
  step.value = 'server'
  errorMsg.value = ''
}
</script>

<template>
  <div class="login-page">
    <div class="card">
      <h1 class="title">ArkPix Web</h1>

      <!-- 第 1 步：中继服务器 -->
      <template v-if="step === 'server'">
        <p class="hint">连接自托管中继服务器。留空地址 = 当前站点同源（embed 部署时默认）。</p>
        <label class="field">
          <span>服务器地址</span>
          <input
            v-model="serverUrl"
            placeholder="留空 = 同源；或 https://your-nas:8080"
            autocomplete="off"
          />
        </label>

        <div class="mode-tabs">
          <button
            v-for="m in [
              { key: 'register', label: '注册新账号' },
              { key: 'accountKey', label: '加入已有账号' },
              { key: 'staticToken', label: '静态 Token' },
            ]"
            :key="m.key"
            class="tab secondary"
            :class="{ active: mode === m.key }"
            @click="mode = m.key as ServerMode"
          >
            {{ m.label }}
          </button>
        </div>

        <label v-if="mode === 'register'" class="field">
          <span>邀请码（服务器配置 INVITE_CODES 时必填）</span>
          <input v-model="inviteCode" autocomplete="off" />
        </label>
        <label v-if="mode === 'accountKey'" class="field">
          <span>同步账号 Key（rk_ 开头，来自其他设备导出）</span>
          <input v-model="accountKey" placeholder="rk_..." autocomplete="off" />
        </label>
        <label v-if="mode === 'accountKey'" class="field">
          <span>邀请码（如需）</span>
          <input v-model="inviteCode" autocomplete="off" />
        </label>
        <label v-if="mode === 'staticToken'" class="field">
          <span>预置 Token（STATIC_TOKENS 部署）</span>
          <input v-model="staticToken" autocomplete="off" />
        </label>

        <button class="submit" :disabled="submitting" @click="submitServer">
          {{ submitting ? '连接中…' : '连接服务器' }}
        </button>
      </template>

      <!-- 第 2 步：Pixiv token -->
      <template v-else>
        <p class="hint">
          粘贴 Pixiv refresh_token。可从鸿蒙端 ArkPix「设置 → 账户 → 导出
          Token」复制（支持直接粘贴导出的 JSON）。
        </p>
        <label class="field">
          <span>refresh_token</span>
          <textarea v-model="pixivTokenInput" rows="4" autocomplete="off" />
        </label>
        <button class="submit" :disabled="submitting" @click="submitPixiv">
          {{ submitting ? '登录中…' : '登录 Pixiv' }}
        </button>
        <button class="secondary back" @click="backToServer">返回重新配置服务器</button>
      </template>

      <p v-if="errorMsg" class="error">{{ errorMsg }}</p>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}
.card {
  width: 100%;
  max-width: 420px;
  background: var(--bg-card);
  border-radius: 12px;
  box-shadow: var(--shadow);
  padding: 28px 24px;
}
.title {
  margin: 0 0 16px;
  font-size: 22px;
  text-align: center;
}
.hint {
  color: var(--text-secondary);
  font-size: 13px;
  margin: 0 0 16px;
}
.field {
  display: block;
  margin-bottom: 14px;
}
.field span {
  display: block;
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 6px;
}
.mode-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 14px;
}
.tab {
  flex: 1;
  padding: 6px 4px;
  font-size: 13px;
}
.tab.active {
  border-color: var(--accent);
  color: var(--accent);
}
.submit {
  width: 100%;
  padding: 10px;
  margin-top: 4px;
}
.back {
  width: 100%;
  margin-top: 10px;
}
.error {
  color: var(--accent-danger);
  font-size: 13px;
  margin: 12px 0 0;
  word-break: break-all;
}
</style>
