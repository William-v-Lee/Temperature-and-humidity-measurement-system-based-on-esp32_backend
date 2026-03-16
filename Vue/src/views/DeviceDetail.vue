<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Dashboard from '../components/Dashboard.vue'

const route = useRoute()
const router = useRouter()

const deviceId = computed(() => String(route.params.deviceId || ''))

function back() {
  router.push({ name: 'home' })
}
</script>

<template>
  <div class="detail-wrap">
    <div class="topbar">
      <button class="btn" @click="back">返回设备列表</button>
      <div class="topbar-title">
        设备详情：<span class="mono">{{ deviceId }}</span>
      </div>
    </div>

    <Dashboard :initial-device-id="deviceId" />
  </div>
</template>

<style scoped>
.detail-wrap {
  min-height: 100vh;
}

.topbar {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  background: rgba(2, 6, 23, 0.75);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid rgba(148, 163, 184, 0.16);
}

.topbar-title {
  color: #cbd5e1;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono',
    'Courier New', monospace;
  color: #e5e7eb;
}

.btn {
  border: none;
  border-radius: 999px;
  padding: 6px 14px;
  font-size: 13px;
  cursor: pointer;
  background: rgba(148, 163, 184, 0.2);
  color: #e5e7eb;
}
</style>

