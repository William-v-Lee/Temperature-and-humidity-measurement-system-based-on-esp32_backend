package com.example.iot_thermohygrometer.repository;

import com.example.iot_thermohygrometer.entity.DeviceTelemetry;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface DeviceTelemetryRepository extends JpaRepository<DeviceTelemetry, Long> {

    Optional<DeviceTelemetry> findTop1ByDeviceIdOrderByTsDesc(String deviceId);

    List<DeviceTelemetry> findByDeviceIdAndTsBetweenOrderByTsAsc(String deviceId, Long startTs, Long endTs);
}

