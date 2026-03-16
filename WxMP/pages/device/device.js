import { getDeviceRealtime, getDeviceHistory, setDeviceThresholds } from '../../utils/request'
import { formatTime } from '../../utils/util'

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
    rangeMinutes: 60,
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
    const end = Date.now()
    const start = end - rangeMinutes * 60 * 1000
    try {
      const list = await getDeviceHistory(deviceId, start, end)
      const history = list || []
      // 简单抽稀：最多 300 个点，避免 canvas 画太密
      const maxPoints = 300
      const step = Math.max(1, Math.floor(history.length / maxPoints))
      const sampled = history.filter((_, idx) => idx % step === 0)
      this.setData({
        history,
        chartTemp: sampled.map((p) => ({ ts: p.ts, value: p.temp })),
        chartHumi: sampled.map((p) => ({ ts: p.ts, value: p.humi })),
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

