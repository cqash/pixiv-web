import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router'
import { initSync } from './services/syncService'
import './style.css'

const app = createApp(App)
app.use(createPinia()).use(router).mount('#app')
// pinia 激活后注册同步订阅（store 变更 diff 墓碑 + 防抖自动 syncNow）
initSync()
