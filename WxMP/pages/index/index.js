// pages/index/index.js
import { getDevices } from '../../utils/request'

Page({
  data: {
    devices: [],
    loading: false,
    error: '',
  },

  onLoad() {
    this.loadDevices()
  },

  async loadDevices() {
    this.setData({ loading: true, error: '' })
    try {
      const list = await getDevices()
      this.setData({ devices: list || [] })
    } catch (e) {
      console.error(e)
      this.setData({ error: '获取设备列表失败，请检查后端服务' })
    } finally {
      this.setData({ loading: false })
    }
  },

  onPullDownRefresh() {
    this.loadDevices().finally(() => {
      wx.stopPullDownRefresh()
    })
  },

  handleTapDevice(e) {
    const { deviceId } = e.currentTarget.dataset
    if (!deviceId) return
    wx.navigateTo({
      url: `/pages/device/device?deviceId=${encodeURIComponent(deviceId)}`,
    })
  },
})
