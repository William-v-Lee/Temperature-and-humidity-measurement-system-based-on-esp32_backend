const BASE_URL = 'https://iot.weeemake.com.cn/api'// TODO: 替换为你的后端 https 域名，例如 https://iot.yourdomain.com/api

function request({ url, method = 'GET', data = {}, header = {} }) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: BASE_URL + url,
      method,
      data,
      header: {
        'Content-Type': 'application/json',
        ...header,
      },
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data)
        } else {
          console.error('API error', url, res)
          reject(res)
        }
      },
      fail(err) {
        console.error('Network error', url, err)
        reject(err)
      },
    })
  })
}

export function getDevices() {
  return request({ url: '/devices' })
}

export function getDeviceRealtime(deviceId) {
  return request({ url: `/devices/${deviceId}/realtime` })
}

export function getDeviceHistory(deviceId, start, end) {
  return request({
    url: `/devices/${deviceId}/history`,
    data: { start, end },
  })
}

export function setDeviceThresholds(deviceId, payload) {
  return request({
    url: `/devices/${deviceId}/thresholds`,
    method: 'POST',
    data: payload,
  })
}

