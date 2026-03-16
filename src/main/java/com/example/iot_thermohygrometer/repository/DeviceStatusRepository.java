package com.example.iot_thermohygrometer.repository;

import com.example.iot_thermohygrometer.entity.DeviceStatus;
import org.springframework.data.jpa.repository.JpaRepository;

public interface DeviceStatusRepository extends JpaRepository<DeviceStatus, String> {
}

