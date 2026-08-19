<script setup lang="ts">
// 收藏页：当前用户的收藏列表，public/private 切换
import { computed, ref } from 'vue'
import { fetchUserBookmarks } from '../../api/pixiv'
import { usePixivAuthStore } from '../../stores/pixivAuth'
import IllustWaterfall from '../../components/IllustWaterfall.vue'
import ErrorView from '../../components/CommonViews/ErrorView.vue'

const pixiv = usePixivAuthStore()

const restrict = ref<'public' | 'private'>('public')
const reloadToken = ref(0)

const userId = computed(() => pixiv.user?.id ?? '')

const fetchFirst = computed(() => () => fetchUserBookmarks(userId.value, restrict.value))

function switchRestrict(r: 'public' | 'private') {
  if (restrict.value === r) return
  restrict.value = r
  reloadToken.value++
}
</script>

<template>
  <div>
    <ErrorView v-if="!userId" message="未获取到当前用户信息" @retry="() => {}" />
    <template v-else>
      <div class="switch-bar">
        <button
          class="switch-btn"
          :class="{ active: restrict === 'public' }"
          @click="switchRestrict('public')"
        >
          公开
        </button>
        <button
          class="switch-btn"
          :class="{ active: restrict === 'private' }"
          @click="switchRestrict('private')"
        >
          私密
        </button>
      </div>
      <IllustWaterfall :fetch-first="fetchFirst" :reload-token="reloadToken" cache-key="bookmark" />
    </template>
  </div>
</template>

<style scoped>
.switch-bar {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}
.switch-btn {
  padding: 4px 14px;
  font-size: 13px;
  background: transparent;
  color: var(--text-secondary);
  border: 1px solid var(--border);
}
.switch-btn.active {
  color: #fff;
  background: var(--accent);
  border-color: var(--accent);
}
</style>
