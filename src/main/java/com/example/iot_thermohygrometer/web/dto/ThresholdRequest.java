package com.example.iot_thermohygrometer.web.dto;

import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class ThresholdRequest {

    /**
     * 温度报警阈值，单位℃，可为空表示不修改
     */
    private Double tempTh;

    /**
     * 湿度报警阈值，单位%RH，可为空表示不修改
     */
    private Double humiTh;
}

