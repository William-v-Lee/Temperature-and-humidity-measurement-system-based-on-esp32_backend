package com.example.iot_thermohygrometer.web.dto;

import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class RealtimeResponse {

    private String deviceId;
    private Long timestamp;
    private Double temp;
    private Double humi;
    private Double tempTh;
    private Double humiTh;
    private Boolean tempAlarm;
    private Boolean humiAlarm;
    private Boolean online;
}

