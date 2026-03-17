import { getDeviceRealtime, getDeviceHistory, setDeviceThresholds } from '../../utils/request'
import { formatTime } from '../../utils/util'

const HISTORY_LAG_MS = 2 * 60 * 1000

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v))
}

function computeAutoRange(values, physMin, physMax, padRatio = 0.12) {
  const nums = (values || []).filter((v) => typeof v === 'number' && Number.isFinite(v))
  if (!nums.length) return { min: physMin, max: physMax }
  let min = Math.min(...nums)
  let max = Math.max(...nums)
  if (min === max) {
    const delta = Math.max(1, Math.abs(min) * 0.05)
    min -= delta
    max += delta
  }
  const span = max - min
  min -= span * padRatio
  max += span * padRatio
  min = clamp(min, physMin, physMax)
  max = clamp(max, physMin, physMax)
  if (max - min < 1e-6) return { min: physMin, max: physMax }
  return { min, max }
}

function getBucketStepMs(rangeMinutes) {
  if (rangeMinutes <= 3 * 60) return 10 * 1000
  if (rangeMinutes <= 12 * 60) return 30 * 1000
  if (rangeMinutes <= 24 * 60) return 2 * 60 * 1000
  if (rangeMinutes <= 3 * 24 * 60) return 10 * 60 * 1000
  if (rangeMinutes <= 7 * 24 * 60) return 30 * 60 * 1000
  return 2 * 60 * 60 * 1000
}

function fillSeriesWithZeros(list, start, end, stepMs) {
  const s = Math.min(start, end)
  const e = Math.max(start, end)
  const step = Math.max(1000, stepMs || 1000)
  const result = []
  const holdThresholdMs = step * 2

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

  if (result.length && result[result.length - 1].ts !== e) {
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

Page({
  data: {
    deviceId: '',
    loading: false,
    realtime: null,
    error: '',
    history: [],
    historyDisplay: [],
    historyFolded: true,
    historyFoldCount: 5,
    chartTemp: [],
    chartHumi: [],
    tempAxisMin: -40,
    tempAxisMax: 80,
    humiAxisMin: 0,
    humiAxisMax: 100,
    rangeMinutes: 60,
    rangeOptions: [
      { minutes: 5, label: '近5分钟' },
      { minutes: 15, label: '近15分钟' },
      { minutes: 30, label: '近30分钟' },
      { minutes: 60, label: '近1小时' },
      { minutes: 180, label: '近3小时' },
      { minutes: 360, label: '近6小时' },
      { minutes: 720, label: '近12小时' },
      { minutes: 1440, label: '近24小时' },
      { minutes: 10080, label: '近一周' },
      { minutes: 43200, label: '近一月' },
    ],
    tempThInput: '',
    humiThInput: '',
    lastReportTimeText: '-',
  },

  onLoad(options) {
    const deviceId = decodeURIComponent(options.deviceId || '')
    this.setData({ deviceId })
    this.refreshAll()
  },

  onShow() {
    this.startRealtimePolling()
  },

  onHide() {
    this.stopRealtimePolling()
  },

  onUnload() {
    this.stopRealtimePolling()
  },

  navigateBack() {
    wx.navigateBack()
  },

  startRealtimePolling() {
    this.stopRealtimePolling()
    // 5 秒刷新一次实时状态
    this._pollTimer = setInterval(() => {
      this.loadRealtime()
    }, 5000)
  },

  stopRealtimePolling() {
    if (this._pollTimer) {
      clearInterval(this._pollTimer)
      this._pollTimer = null
    }
  },

  async refreshAll() {
    await Promise.all([this.loadRealtime(), this.loadHistory()])
  },

  async loadRealtime() {
    const { deviceId } = this.data
    if (!deviceId) return
    this.setData({ loading: true, error: '' })
    try {
      const data = await getDeviceRealtime(deviceId)
      const ts = data?.timestamp
      this.setData({
        realtime: data,
        tempThInput: data?.tempTh ?? '',
        humiThInput: data?.humiTh ?? '',
        lastReportTimeText: typeof ts === 'number' ? formatTime(new Date(ts)) : '-',
      })
    } catch (e) {
      console.error(e)
      this.setData({ error: '获取实时数据失败' })
    } finally {
      this.setData({ loading: false })
    }
  },

  async loadHistory() {
    const { deviceId, rangeMinutes } = this.data
    if (!deviceId) return
    // 与 Vue 端一致：窗口尾部向前错开，避免尾部空档画成 0
    const end = Date.now() - HISTORY_LAG_MS
    const start = end - rangeMinutes * 60 * 1000
    try {
      const list = await getDeviceHistory(deviceId, start, end)
      const history = list || []

      // 与 Vue 端一致：按时间桶重采样 + 缺口处理（短缺口 hold，长缺口填 0）
      const stepMs = getBucketStepMs(rangeMinutes)
      const bucketed = fillSeriesWithZeros(history, start, end, stepMs)

      // 轴范围：基于“真实历史点”（history），避免补 0 把轴拉到 0
      const tempRange = computeAutoRange(
        history.map((p) => p?.temp),
        -40,
        80,
      )
      const humiRange = computeAutoRange(
        history.map((p) => p?.humi),
        0,
        100,
      )

      this.setData({
        history,
        chartTemp: bucketed.map((p) => ({ ts: p.ts, value: p.temp })),
        chartHumi: bucketed.map((p) => ({ ts: p.ts, value: p.humi })),
        tempAxisMin: tempRange.min,
        tempAxisMax: tempRange.max,
        humiAxisMin: humiRange.min,
        humiAxisMax: humiRange.max,
      })
      this.updateHistoryDisplay(history)
    } catch (e) {
      console.error(e)
    }
  },

  updateHistoryDisplay(historyOverride) {
    const history = Array.isArray(historyOverride) ? historyOverride : this.data.history
    const { historyFolded, historyFoldCount } = this.data
    const display = historyFolded ? history.slice(0, historyFoldCount) : history
    this.setData({ historyDisplay: display })
  },

  toggleHistoryFold() {
    this.setData({ historyFolded: !this.data.historyFolded })
    this.updateHistoryDisplay()
  },

  handleRangeTap(e) {
    const { minutes } = e.currentTarget.dataset
    this.setData({ rangeMinutes: Number(minutes) || 60 })
    this.loadHistory()
  },

  handleTempThInput(e) {
    this.setData({ tempThInput: e.detail.value })
  },

  handleHumiThInput(e) {
    this.setData({ humiThInput: e.detail.value })
  },

  async handleSaveThresholds() {
    const { deviceId, tempThInput, humiThInput } = this.data
    if (!deviceId) return
    const payload = {}
    if (tempThInput !== '') payload.tempTh = Number(tempThInput)
    if (humiThInput !== '') payload.humiTh = Number(humiThInput)
    try {
      await setDeviceThresholds(deviceId, payload)
      wx.showToast({ title: '阈值已下发', icon: 'success' })
      this.loadRealtime()
    } catch (e) {
      console.error(e)
      wx.showToast({ title: '下发失败', icon: 'none' })
    }
  },
})

