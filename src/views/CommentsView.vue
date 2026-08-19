<script setup lang="ts">
// 评论页：首载 + IntersectionObserver 续页，内联回复楼（一页 + 更多），底部发评论框
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  commentAdd,
  fetchCommentReplies,
  fetchComments,
  fetchNext,
} from '../api/pixiv'
import type { CommentListPage, PixivComment } from '../api/types'
import { formatCreateDate } from '../utils/date'
import CachedImage from '../components/CachedImage.vue'
import LoadingView from '../components/CommonViews/LoadingView.vue'
import ErrorView from '../components/CommonViews/ErrorView.vue'
import EmptyView from '../components/CommonViews/EmptyView.vue'

const route = useRoute()
const router = useRouter()

const illustId = computed(() => String(route.params.id ?? ''))
const illustTitle = computed(() =>
  typeof route.query.title === 'string' ? route.query.title : '',
)

// ---- 主列表（三态 + 分页） ----
const comments = ref<PixivComment[]>([])
const nextUrl = ref<string | null>(null)
const loading = ref(false)
const loadingMore = ref(false)
const error = ref('')
const loaded = ref(false)

const sentinel = ref<HTMLElement | null>(null)
let observer: IntersectionObserver | null = null

async function loadFirst() {
  if (!illustId.value) return
  loading.value = true
  error.value = ''
  try {
    const page = await fetchComments(illustId.value)
    comments.value = page.comments ?? []
    nextUrl.value = page.next_url
    loaded.value = true
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败'
  } finally {
    loading.value = false
  }
}

async function loadMore() {
  if (!nextUrl.value || loadingMore.value || loading.value) return
  loadingMore.value = true
  try {
    const page = await fetchNext<CommentListPage>(nextUrl.value)
    comments.value = [...comments.value, ...(page.comments ?? [])]
    nextUrl.value = page.next_url
  } catch (e) {
    console.error('评论分页加载失败', e)
  } finally {
    loadingMore.value = false
  }
}

onMounted(() => {
  void loadFirst()
  observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((en) => en.isIntersecting)) void loadMore()
    },
    { rootMargin: '400px' },
  )
  if (sentinel.value) observer.observe(sentinel.value)
})

// sentinel 在首载完成后才渲染，需随 ref 变化挂/摘观察
watch(sentinel, (el, old) => {
  if (old) observer?.unobserve(old)
  if (el) observer?.observe(el)
})

onBeforeUnmount(() => {
  observer?.disconnect()
  observer = null
})

// ---- 回复楼（commentId → 展开状态，一次拉一页 + 更多） ----
interface ReplyState {
  open: boolean
  items: PixivComment[]
  nextUrl: string | null
  loading: boolean
}
const replies = ref<Record<number, ReplyState>>({})

function replyState(id: number): ReplyState | undefined {
  return replies.value[id]
}

async function toggleReplies(c: PixivComment) {
  const cur = replies.value[c.id]
  if (cur) {
    replies.value[c.id] = { ...cur, open: !cur.open }
    return
  }
  replies.value[c.id] = { open: true, items: [], nextUrl: null, loading: true }
  try {
    const page = await fetchCommentReplies(c.id)
    replies.value[c.id] = {
      open: true,
      items: page.comments ?? [],
      nextUrl: page.next_url,
      loading: false,
    }
  } catch (e) {
    console.error('回复楼加载失败', e)
    replies.value[c.id] = { open: false, items: [], nextUrl: null, loading: false }
  }
}

async function loadMoreReplies(c: PixivComment) {
  const st = replies.value[c.id]
  if (!st || !st.nextUrl || st.loading) return
  st.loading = true
  try {
    const page = await fetchNext<CommentListPage>(st.nextUrl)
    replies.value[c.id] = {
      ...st,
      items: [...st.items, ...(page.comments ?? [])],
      nextUrl: page.next_url,
      loading: false,
    }
  } catch (e) {
    console.error('回复楼分页失败', e)
    st.loading = false
  }
}

// ---- 发评论 ----
const draft = ref('')
const sending = ref(false)
const replyTo = ref<PixivComment | null>(null)

function setReplyTo(c: PixivComment) {
  replyTo.value = c
}

function cancelReply() {
  replyTo.value = null
}

