<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { getDevices } from '../api'

const router = useRouter()
const devices = ref([])
const loading = ref(false)
const error = ref('')

async function load() {
  loading.value = true
  error.value = ''
  try {
    devices.value = (await getDevices()) || []
  } catch (e) {
    console.error(e)
    error.value = '获取设备列表失败，请检查后端是否已启动'
  } finally {
    loading.value = false
  }
}

function goDetail(deviceId) {
  router.push({ name: 'device-detail', params: { deviceId } })
}

onMounted(load)
</script>

<template>
  <div class="home-page">
    <header class="home-header">
      <div>
        <h1>设备列表</h1>
        <div class="sub">选择一个设备进入详情页</div>
      </div>
      <button class="btn" :disabled="loading" @click="load">
        {{ loading ? '刷新中...' : '刷新' }}
      </button>
    </header>

    <div v-if="error" class="error-banner">{{ error }}</div>

    <div v-if="loading" class="loading">加载中...</div>

    <div v-else class="list">
      <button
        v-for="d in devices"
        :key="d.id || d.deviceId"
        class="device-item"
        @click="goDetail(d.deviceId)"
      >
        <div class="device-name">{{ d.name || d.deviceId }}</div>
        <div class="device-meta">
          <span class="mono">{{ d.deviceId }}</span>
          <span class="sep">·</span>
          <span>{{ d.location || '未知位置' }}</span>
        </div>
      </button>

      <div v-if="devices.length === 0" class="empty">
        暂无设备
      </div>
    </div>
  </div>
</template>

<style scoped>
.home-page {
  min-height: 100vh;
  padding: 22px 20px 28px;
  color: #e5e7eb;
  background: radial-gradient(circle at top, #1e293b 0, #020617 60%);
}

.home-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 14px;
  max-width: 980px;
  margin: 0 auto 16px;
}

h1 {
  margin: 0;
  font-size: 22px;
  font-weight: 650;
}

.sub {
  margin-top: 6px;
  font-size: 13px;
  color: #9ca3af;
}

.list {
  max-width: 980px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.device-item {
  text-align: left;
  border: 1px solid rgba(148, 163, 184, 0.18);
  background: rgba(15, 23, 42, 0.8);
  border-radius: 14px;
  padding: 14px 16px;
  color: #e5e7eb;
  cursor: pointer;
  transition: transform 0.12s ease, background 0.12s ease, border-color 0.12s ease;
}

.device-item:hover {
  transform: translateY(-1px);
  background: rgba(15, 23, 42, 0.9);
  border-color: rgba(56, 189, 248, 0.5);
}

.device-name {
  font-size: 15px;
  font-weight: 600;
}

.device-meta {
  margin-top: 6px;
  font-size: 12px;
  color: #9ca3af;
  display: flex;
  gap: 6px;
  align-items: center;
  flex-wrap: wrap;
}

.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono',
    'Courier New', monospace;
  color: #cbd5e1;
}

.sep {
  opacity: 0.6;
}

.btn {
  border: none;
  border-radius: 999px;
  padding: 7px 14px;
  font-size: 13px;
  cursor: pointer;
  background: rgba(148, 163, 184, 0.2);
  color: #e5e7eb;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.loading {
  max-width: 980px;
  margin: 18px auto 0;
  color: #9ca3af;
  font-size: 14px;
}

.empty {
  margin-top: 10px;
  text-align: center;
  color: #6b7280;
  padding: 18px 0;
}

.error-banner {
  max-width: 980px;
  margin: 0 auto 14px;
  background: rgba(248, 113, 113, 0.95);
  color: #111827;
  padding: 8px 14px;
  border-radius: 999px;
  font-size: 13px;
}
</style>

