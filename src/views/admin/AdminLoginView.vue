<script setup lang="ts">
// 管理端登录：输入 ADMIN_TOKEN → 调 overview 验证 → 存 token 进 /admin
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { getOverview, setAdminToken } from '../../api/admin'

const router = useRouter()
const token = ref('')
const loading = ref(false)
const error = ref('')

async function login() {
  const t = token.value.trim()
  if (!t || loading.value) return
  loading.value = true
  error.value = ''
  try {
    setAdminToken(t)
    await getOverview() // 验证 token 有效性（401 时 admin.ts 已清 token）
    router.replace({ path: '/admin' })
  } catch (e) {
    error.value = e instanceof Error ? e.message : '登录失败'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="admin-login">
    <section class="card login-card">
      <h2 class="card-title">服务端管理</h2>
      <p class="card-desc">输入部署时配置的 ADMIN_TOKEN（服务端环境变量）</p>
      <input
        v-model="token"
        type="password"
        placeholder="ADMIN_TOKEN"
        autocomplete="off"
        @keyup.enter="login"
      />
      <p v-if="error" class="error-text">{{ error }}</p>
      <button class="login-btn" :disabled="!token.trim() || loading" @click="login">
        {{ loading ? '验证中…' : '登录' }}
      </button>
      <router-link class="back-link" to="/">返回客户端</router-link>
    </section>
  </div>
</template>

<style scoped>
.admin-login {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}
.login-card {
  width: 100%;
  max-width: 360px;
  padding: 24px;
  background: var(--bg-card);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.card-title {
  margin: 0;
  font-size: 16px;
}
.card-desc {
  margin: 0;
  font-size: 12px;
  color: var(--text-secondary);
}
.error-text {
  margin: 0;
  font-size: 12px;
  color: var(--accent-danger);
}
.login-btn {
  width: 100%;
}
.back-link {
  font-size: 12px;
  text-align: center;
}
</style>
