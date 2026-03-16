package com.example.iot_thermohygrometer.mqtt;

import com.example.iot_thermohygrometer.service.TelemetryService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.integration.annotation.ServiceActivator;
import org.springframework.messaging.Message;
import org.springframework.stereotype.Component;

@Component
public class MqttMessageDispatcher {

    private static final Logger log = LoggerFactory.getLogger(MqttMessageDispatcher.class);

    private final TelemetryService telemetryService;

    public MqttMessageDispatcher(TelemetryService telemetryService) {
        this.telemetryService = telemetryService;
    }

    /**
     * 统一处理从 mqttInputChannel 进入的消息
     */
    @ServiceActivator(inputChannel = "mqttInputChannel")
    public void handleMessage(Message<String> message) {
        String topic = (String) message.getHeaders().get("mqtt_receivedTopic");
        String payload = message.getPayload();

        // 业务上有用的日志：只打印主题和 payload 长度，避免刷屏
        log.info("MQTT message received, topic={}, payloadLength={}", topic,
                payload != null ? payload.length() : 0);
        // 为了排查字段（如 temp_th/humi_th）是否真的上报，这里临时在 info 打印 payload（带长度保护）
        if (payload != null) {
            final int maxLen = 600;
            String safe = payload.length() <= maxLen ? payload : payload.substring(0, maxLen) + "...(truncated)";
            log.info("MQTT payload: {}", safe);
        }

        // 当前项目中，订阅的就是设备上行温湿度数据主题（例如 th/esp32_ml307_client），
        // 所以这里直接全部交给 TelemetryService 处理即可。
        telemetryService.handleTelemetryPayload(payload);
    }
}

