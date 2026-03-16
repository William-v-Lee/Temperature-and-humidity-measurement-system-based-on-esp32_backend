package com.example.iot_thermohygrometer.web;

import com.example.iot_thermohygrometer.entity.Device;
import com.example.iot_thermohygrometer.entity.DeviceStatus;
import com.example.iot_thermohygrometer.entity.DeviceTelemetry;
import com.example.iot_thermohygrometer.entity.DeviceThreshold;
import com.example.iot_thermohygrometer.repository.DeviceRepository;
import com.example.iot_thermohygrometer.repository.DeviceStatusRepository;
import com.example.iot_thermohygrometer.repository.DeviceTelemetryRepository;
import com.example.iot_thermohygrometer.repository.DeviceThresholdRepository;
import com.example.iot_thermohygrometer.service.ThresholdService;
import com.example.iot_thermohygrometer.web.dto.RealtimeResponse;
import com.example.iot_thermohygrometer.web.dto.ThresholdRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/devices")
public class DeviceController {

    private static final Logger log = LoggerFactory.getLogger(DeviceController.class);

    // 在线超时时间（毫秒），超过则认为离线，这里默认 60s
    private static final long ONLINE_TIMEOUT_MS = Duration.ofSeconds(60).toMillis();

    private final DeviceRepository deviceRepository;
    private final DeviceStatusRepository statusRepository;
    private final DeviceTelemetryRepository telemetryRepository;
    private final DeviceThresholdRepository thresholdRepository;
    private final ThresholdService thresholdService;

    public DeviceController(DeviceRepository deviceRepository,
                            DeviceStatusRepository statusRepository,
                            DeviceTelemetryRepository telemetryRepository,
                            DeviceThresholdRepository thresholdRepository,
                            ThresholdService thresholdService) {
        this.deviceRepository = deviceRepository;
        this.statusRepository = statusRepository;
        this.telemetryRepository = telemetryRepository;
        this.thresholdRepository = thresholdRepository;
        this.thresholdService = thresholdService;
    }

    /**
     * 查询所有设备的基本信息，用于前端下拉选择设备
     */
    @GetMapping
    public ResponseEntity<List<Device>> listDevices() {
        List<Device> all = deviceRepository.findAll();
        log.info("List devices: count={}", all.size());
        return ResponseEntity.ok(all);
    }

    /**
     * 获取设备实时数据（最近一条）+ 在线状态
     */
    @GetMapping("/{deviceId}/realtime")
    public ResponseEntity<RealtimeResponse> getRealtime(@PathVariable String deviceId) {
        DeviceStatus status = statusRepository.findById(deviceId).orElse(null);
        if (status == null || status.getLastTs() == null) {
            log.info("Realtime query: deviceId={} not found or no status", deviceId);
            return ResponseEntity.notFound().build();
        }

        long now = Instant.now().toEpochMilli();
        boolean online = (now - status.getLastTs()) <= ONLINE_TIMEOUT_MS;

        RealtimeResponse resp = new RealtimeResponse();
        resp.setDeviceId(deviceId);
        resp.setTimestamp(status.getLastTs());
        resp.setTemp(status.getLastTemp());
        resp.setHumi(status.getLastHumi());
        resp.setTempAlarm(status.getTempAlarm());
        resp.setHumiAlarm(status.getHumiAlarm());
        resp.setOnline(online);

        // 附带当前阈值（用于前端实时显示）
        DeviceThreshold th = thresholdRepository.findByDeviceId(deviceId).orElse(null);
        if (th != null) {
            resp.setTempTh(th.getTempTh());
            resp.setHumiTh(th.getHumiTh());
        }

        log.info("Realtime query: deviceId={}, online={}, temp={}, humi={}, tempTh={}, humiTh={}",
                deviceId, online, status.getLastTemp(), status.getLastHumi(), resp.getTempTh(), resp.getHumiTh());

        return ResponseEntity.ok(resp);
    }

    /**
     * 获取历史数据（用于画曲线）
     */
    @GetMapping("/{deviceId}/history")
    public ResponseEntity<List<DeviceTelemetry>> getHistory(
            @PathVariable String deviceId,
            @RequestParam("start") Long start,
            @RequestParam("end") Long end) {

        if (start == null || end == null || start > end) {
            return ResponseEntity.badRequest().build();
        }
        List<DeviceTelemetry> list =
                telemetryRepository.findByDeviceIdAndTsBetweenOrderByTsAsc(deviceId, start, end);
        log.info("History query: deviceId={}, start={}, end={}, size={}",
                deviceId, start, end, list.size());

        // 直接返回实体也可以；如需精简字段，可映射到 DTO
        List<DeviceTelemetry> result = list.stream().collect(Collectors.toList());
        return ResponseEntity.ok(result);
    }

    /**
     * 设置阈值，并通过 MQTT 下发给设备
     */
    @PostMapping("/{deviceId}/thresholds")
    public ResponseEntity<Void> setThresholds(@PathVariable String deviceId,
                                              @RequestBody ThresholdRequest request) {
        thresholdService.sendThresholdToDevice(deviceId, request);
        return ResponseEntity.ok().build();
    }
}