async function send() {
  const text = draft.value.trim()
  if (!text || sending.value || !illustId.value) return
  sending.value = true
  try {
    await commentAdd(illustId.value, text, replyTo.value?.id)
    draft.value = ''
    replyTo.value = null
    loaded.value = false
    await loadFirst() // 重新首载刷新列表
  } catch (e) {
    console.error('评论发送失败', e)
    alert(e instanceof Error ? e.message : '发送失败')
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <div class="comments-page">
    <div class="header">
      <button class="secondary back-btn" @click="router.back()">← 返回</button>
      <h1 class="page-title">评论<template v-if="illustTitle"> - {{ illustTitle }}</template></h1>
    </div>

    <LoadingView v-if="loading && !loaded" />
    <ErrorView v-else-if="error && !loaded" :message="error" @retry="loadFirst" />
    <template v-else>
      <EmptyView v-if="loaded && comments.length === 0" text="暂无评论" />
      <div class="comment-list">
        <div v-for="c in comments" :key="c.id" class="comment">
          <div class="avatar">
            <CachedImage :src="c.user.profile_image_urls.px_50x50 ?? ''" :ratio="1" :alt="c.user.name" />
          </div>
          <div class="body">
            <div class="meta">
              <span class="name">{{ c.user.name }}</span>
              <span class="time">{{ formatCreateDate(c.date) }}</span>
            </div>
            <p v-if="c.parent_comment" class="reply-hint">
              回复 @{{ c.parent_comment.user.name }}
            </p>
            <!-- 贴图评论 -->
            <div v-if="!c.comment && c.stamp" class="stamp">
              <CachedImage :src="c.stamp.stamp_url" :ratio="1" :alt="`stamp ${c.stamp.stamp_id}`" />
            </div>
            <p v-else class="content">{{ c.comment }}</p>
            <div class="ops">
              <button class="op-btn" @click="setReplyTo(c)">回复</button>
              <button v-if="c.has_replies" class="op-btn" @click="toggleReplies(c)">
                {{ replyState(c.id)?.open ? '收起回复' : '查看回复' }}
              </button>
            </div>
            <!-- 内联回复楼 -->
            <div v-if="replyState(c.id)?.open" class="reply-thread">
              <LoadingView v-if="replyState(c.id)?.loading" text="回复加载中…" />
              <template v-else>
                <div v-for="r in replyState(c.id)?.items ?? []" :key="r.id" class="comment reply">
                  <div class="avatar">
                    <CachedImage
                      :src="r.user.profile_image_urls.px_50x50 ?? ''"
                      :ratio="1"
                      :alt="r.user.name"
                    />
                  </div>
                  <div class="body">
                    <div class="meta">
                      <span class="name">{{ r.user.name }}</span>
                      <span class="time">{{ formatCreateDate(r.date) }}</span>
                    </div>
                    <p v-if="r.parent_comment" class="reply-hint">
                      回复 @{{ r.parent_comment.user.name }}
                    </p>
                    <div v-if="!r.comment && r.stamp" class="stamp">
                      <CachedImage
                        :src="r.stamp.stamp_url"
                        :ratio="1"
                        :alt="`stamp ${r.stamp.stamp_id}`"
                      />
                    </div>
                    <p v-else class="content">{{ r.comment }}</p>
                  </div>
                </div>
                <EmptyView
                  v-if="(replyState(c.id)?.items.length ?? 0) === 0"
                  text="暂无回复"
                />
                <button
                  v-if="replyState(c.id)?.nextUrl"
                  class="secondary more-btn"
                  :disabled="replyState(c.id)?.loading"
                  @click="loadMoreReplies(c)"
                >
                  更多
                </button>
              </template>
            </div>
          </div>
        </div>
      </div>
      <div ref="sentinel" class="sentinel" />
      <p v-if="loadingMore" class="foot">加载中…</p>
      <p v-else-if="loaded && !nextUrl && comments.length > 0" class="foot">没有更多了</p>
    </template>

    <!-- 底部发评论框 -->
    <div class="composer">
      <p v-if="replyTo" class="reply-to">
        回复 @{{ replyTo.user.name }}
        <button class="cancel-btn" @click="cancelReply">×</button>
      </p>
      <div class="composer-row">
        <textarea
          v-model="draft"
          class="draft"
          rows="2"
          placeholder="写下你的评论…"
          @keydown.enter.exact.prevent="send"
        />
        <button class="send-btn" :disabled="sending || !draft.trim()" @click="send">
          {{ sending ? '发送中…' : '发送' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.comments-page {
  max-width: 720px;
  margin: 0 auto;
  padding: 16px;
}
.header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}
.back-btn {
  flex-shrink: 0;
}
.page-title {
  margin: 0;
  font-size: 16px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.comment-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 12px;
}
.comment {
  display: flex;
  gap: 10px;
  padding: 12px;
  background: var(--bg-card);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
}
.comment.reply {
  background: var(--bg);
  box-shadow: none;
}
.avatar {
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  border-radius: 50%;
  overflow: hidden;
}
.body {
  min-width: 0;
  flex: 1;
}
.meta {
  display: flex;
  gap: 8px;
  align-items: baseline;
}
.name {
  font-size: 13px;
  font-weight: 600;
}
.time {
  font-size: 11px;
  color: var(--text-secondary);
}
.reply-hint {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--accent);
}
.content {
  margin: 4px 0 0;
  font-size: 13px;
  white-space: pre-wrap;
  word-break: break-word;
}
.stamp {
  width: 96px;
  height: 96px;
  margin-top: 4px;
}
.ops {
  display: flex;
  gap: 8px;
  margin-top: 6px;
}
.op-btn {
  padding: 0;
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
}
.op-btn:hover {
  color: var(--accent);
}
.reply-thread {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.more-btn {
  align-self: flex-start;
  padding: 4px 12px;
  font-size: 12px;
}
.sentinel {
  height: 1px;
}
.foot {
  margin: 0;
  padding: 12px 0 16px;
  text-align: center;
  font-size: 12px;
  color: var(--text-secondary);
}
.composer {
  position: sticky;
  bottom: 8px;
  padding: 10px 12px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
}
.reply-to {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 6px;
  font-size: 12px;
  color: var(--accent);
}
.cancel-btn {
  padding: 0 4px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 13px;
}
.composer-row {
  display: flex;
  gap: 8px;
  align-items: flex-end;
}
.draft {
  flex: 1;
  resize: none;
}
.send-btn {
  flex-shrink: 0;
  white-space: nowrap;
}
@media (max-width: 767px) {
  .comments-page {
    padding: 8px;
  }
}
</style>
