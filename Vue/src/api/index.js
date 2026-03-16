import axios from 'axios';

// 根据你的后端实际端口调整，假设后端跑在 8080
const http = axios.create({
  baseURL: 'http://localhost:8080/api',
  timeout: 5000,
});

http.interceptors.response.use(
  (resp) => resp,
  (error) => {
    console.error('API error', error);
    return Promise.reject(error);
  },
);

export function getDeviceRealtime(deviceId) {
  return http.get(`/devices/${deviceId}/realtime`).then((r) => r.data);
}

export function getDevices() {
  return http.get('/devices').then((r) => r.data);
}

export function getDeviceHistory(deviceId, start, end) {
  return http
    .get(`/devices/${deviceId}/history`, {
      params: { start, end },
    })
    .then((r) => r.data);
}

export function setDeviceThresholds(deviceId, payload) {
  return http.post(`/devices/${deviceId}/thresholds`, payload);
}

