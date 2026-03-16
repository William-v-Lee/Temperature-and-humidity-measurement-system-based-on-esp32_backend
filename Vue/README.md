cd# IOT Thermohygrometer 前端（Vue 3 + Vite）

本前端用于配合 `IOT_Thermohygrometer` Java 后端，实现温湿度监控大屏。

## 启动后端

1. 在 IDE 中打开整个 Maven 工程根目录 `IOT_Thermohygrometer`
2. 确保数据库已按 `sql/thermohygrometer_schema.sql` 建好，并在 `application.yml` 中配置好连接
3. 运行 Spring Boot 启动类 `IotThermohygrometerApplication`，默认监听 `http://localhost:8080`

后端主要提供的接口（前端已对接）：

- `GET /api/devices/{deviceId}/realtime`：获取设备实时温湿度、在线状态、报警标志
- `GET /api/devices/{deviceId}/history?start=xxx&end=yyy`：按时间范围获取历史曲线数据
- `POST /api/devices/{deviceId}/thresholds`：设置温湿度阈值并通过 MQTT 下发

## 启动前端

```bash
cd Vue
npm install        # 已经安装过可跳过
npm run dev        # 默认 http://localhost:5173
```

确保浏览器能访问后端接口地址 `http://localhost:8080/api/...`，如有跨域需求，可在后端增加 CORS 配置或通过 Nginx 反向代理。

