package com.example.iot_thermohygrometer.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;

@Getter
@Setter
@Entity
@Table(name = "device_telemetry", indexes = {
        @Index(name = "idx_telemetry_device_ts", columnList = "device_id, ts"),
        @Index(name = "idx_telemetry_ts", columnList = "ts")
})
public class DeviceTelemetry {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "device_id", nullable = false, length = 128)
    private String deviceId;

    /**
     * 毫秒时间戳，使用 BIGINT 存储
     */
    @Column(name = "ts", nullable = false)
    private Long ts;

    @Column(name = "temp", nullable = false)
    private Double temp;

    @Column(name = "humi", nullable = false)
    private Double humi;

    @Column(name = "temp_alarm", nullable = false)
    private Boolean tempAlarm = false;

    @Column(name = "humi_alarm", nullable = false)
    private Boolean humiAlarm = false;

    @Column(name = "create_time", insertable = false, updatable = false)
    private Instant createTime;
}

