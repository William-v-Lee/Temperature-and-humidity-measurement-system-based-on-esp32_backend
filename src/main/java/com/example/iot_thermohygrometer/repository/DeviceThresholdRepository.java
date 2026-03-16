package com.example.iot_thermohygrometer.repository;

import com.example.iot_thermohygrometer.entity.DeviceThreshold;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface DeviceThresholdRepository extends JpaRepository<DeviceThreshold, Long> {

    Optional<DeviceThreshold> findByDeviceId(String deviceId);
}

