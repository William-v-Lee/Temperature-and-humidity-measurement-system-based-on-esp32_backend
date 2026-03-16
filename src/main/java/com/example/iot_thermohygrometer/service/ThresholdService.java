package com.example.iot_thermohygrometer.service;

import com.example.iot_thermohygrometer.entity.DeviceThreshold;
import com.example.iot_thermohygrometer.repository.DeviceThresholdRepository;
import com.example.iot_thermohygrometer.web.dto.ThresholdRequest;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.integration.mqtt.support.MqttHeaders;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.support.MessageBuilder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ThresholdService {

    @Value("${mqtt.topic.cmd}")
    private String cmdTopic;

    private final MessageChannel mqttOutboundChannel;
    private final DeviceThresholdRepository thresholdRepository;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public ThresholdService(MessageChannel mqttOutboundChannel,
                            DeviceThresholdRepository thresholdRepository) {
        this.mqttOutboundChannel = mqttOutboundChannel;
        this.thresholdRepository = thresholdRepository;
    }

    @Transactional
    public void sendThresholdToDevice(String deviceId, ThresholdRequest request) {
        // 1. 发送 MQTT 指令
        ObjectNode node = objectMapper.createObjectNode();
        node.put("device_id", deviceId);
        if (request.getTempTh() != null) {
            node.put("temp_th", request.getTempTh());
        }
        if (request.getHumiTh() != null) {
            node.put("humi_th", request.getHumiTh());
        }
        String payload = node.toString();

        Message<String> message = MessageBuilder.withPayload(payload)
                .setHeader(MqttHeaders.TOPIC, cmdTopic)
                .build();
        mqttOutboundChannel.send(message);

        // 2. 更新当前阈值表
        DeviceThreshold threshold = thresholdRepository.findByDeviceId(deviceId)
                .orElseGet(() -> {
                    DeviceThreshold t = new DeviceThreshold();
                    t.setDeviceId(deviceId);
                    return t;
                });
        if (request.getTempTh() != null) {
            threshold.setTempTh(request.getTempTh());
        }
        if (request.getHumiTh() != null) {
            threshold.setHumiTh(request.getHumiTh());
        }
        thresholdRepository.save(threshold);
    }
}

