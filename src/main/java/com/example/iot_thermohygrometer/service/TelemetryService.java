package com.example.iot_thermohygrometer.service;

import com.example.iot_thermohygrometer.entity.Device;
import com.example.iot_thermohygrometer.entity.DeviceStatus;
import com.example.iot_thermohygrometer.entity.DeviceTelemetry;
import com.example.iot_thermohygrometer.entity.DeviceThreshold;
import com.example.iot_thermohygrometer.repository.DeviceRepository;
import com.example.iot_thermohygrometer.repository.DeviceStatusRepository;
import com.example.iot_thermohygrometer.repository.DeviceTelemetryRepository;
import com.example.iot_thermohygrometer.repository.DeviceThresholdRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class TelemetryService {

    private static final Logger log = LoggerFactory.getLogger(TelemetryService.class);

    private final DeviceTelemetryRepository telemetryRepository;
    private final DeviceStatusRepository statusRepository;
    private final DeviceRepository deviceRepository;
    private final DeviceThresholdRepository thresholdRepository;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public TelemetryService(DeviceTelemetryRepository telemetryRepository,
                            DeviceStatusRepository statusRepository,
                            DeviceRepository deviceRepository,
                            DeviceThresholdRepository thresholdRepository) {
        this.telemetryRepository = telemetryRepository;
        this.statusRepository = statusRepository;
        this.deviceRepository = deviceRepository;
        this.thresholdRepository = thresholdRepository;
    }

    /**
     * 处理来自设备的 JSON 遥测数据（温湿度 + 报警状态）
     */
    @Transactional
    public void handleTelemetryPayload(String json) {
        try {
            JsonNode node = objectMapper.readTree(json);

            String deviceId = node.path("device_id").asText(null);
            if (deviceId == null || deviceId.isBlank()) {
                log.warn("Telemetry payload missing device_id: {}", json);
                return;
            }
            // 不再从 MQTT 消息中拿设备时间，统一使用服务器在“收到消息时”的当前时间作为时间戳
            long timestamp = System.currentTimeMillis();
            double temp = node.path("temp").asDouble();
            double humi = node.path("humi").asDouble();

            // 设备上报的当前阈值（可选）：用于前端实时展示
            Double tempTh = null;
            Double humiTh = null;
            // 兼容 snake_case 与 camelCase
            if (node.hasNonNull("temp_th")) {
                tempTh = node.get("temp_th").asDouble();
            } else if (node.hasNonNull("tempTh")) {
                tempTh = node.get("tempTh").asDouble();
            }
            if (node.hasNonNull("humi_th")) {
                humiTh = node.get("humi_th").asDouble();
            } else if (node.hasNonNull("humiTh")) {
                humiTh = node.get("humiTh").asDouble();
            }

            boolean tempAlarm = node.has("temp_alarm") && node.get("temp_alarm").asBoolean();
            boolean humiAlarm = node.has("humi_alarm") && node.get("humi_alarm").asBoolean();

            // 关键业务日志：每条遥测的核心字段（使用服务器接收时间作为时间戳）
            log.info("Telemetry received: deviceId={}, ts(storeMs)={}, temp={}, humi={}, tempTh={}, humiTh={}, tempAlarm={}, humiAlarm={}",
                    deviceId, timestamp, temp, humi, tempTh, humiTh, tempAlarm, humiAlarm);

            // 确保 device 表中存在一条唯一记录（如果没有则自动插入一条基础信息）
            deviceRepository.findByDeviceId(deviceId)
                    .orElseGet(() -> {
                        Device device = new Device();
                        device.setDeviceId(deviceId);
                        device.setName(deviceId); // 默认名称先用 deviceId，可后续在前端修改
                        return deviceRepository.save(device);
                    });

            // 入库历史数据
            DeviceTelemetry telemetry = new DeviceTelemetry();
            telemetry.setDeviceId(deviceId);
            telemetry.setTs(timestamp);
            telemetry.setTemp(temp);
            telemetry.setHumi(humi);
            telemetry.setTempAlarm(tempAlarm);
            telemetry.setHumiAlarm(humiAlarm);
            telemetryRepository.save(telemetry);

            // 更新阈值表（如果本次上报携带了阈值）
            if (tempTh != null || humiTh != null) {
                DeviceThreshold threshold = thresholdRepository.findByDeviceId(deviceId)
                        .orElseGet(() -> {
                            DeviceThreshold t = new DeviceThreshold();
                            t.setDeviceId(deviceId);
                            return t;
                        });
                if (tempTh != null) {
                    threshold.setTempTh(tempTh);
                }
                if (humiTh != null) {
                    threshold.setHumiTh(humiTh);
                }
                thresholdRepository.save(threshold);
            }

            // 更新状态表
            DeviceStatus status = statusRepository.findById(deviceId)
                    .orElseGet(() -> {
                        DeviceStatus s = new DeviceStatus();
                        s.setDeviceId(deviceId);
                        return s;
                    });
            status.setLastTs(timestamp);
            status.setLastTemp(temp);
            status.setLastHumi(humi);
            status.setTempAlarm(tempAlarm);
            status.setHumiAlarm(humiAlarm);
            status.setOnline(true);
            statusRepository.save(status);

        } catch (Exception e) {
            log.error("Error handling telemetry payload: {}", json, e);
        }
    }
}

