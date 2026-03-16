package com.example.iot_thermohygrometer.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDateTime;

@Getter
@Setter
@Entity
@Table(name = "device_status")
public class DeviceStatus {

    @Id
    @Column(name = "device_id", length = 128)
    private String deviceId;

    @Column(name = "last_ts")
    private Long lastTs;

    @Column(name = "last_temp")
    private Double lastTemp;

    @Column(name = "last_humi")
    private Double lastHumi;

    @Column(name = "temp_alarm", nullable = false)
    private Boolean tempAlarm = false;

    @Column(name = "humi_alarm", nullable = false)
    private Boolean humiAlarm = false;

    @Column(name = "online", nullable = false)
    private Boolean online = false;

    @Column(name = "update_time", insertable = false, updatable = false)
    private LocalDateTime updateTime;
}

