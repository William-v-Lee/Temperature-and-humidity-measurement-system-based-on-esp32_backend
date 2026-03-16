<script setup>
import { ref, onMounted, computed, watch } from 'vue'
import {
  getDevices,
  getDeviceRealtime,
  getDeviceHistory,
  setDeviceThresholds,
} from '../api'

const props = defineProps({
  initialDeviceId: {
    type: String,
    default: '',
  },
})

// 设备列表与当前选中设备
const devices = ref([])
const deviceId = ref('')

const loading = ref(false)
const error = ref('')

// 实时数据
const realtime = ref({
  deviceId: '',
  timestamp: null,
  temp: null,
  humi: null,
  tempTh: null,
  humiTh: null,
  tempAlarm: null,
  humiAlarm: null,
  online: false,
})

// 阈值表单
const thresholdForm = ref({
  tempTh: null,
  humiTh: null,
})
const thresholdSaving = ref(false)

// 历史数据（表格 + 简单折线图）
const historyData = ref([])
const historyLoading = ref(false)
// 当前选中的历史范围（单位：分钟），默认 60 分钟
const historyRangeMinutes = ref(60)
// 当前一次查询真正使用的时间区间（毫秒时间戳）
const historyRangeWindow = ref({ start: null, end: null })
// 历史查询结束时间向前偏移（避免把“还没来得及上报”的尾部空档画成 0）
const HISTORY_LAG_MS = 2 * 60 * 1000

function getBucketStepMs(rangeMinutes) {
  // 时间范围越大，采样步长越大，避免点数过多导致前端卡顿
  if (rangeMinutes <= 3 * 60) return 10 * 1000 // <= 3小时：10秒（更抗上报抖动）
  if (rangeMinutes <= 12 * 60) return 30 * 1000 // <= 12小时：30秒
  if (rangeMinutes <= 24 * 60) return 2 * 60 * 1000 // <= 1天：2分钟
  if (rangeMinutes <= 3 * 24 * 60) return 10 * 60 * 1000 // <= 3天：10分钟
  if (rangeMinutes <= 7 * 24 * 60) return 30 * 60 * 1000 // <= 1周：30分钟
  return 2 * 60 * 60 * 1000 // <= 1月（及以上）：2小时
}

function fillSeriesWithZeros(list, start, end, stepMs) {
  const s = Math.min(start, end)
  const e = Math.max(start, end)
  const step = Math.max(1000, stepMs || 1000)
  const result = []
  // 允许的“短缺口”阈值：在这个阈值内认为只是上报抖动，使用上一条值保持，不填 0
  const holdThresholdMs = step * 2

  // 把每条真实数据归入桶（取最后一条作为该桶值），没落入桶的就是 0
  const map = new Map()
  if (Array.isArray(list)) {
    for (const item of list) {
      const ts = item?.ts
      if (typeof ts !== 'number') continue
      if (ts < s || ts > e) continue
      const bucket = Math.floor((ts - s) / step)
      map.set(bucket, item)
    }
  }

  const bucketCount = Math.floor((e - s) / step)
  let lastSeen = null
  let lastSeenTs = null
  for (let b = 0; b <= bucketCount; b++) {
    const ts = s + b * step
    const it = map.get(b)
    if (it) {
      lastSeen = it
      lastSeenTs = it.ts
    }
    const shouldHold =
      lastSeen &&
      typeof lastSeenTs === 'number' &&
      ts - lastSeenTs >= 0 &&
      ts - lastSeenTs <= holdThresholdMs
    result.push({
      ts,
      temp:
        typeof it?.temp === 'number'
          ? it.temp
          : shouldHold && typeof lastSeen?.temp === 'number'
            ? lastSeen.temp
            : 0,
      humi:
        typeof it?.humi === 'number'
          ? it.humi
          : shouldHold && typeof lastSeen?.humi === 'number'
            ? lastSeen.humi
            : 0,
    })
  }

  // 确保最后一个点就是窗口 end（避免因步长不整除导致标签和曲线末尾对不上）
  if (result.length && result[result.length - 1].ts !== e) {
    // end 点尽量沿用上一条值（若超过阈值则为 0）
    const tail = result[result.length - 1]
    const shouldHoldTail =
      lastSeen &&
      typeof lastSeenTs === 'number' &&
      e - lastSeenTs >= 0 &&
      e - lastSeenTs <= holdThresholdMs
    result.push({
      ts: e,
      temp: shouldHoldTail ? tail.temp : 0,
      humi: shouldHoldTail ? tail.humi : 0,
    })
  }
  if (!result.length) {
    result.push({ ts: s, temp: 0, humi: 0 }, { ts: e, temp: 0, humi: 0 })
  }
  return result
}

