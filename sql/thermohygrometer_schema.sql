-- Thermohygrometer 后端数据库 schema（MySQL）
-- 建议：库名示例 `thermohygrometer`
-- 使用前请根据需要调整字符集 / 排序规则等

-- 如果数据库不存在则创建
CREATE DATABASE IF NOT EXISTS `thermohygrometer`
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_general_ci;

-- 使用目标数据库
USE `thermohygrometer`;

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

/*======================================================================
 * 1. 设备表 device
 *  - 保存设备基础信息（唯一标识、名称、位置等）
 *  - device_id 与设备上报的 JSON 字段 device_id 一致
 *====================================================================*/
DROP TABLE IF EXISTS `device`;
CREATE TABLE `device` (
  `id`           BIGINT       NOT NULL AUTO_INCREMENT COMMENT '自增主键',
  `device_id`    VARCHAR(128) NOT NULL COMMENT '设备唯一ID，与上报JSON中的device_id完全一致',
  `name`         VARCHAR(64)  DEFAULT NULL COMMENT '设备名称/别名，给前端显示用',
  `location`     VARCHAR(128) DEFAULT NULL COMMENT '安装位置描述',
  `remark`       VARCHAR(255) DEFAULT NULL COMMENT '备注说明',
  `create_time`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_device_device_id` (`device_id`) USING BTREE
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_general_ci
  COMMENT = '设备基础信息表';


/*======================================================================
 * 2. 温湿度历史表 device_telemetry
 *  - 存储每次上报的温湿度与报警状态
 *  - 用于历史曲线、查询、统计
 *====================================================================*/
DROP TABLE IF EXISTS `device_telemetry`;
CREATE TABLE `device_telemetry` (
  `id`           BIGINT        NOT NULL AUTO_INCREMENT COMMENT '自增主键',
  `device_id`    VARCHAR(128)  NOT NULL COMMENT '设备唯一ID，对应device.device_id',
  `ts`           BIGINT        NOT NULL COMMENT '上报时间戳，毫秒（Unix ms），来源于JSON的timestamp',
  `temp`         DOUBLE        NOT NULL COMMENT '温度，单位℃',
  `humi`         DOUBLE        NOT NULL COMMENT '湿度，单位%RH',
  `temp_alarm`   TINYINT(1)    NOT NULL DEFAULT 0 COMMENT '温度是否报警 true/false',
  `humi_alarm`   TINYINT(1)    NOT NULL DEFAULT 0 COMMENT '湿度是否报警 true/false',
  `create_time`  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '入库时间（可与ts略有差异）',
  PRIMARY KEY (`id`),
  KEY `idx_telemetry_device_ts` (`device_id`, `ts`) USING BTREE,
  KEY `idx_telemetry_ts` (`ts`) USING BTREE
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_general_ci
  COMMENT = '设备温湿度历史遥测数据表';


/*======================================================================
 * 3. 设备当前阈值表 device_threshold
 *  - 保存当前生效的温湿度报警阈值（云端视角）
 *  - 当小程序设置阈值时：
 *      1）记录一条阈值变更（可选的历史表）
 *      2）更新此表当前值
 *      3）同时通过 MQTT 下发给设备
 *====================================================================*/
DROP TABLE IF EXISTS `device_threshold`;
CREATE TABLE `device_threshold` (
  `id`           BIGINT        NOT NULL AUTO_INCREMENT COMMENT '自增主键',
  `device_id`    VARCHAR(128)  NOT NULL COMMENT '设备唯一ID',
  `temp_th`      DOUBLE        DEFAULT NULL COMMENT '温度报警阈值(℃)，允许为空表示未设置',
  `humi_th`      DOUBLE        DEFAULT NULL COMMENT '湿度报警阈值(%RH)，允许为空表示未设置',
  `create_time`  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '记录创建时间',
  `update_time`  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后一次修改时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_threshold_device_id` (`device_id`) USING BTREE
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_general_ci
  COMMENT = '设备当前报警阈值表（云端记录）';


/*======================================================================
 * 4. 阈值变更历史表 device_threshold_history（可选但推荐）
 *  - 用于记录每次阈值调整的历史，便于审计 / 追踪
 *====================================================================*/
DROP TABLE IF EXISTS `device_threshold_history`;
CREATE TABLE `device_threshold_history` (
  `id`              BIGINT        NOT NULL AUTO_INCREMENT COMMENT '自增主键',
  `device_id`       VARCHAR(128)  NOT NULL COMMENT '设备唯一ID',
  `old_temp_th`     DOUBLE        DEFAULT NULL COMMENT '修改前温度阈值',
  `old_humi_th`     DOUBLE        DEFAULT NULL COMMENT '修改前湿度阈值',
  `new_temp_th`     DOUBLE        DEFAULT NULL COMMENT '修改后温度阈值',
  `new_humi_th`     DOUBLE        DEFAULT NULL COMMENT '修改后湿度阈值',
  `operator`        VARCHAR(64)   DEFAULT NULL COMMENT '操作人标识（如小程序用户ID），如果只单用户可为空',
  `remark`          VARCHAR(255)  DEFAULT NULL COMMENT '备注（例如来源、原因）',
  `create_time`     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '修改时间',
  PRIMARY KEY (`id`),
  KEY `idx_th_history_device_time` (`device_id`, `create_time`) USING BTREE
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_general_ci
  COMMENT = '设备报警阈值变更历史表';


/*======================================================================
 * 5. 设备状态表 device_status（可选：也可以只用 Redis）
 *  - 缓存设备最新一条数据和在线状态
 *  - 在线判定逻辑：
 *      后端轮询或在每次数据写入时更新 last_ts，
 *      若 NOW - last_ts > N 秒（例如 60）则认为离线
 *====================================================================*/
DROP TABLE IF EXISTS `device_status`;
CREATE TABLE `device_status` (
  `device_id`       VARCHAR(128)  NOT NULL COMMENT '设备唯一ID（主键）',
  `last_ts`         BIGINT        DEFAULT NULL COMMENT '最近一次上报时间戳（毫秒）',
  `last_temp`       DOUBLE        DEFAULT NULL COMMENT '最近一次上报温度',
  `last_humi`       DOUBLE        DEFAULT NULL COMMENT '最近一次上报湿度',
  `temp_alarm`      TINYINT(1)    NOT NULL DEFAULT 0 COMMENT '最近一次温度是否报警',
  `humi_alarm`      TINYINT(1)    NOT NULL DEFAULT 0 COMMENT '最近一次湿度是否报警',
  `online`          TINYINT(1)    NOT NULL DEFAULT 0 COMMENT '设备是否在线（0离线，1在线）',
  `update_time`     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最近一次状态更新时间',
  PRIMARY KEY (`device_id`),
  KEY `idx_status_update_time` (`update_time`) USING BTREE
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_general_ci
  COMMENT = '设备最新状态与在线状态缓存表';


/*======================================================================
 * 6. 一些推荐说明
 *  - 所有 device_id 字段建议与设备上报的 device_id 完全一致，便于直接关联
 *  - ts 使用 BIGINT 毫秒时间戳，可在 Java 中用 Instant.ofEpochMilli 转换
 *  - 历史表（device_telemetry）数据可能会比较大，建议：
 *      * 对 device_id + ts 建复合索引以支持时间范围查询
 *      * 按时间做归档或分表（例如按月）可以在后期再做
 *====================================================================*/

SET FOREIGN_KEY_CHECKS = 1;