// 图表用的数据：
// - 在选定窗口内按“时间桶”重采样：桶内有数据用数据，桶内无数据填 0（包括数据库查不到的时间段）
const chartSeries = computed(() => {
  const win = historyRangeWindow.value
  const end = win.end || Date.now() - HISTORY_LAG_MS
  const start = win.start || end - historyRangeMinutes.value * 60 * 1000
  const step = getBucketStepMs(historyRangeMinutes.value)
  return fillSeriesWithZeros(historyData.value, start, end, step)
})

// 简单 SVG 折线图配置
const chartWidth = 800
const chartHeight = 180
const chartPaddingLeft = 40
const chartPaddingRight = 10
const chartPaddingTop = 10
const chartPaddingBottom = 18

function buildLinePath(list, key, min, max) {
  if (!list || list.length === 0) return ''
  const span = max - min || 1
  const n = list.length

  return list
    .map((item, idx) => {
      const raw = typeof item[key] === 'number' ? item[key] : 0
      const v = Math.min(max, Math.max(min, raw))
      const xInner =
        n === 1
          ? (chartWidth - chartPaddingLeft - chartPaddingRight) / 2
          : (idx / (n - 1)) * (chartWidth - chartPaddingLeft - chartPaddingRight)
      const x = chartPaddingLeft + xInner
      const yInner = ((v - min) / span) * (chartHeight - chartPaddingTop - chartPaddingBottom)
      const y = chartHeight - chartPaddingBottom - yInner
      return `${idx === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
}

// 传感器物理范围（用于裁剪，避免极端值）
const TEMP_PHYS_MIN = -40
const TEMP_PHYS_MAX = 80
const HUMI_PHYS_MIN = 0
const HUMI_PHYS_MAX = 100

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v))
}

function computeAutoRange(values, physMin, physMax, padRatio = 0.12) {
  const nums = (values || []).filter((v) => typeof v === 'number' && Number.isFinite(v))
  if (!nums.length) return { min: physMin, max: physMax }
  let min = Math.min(...nums)
  let max = Math.max(...nums)
  if (min === max) {
    // 单点/平线：给一个最小可视范围
    const delta = Math.max(1, Math.abs(min) * 0.05)
    min -= delta
    max += delta
  }
  const span = max - min
  min -= span * padRatio
  max += span * padRatio
  min = clamp(min, physMin, physMax)
  max = clamp(max, physMin, physMax)
  if (max - min < 1e-6) {
    return { min: physMin, max: physMax }
  }
  return { min, max }
}

// 竖轴缩放：基于“真实历史点”（historyData）自动缩放，避免因为补 0 导致轴被拉到 0
const tempScale = computed(() => {
  const temps = (historyData.value || []).map((i) => i?.temp)
  return computeAutoRange(temps, TEMP_PHYS_MIN, TEMP_PHYS_MAX)
})
const humiScale = computed(() => {
  const humis = (historyData.value || []).map((i) => i?.humi)
  return computeAutoRange(humis, HUMI_PHYS_MIN, HUMI_PHYS_MAX)
})

const tempPath = computed(() =>
  buildLinePath(chartSeries.value, 'temp', tempScale.value.min, tempScale.value.max),
)
const humiPath = computed(() =>
  buildLinePath(chartSeries.value, 'humi', humiScale.value.min, humiScale.value.max),
)

const chartTimeLabels = computed(() => {
  if (historyRangeWindow.value.start && historyRangeWindow.value.end) {
    return {
      start: formatTime(historyRangeWindow.value.start),
      end: formatTime(historyRangeWindow.value.end),
    }
  }
  return { start: '', end: '' }
})

function buildTicks(min, max, steps, formatter) {
  const span = max - min || 1
  const result = []
  for (let i = 0; i <= steps; i++) {
    const ratio = i / steps
    const value = max - ratio * span
    const yInner = ratio * (chartHeight - chartPaddingTop - chartPaddingBottom)
    const y = chartPaddingTop + yInner
    result.push({ y, label: formatter(value) })
  }
  return result
}

const yTicksTemp = computed(() =>
  buildTicks(tempScale.value.min, tempScale.value.max, 4, (v) => v.toFixed(1)),
)
const yTicksHumi = computed(() =>
  buildTicks(humiScale.value.min, humiScale.value.max, 4, (v) => v.toFixed(0)),
)

function formatTime(ts) {
  if (!ts) return '-'
  return new Date(ts).toLocaleString()
}

async function loadRealtime() {
  if (!deviceId.value) return
  loading.value = true
  error.value = ''
  try {
    const data = await getDeviceRealtime(deviceId.value)
    realtime.value = data
  } catch (e) {
    error.value = '获取实时数据失败，请检查后端是否已启动'
    console.error(e)
  } finally {
    loading.value = false
  }
}

async function loadHistory(rangeMinutes = historyRangeMinutes.value) {
  if (!deviceId.value) return
  historyRangeMinutes.value = rangeMinutes
  historyLoading.value = true
  error.value = ''
  try {
    const end = Date.now() - HISTORY_LAG_MS
    const start = end - rangeMinutes * 60 * 1000
    historyRangeWindow.value = { start, end }
    const list = await getDeviceHistory(deviceId.value, start, end)
    historyData.value = list
  } catch (e) {
    error.value = '获取历史数据失败'
    console.error(e)
  } finally {
    historyLoading.value = false
  }
}

async function saveThresholds() {
  if (!deviceId.value) return
  thresholdSaving.value = true
  error.value = ''
  try {
    const payload = {}
    if (thresholdForm.value.tempTh != null) {
      payload.tempTh = Number(thresholdForm.value.tempTh)
    }
    if (thresholdForm.value.humiTh != null) {
      payload.humiTh = Number(thresholdForm.value.humiTh)
    }
    await setDeviceThresholds(deviceId.value, payload)
    await loadRealtime()
  } catch (e) {
    error.value = '设置阈值失败'
    console.error(e)
  } finally {
    thresholdSaving.value = false
  }
}

async function loadDevices() {
  try {
    const list = await getDevices()
    devices.value = list || []
    if (!deviceId.value) {
      if (props.initialDeviceId) {
        deviceId.value = props.initialDeviceId
      } else if (devices.value.length > 0) {
        deviceId.value = devices.value[0].deviceId
      }
    }
  } catch (e) {
    console.error(e)
  }
}

watch(
  () => props.initialDeviceId,
  async (val) => {
    if (val && val !== deviceId.value) {
      deviceId.value = val
      await loadRealtime()
      await loadHistory(historyRangeMinutes.value)
    }
  },
)

watch(
  deviceId,
  async (val, oldVal) => {
    if (!val || val === oldVal) return
    await loadRealtime()
    await loadHistory(historyRangeMinutes.value)
  },
)

onMounted(async () => {
  await loadDevices()
  await loadRealtime()
  await loadHistory()
})
</script>

<template>
  <div class="page">
    <header class="header">
      <div class="title-wrap">
        <h1>物联网温湿度监控面板</h1>
        <p class="subtitle">IOT Thermohygrometer Dashboard</p>
      </div>
      <div class="device-id">
        <label>设备：</label>
        <select v-model="deviceId" class="input select">
          <option v-if="devices.length === 0" disabled value="">
            暂无设备
          </option>
          <option
            v-for="d in devices"
            :key="d.id"
            :value="d.deviceId"
          >
            {{ d.name || d.deviceId }}（{{ d.location || '未知位置' }}）
          </option>
        </select>
        <button class="btn" @click="loadRealtime">刷新</button>
      </div>
    </header>

    <main class="main">
      <section class="card realtime-card">
        <div class="card-header">
          <h2>实时状态</h2>
          <span
            class="status-pill"
            :class="realtime.online ? 'online' : 'offline'"
          >
            {{ realtime.online ? '在线' : '离线' }}
          </span>
        </div>

        <div class="realtime-body" v-if="!loading">
          <div class="metric">
            <div class="metric-label">温度</div>
            <div class="metric-value">
              {{ realtime.temp ?? '--' }}
              <span class="metric-unit">℃</span>
            </div>
            <div class="metric-sub">
              阈值：{{ realtime.tempTh ?? '--' }}℃
            </div>
            <div
              class="metric-badge"
              v-if="realtime.tempAlarm === true"
            >
              温度报警
            </div>
          </div>
          <div class="metric">
            <div class="metric-label">湿度</div>
            <div class="metric-value">
              {{ realtime.humi ?? '--' }}
              <span class="metric-unit">%RH</span>
            </div>
            <div class="metric-sub">
              阈值：{{ realtime.humiTh ?? '--' }}%RH
            </div>
            <div
              class="metric-badge"
              v-if="realtime.humiAlarm === true"
            >
              湿度报警
            </div>
          </div>
          <div class="alarm-panel">
            <div class="alarm-item">
              <span
                class="alarm-light"
                :class="realtime.tempAlarm ? 'on' : 'off'"
                aria-label="温度报警灯"
                :title="realtime.tempAlarm ? '温度报警：点亮' : '温度报警：熄灭'"
              ></span>
              <span class="alarm-text">温度报警灯</span>
            </div>
            <div class="alarm-item">
              <span
                class="alarm-light"
                :class="realtime.humiAlarm ? 'on' : 'off'"
                aria-label="湿度报警灯"
                :title="realtime.humiAlarm ? '湿度报警：点亮' : '湿度报警：熄灭'"
              ></span>
              <span class="alarm-text">湿度报警灯</span>
            </div>
          </div>
          <div class="meta">
            <div>最近上报时间：{{ formatTime(realtime.timestamp) }}</div>
          </div>
        </div>
        <div v-else class="loading">加载中...</div>
      </section>

      <section class="card threshold-card">
        <div class="card-header">
          <h2>阈值设置</h2>
        </div>
        <div class="form-row">
          <label>温度阈值 (℃)：</label>
          <input
            v-model="thresholdForm.tempTh"
            type="number"
            step="0.1"
            placeholder="留空表示不修改"
            class="input"
          />
        </div>
        <div class="form-row">
          <label>湿度阈值 (%RH)：</label>
          <input
            v-model="thresholdForm.humiTh"
            type="number"
            step="0.1"
            placeholder="留空表示不修改"
            class="input"
          />
        </div>
        <div class="form-actions">
          <button class="btn secondary" @click="loadRealtime">
            读取当前状态
          </button>
          <button
            class="btn primary"
            :disabled="thresholdSaving"
            @click="saveThresholds"
          >
            {{ thresholdSaving ? '保存中...' : '保存并下发' }}
          </button>
        </div>
      </section>

      <section class="card history-card">
        <div class="card-header">
          <h2>历史数据</h2>
          <div class="history-actions">
            <button
              class="btn small"
              :class="{ active: historyRangeMinutes === 30 }"
              @click="loadHistory(30)"
            >
              近 30 分钟
            </button>
            <button
              class="btn small"
              :class="{ active: historyRangeMinutes === 60 }"
              @click="loadHistory(60)"
            >
              近 1 小时
            </button>
            <button
              class="btn small"
              :class="{ active: historyRangeMinutes === 3 * 60 }"
              @click="loadHistory(3 * 60)"
            >
              近 3 小时
            </button>
            <button
              class="btn small"
              :class="{ active: historyRangeMinutes === 12 * 60 }"
              @click="loadHistory(12 * 60)"
            >
              近 12 小时
            </button>
            <button
              class="btn small"
              :class="{ active: historyRangeMinutes === 24 * 60 }"
              @click="loadHistory(24 * 60)"
            >
              近 1 天
            </button>
            <button
              class="btn small"
              :class="{ active: historyRangeMinutes === 3 * 24 * 60 }"
              @click="loadHistory(3 * 24 * 60)"
            >
              近 3 天
            </button>
            <button
              class="btn small"
              :class="{ active: historyRangeMinutes === 7 * 24 * 60 }"
              @click="loadHistory(7 * 24 * 60)"
            >
              近 1 周
            </button>
            <button
              class="btn small"
              :class="{ active: historyRangeMinutes === 30 * 24 * 60 }"
              @click="loadHistory(30 * 24 * 60)"
            >
              近 1 月
            </button>
          </div>
        </div>

        <div v-if="historyLoading" class="loading">加载中...</div>

        <div v-else>
          <div class="chart-wrap">
            <div class="chart-title">温度（℃）</div>
            <svg
              class="chart-svg"
              :viewBox="`0 0 ${chartWidth} ${chartHeight}`"
              preserveAspectRatio="none"
            >
              <defs>
                <linearGradient id="temp-gradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="#fb923c" stop-opacity="0.9" />
                  <stop offset="100%" stop-color="#f97316" stop-opacity="0.2" />
                </linearGradient>
                <linearGradient id="humi-gradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.9" />
                  <stop offset="100%" stop-color="#0ea5e9" stop-opacity="0.2" />
                </linearGradient>
              </defs>

              <!-- 背景网格 + Y 轴刻度和标签 -->
              <g>
                <g stroke="rgba(148,163,184,0.25)" stroke-width="1">
                  <line
                    v-for="tick in yTicksTemp"
                    :key="`grid-temp-${tick.y}`"
                    :x1="chartPaddingLeft"
                    :x2="chartWidth - chartPaddingRight"
                    :y1="tick.y"
                    :y2="tick.y"
                  />
                </g>
                <g
                  v-for="tick in yTicksTemp"
                  :key="`label-temp-${tick.y}`"
                  fill="#9ca3af"
                  font-size="10"
                >
                  <text
                    :x="chartPaddingLeft - 4"
                    :y="tick.y + 3"
                    text-anchor="end"
                  >
                    {{ tick.label }}
                  </text>
                </g>
              </g>

              <!-- 温度折线 -->
              <path
                v-if="tempPath"
                :d="tempPath"
                fill="none"
                stroke="url(#temp-gradient)"
                stroke-width="2.2"
              />
            </svg>

            <div class="chart-legend">
              <div class="legend-left">
                <span class="legend-dot temp"></span>
                温度曲线
              </div>
              <div class="legend-right">
                <span>{{ chartTimeLabels.start }}</span>
                <span class="legend-sep">~</span>
                <span>{{ chartTimeLabels.end }}</span>
              </div>
            </div>
          </div>

          <div class="chart-wrap">
            <div class="chart-title">湿度（%RH）</div>
            <svg
              class="chart-svg"
              :viewBox="`0 0 ${chartWidth} ${chartHeight}`"
              preserveAspectRatio="none"
            >
              <!-- 背景网格 + Y 轴刻度和标签 -->
              <g>
                <g stroke="rgba(148,163,184,0.25)" stroke-width="1">
                  <line
                    v-for="tick in yTicksHumi"
                    :key="`grid-humi-${tick.y}`"
                    :x1="chartPaddingLeft"
                    :x2="chartWidth - chartPaddingRight"
                    :y1="tick.y"
                    :y2="tick.y"
                  />
                </g>
                <g
                  v-for="tick in yTicksHumi"
                  :key="`label-humi-${tick.y}`"
                  fill="#9ca3af"
                  font-size="10"
                >
                  <text
                    :x="chartPaddingLeft - 4"
                    :y="tick.y + 3"
                    text-anchor="end"
                  >
                    {{ tick.label }}
                  </text>
                </g>
              </g>

              <!-- 湿度折线 -->
              <path
                v-if="humiPath"
                :d="humiPath"
                fill="none"
                stroke="url(#humi-gradient)"
                stroke-width="2.2"
              />
            </svg>

            <div class="chart-legend">
              <div class="legend-left">
                <span class="legend-dot humi"></span>
                湿度曲线
              </div>
              <div class="legend-right">
                <span>{{ chartTimeLabels.start }}</span>
                <span class="legend-sep">~</span>
                <span>{{ chartTimeLabels.end }}</span>
              </div>
            </div>
          </div>

          <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>时间</th>
                <th>温度 (℃)</th>
                <th>湿度 (%RH)</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in historyData" :key="item.id || item.ts">
                <td>{{ formatTime(item.ts) }}</td>
                <td>{{ item.temp }}</td>
                <td>{{ item.humi }}</td>
              </tr>
              <tr v-if="historyData.length === 0">
                <td colspan="3" class="empty">暂无数据</td>
              </tr>
            </tbody>
          </table>
          </div>
        </div>
      </section>
    </main>

    <footer class="footer">
      <span>后端接口：/api/devices/{deviceId}/realtime | /history | /thresholds</span>
    </footer>

    <div v-if="error" class="error-banner">
      {{ error }}
    </div>
  </div>
</template>

<style scoped>
.page {
  min-height: 100vh;
  color: #e5e7eb;
  background: radial-gradient(circle at top, #1e293b 0, #020617 60%);
  display: flex;
  flex-direction: column;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 24px 32px 8px;
}

.title-wrap h1 {
  margin: 0;
  font-size: 24px;
  font-weight: 600;
}

.subtitle {
  margin: 4px 0 0;
  font-size: 13px;
  color: #9ca3af;
}

.device-id {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
}

.main {
  padding: 8px 32px 24px;
  display: grid;
  grid-template-columns: 2fr 1fr;
  grid-auto-rows: minmax(0, auto);
  gap: 16px;
}

.card {
  background: rgba(15, 23, 42, 0.85);
  border-radius: 16px;
  padding: 16px 18px 18px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  box-shadow: 0 18px 45px rgba(15, 23, 42, 0.65);
  backdrop-filter: blur(16px);
}

.realtime-card {
  grid-column: 1 / 2;
}

.threshold-card {
  grid-column: 2 / 3;
}

.history-card {
  grid-column: 1 / 3;
}

.chart-wrap {
  margin-top: 4px;
  padding: 10px 10px 4px;
  border-radius: 12px;
  background: radial-gradient(circle at top left, #020617 0, #020617 20%, #020617 60%);
  background-color: rgba(15, 23, 42, 0.9);
  border: 1px solid rgba(30, 64, 175, 0.6);
}

.chart-svg {
  width: 100%;
  height: 180px;
  display: block;
}

.chart-title {
  font-size: 12px;
  color: #cbd5e1;
  margin-bottom: 6px;
}

.chart-legend {
  margin-top: 4px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 11px;
  color: #9ca3af;
}

.legend-left {
  display: flex;
  align-items: center;
  gap: 4px;
}

.legend-right {
  display: flex;
  align-items: center;
  gap: 4px;
}

.legend-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  display: inline-block;
}

.legend-dot.temp {
  background: #fb923c;
}

.legend-dot.humi {
  background: #38bdf8;
}

.legend-sep {
  opacity: 0.65;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.card-header h2 {
  font-size: 18px;
  margin: 0;
}

.status-pill {
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 500;
}

.status-pill.online {
  background: rgba(34, 197, 94, 0.16);
  color: #4ade80;
}

.status-pill.offline {
  background: rgba(248, 113, 113, 0.16);
  color: #fecaca;
}

.realtime-body {
  display: flex;
  gap: 24px;
}

.metric {
  flex: 0 0 160px;
  padding-right: 16px;
  border-right: 1px solid rgba(148, 163, 184, 0.4);
}

.metric-label {
  font-size: 13px;
  color: #9ca3af;
}

.metric-value {
  margin-top: 6px;
  font-size: 32px;
  font-weight: 600;
}

.metric-unit {
  font-size: 14px;
  margin-left: 4px;
  color: #9ca3af;
}

.metric-sub {
  margin-top: 6px;
  font-size: 12px;
  color: #9ca3af;
}

.metric-badge {
  display: inline-block;
  margin-top: 8px;
  padding: 2px 8px;
  font-size: 11px;
  border-radius: 999px;
  background: rgba(248, 113, 113, 0.16);
  color: #fecaca;
  border: 1px solid rgba(248, 113, 113, 0.4);
}

.meta {
  flex: 1;
  font-size: 13px;
  color: #9ca3af;
  display: flex;
  align-items: flex-end;
}

.alarm-panel {
  flex: 0 0 180px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-left: 8px;
}

.alarm-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.alarm-text {
  font-size: 12px;
  color: #cbd5e1;
  white-space: nowrap;
}

.alarm-light {
  width: 14px;
  height: 14px;
  border-radius: 999px;
  display: inline-block;
  border: 1px solid rgba(148, 163, 184, 0.6);
  background: rgba(148, 163, 184, 0.22);
  box-shadow: inset 0 0 0 2px rgba(2, 6, 23, 0.55);
}

.alarm-light.off {
  background: rgba(148, 163, 184, 0.18);
}

.alarm-light.on {
  background: radial-gradient(circle at 30% 30%, #fecaca 0, #ef4444 55%, #b91c1c 100%);
  border-color: rgba(248, 113, 113, 0.8);
  box-shadow:
    0 0 0 2px rgba(239, 68, 68, 0.15),
    0 0 18px rgba(239, 68, 68, 0.45),
    inset 0 0 0 2px rgba(2, 6, 23, 0.35);
  animation: alarmBlink 1.1s ease-in-out infinite;
}

@keyframes alarmBlink {
  0% { filter: brightness(0.95); opacity: 0.85; }
  50% { filter: brightness(1.25); opacity: 1; }
  100% { filter: brightness(0.95); opacity: 0.85; }
}

.form-row {
  margin-top: 10px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
}

.form-row label {
  width: 120px;
  color: #d1d5db;
}

.form-actions {
  margin-top: 14px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.history-actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.table-wrap {
  margin-top: 6px;
  max-height: 280px;
  overflow: auto;
}

.table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.table th,
.table td {
  padding: 6px 8px;
  border-bottom: 1px solid rgba(31, 41, 55, 0.9);
}

.table th {
  text-align: left;
  color: #9ca3af;
  position: sticky;
  top: 0;
  background: rgba(15, 23, 42, 0.98);
}

.empty {
  text-align: center;
  color: #6b7280;
}

.footer {
  padding: 6px 32px 14px;
  font-size: 12px;
  color: #6b7280;
}

.error-banner {
  position: fixed;
  left: 50%;
  bottom: 20px;
  transform: translateX(-50%);
  background: rgba(248, 113, 113, 0.95);
  color: #111827;
  padding: 8px 16px;
  border-radius: 999px;
  font-size: 13px;
  box-shadow: 0 8px 20px rgba(148, 27, 27, 0.55);
}

.input {
  min-width: 140px;
  padding: 6px 10px;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.7);
  background: rgba(15, 23, 42, 0.9);
  color: #e5e7eb;
  font-size: 13px;
  outline: none;
}

.select {
  min-width: 220px;
  border-radius: 999px;
}

.input:focus {
  border-color: #38bdf8;
  box-shadow: 0 0 0 1px rgba(56, 189, 248, 0.6);
}

.btn {
  border: none;
  border-radius: 999px;
  padding: 6px 14px;
  font-size: 13px;
  cursor: pointer;
  background: rgba(148, 163, 184, 0.2);
  color: #e5e7eb;
  transition: background 0.15s ease, transform 0.1s ease;
}

.btn.small {
  padding: 4px 10px;
  font-size: 12px;
}

.btn.primary {
  background: linear-gradient(135deg, #22c55e, #16a34a);
  color: #f9fafb;
}

.btn.secondary {
  background: rgba(59, 130, 246, 0.2);
  color: #bfdbfe;
}

.btn:hover:not(:disabled) {
  transform: translateY(-1px);
  background: rgba(148, 163, 184, 0.32);
}

.btn.primary:hover:not(:disabled) {
  background: linear-gradient(135deg, #16a34a, #15803d);
}

.btn.small.active {
  background: rgba(59, 130, 246, 0.5);
  color: #e5efff;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.loading {
  font-size: 14px;
  color: #9ca3af;
}

@media (max-width: 960px) {
  .header {
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
  }

  .main {
    grid-template-columns: 1fr;
  }

  .realtime-card,
  .threshold-card,
  .history-card {
    grid-column: 1 / 2;
  }

  .realtime-body {
    flex-direction: column;
  }
}
</style>

