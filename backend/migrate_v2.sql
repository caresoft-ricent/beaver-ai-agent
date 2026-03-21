-- ============================================================
-- beaver-ai-agent 2.0 迁移脚本
-- 日期: 2026-03-21
-- ============================================================

-- 1. 新建 rc_ai_domain 表
CREATE TABLE IF NOT EXISTS rc_ai_domain (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    tenant_id BIGINT NOT NULL COMMENT '租户ID',
    code VARCHAR(100) NOT NULL UNIQUE COMMENT '域编码（如 inspection, issue）',
    name VARCHAR(200) NOT NULL COMMENT '域名称（如 工序验收、问题整改）',
    description TEXT COMMENT '域描述（给 LLM 和 Planner 读的）',
    version INT DEFAULT 1 COMMENT '版本号',
    status ENUM('draft','reviewed','published','deprecated') DEFAULT 'draft' COMMENT '发布状态',
    generated_by ENUM('manual','llm','leiden','domain_auto') DEFAULT 'manual' COMMENT '来源',
    confidence DECIMAL(3,2) DEFAULT 1.00 COMMENT '置信度',
    default_risk_level ENUM('low','medium','high') DEFAULT 'low' COMMENT '域默认风险等级',
    requires_scope_check BOOLEAN DEFAULT TRUE COMMENT '是否强制 scope 校验',
    response_style ENUM('text','card','table','mixed') DEFAULT 'mixed' COMMENT '默认输出风格',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_tenant (tenant_id),
    INDEX idx_status (status),
    INDEX idx_code (code)
) COMMENT='业务域（2.0 运行时第一装载对象）';

-- 2. rc_ai_entity 增加 domain_id
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='rc_ai_entity' AND COLUMN_NAME='domain_id');
SET @sql = IF(@col_exists=0, 'ALTER TABLE rc_ai_entity ADD COLUMN domain_id BIGINT DEFAULT NULL COMMENT "所属 Domain", ADD INDEX idx_domain (domain_id)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3. rc_ai_action 增加 domain_id, evidence_schema, response_type
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='rc_ai_action' AND COLUMN_NAME='domain_id');
SET @sql = IF(@col_exists=0, 'ALTER TABLE rc_ai_action ADD COLUMN domain_id BIGINT DEFAULT NULL COMMENT "所属 Domain（冗余，方便查询）"', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='rc_ai_action' AND COLUMN_NAME='evidence_schema');
SET @sql = IF(@col_exists=0, 'ALTER TABLE rc_ai_action ADD COLUMN evidence_schema JSON DEFAULT NULL COMMENT "证据项定义"', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='rc_ai_action' AND COLUMN_NAME='response_type');
SET @sql = IF(@col_exists=0, 'ALTER TABLE rc_ai_action ADD COLUMN response_type VARCHAR(16) DEFAULT "text" COMMENT "默认输出形式: text/table/card/confirm/mixed"', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 4. rc_ai_action_parameter 增加映射字段
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='rc_ai_action_parameter' AND COLUMN_NAME='filter_type');
SET @sql = IF(@col_exists=0, 'ALTER TABLE rc_ai_action_parameter ADD COLUMN filter_type VARCHAR(50) DEFAULT NULL COMMENT "河狸云 filterType：String/Integer/Long/Decimal/Boolean/Date/Time/DateTime/set"', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='rc_ai_action_parameter' AND COLUMN_NAME='filter_condition');
SET @sql = IF(@col_exists=0, 'ALTER TABLE rc_ai_action_parameter ADD COLUMN filter_condition VARCHAR(50) DEFAULT NULL COMMENT "河狸云条件类型: equals/contains/greaterThan/lessThan/inRange 等"', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='rc_ai_action_parameter' AND COLUMN_NAME='value_mode');
SET @sql = IF(@col_exists=0, 'ALTER TABLE rc_ai_action_parameter ADD COLUMN value_mode VARCHAR(20) DEFAULT "filter" COMMENT "值传递模式: filter/values/range/date_range"', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='rc_ai_action_parameter' AND COLUMN_NAME='agg_func');
SET @sql = IF(@col_exists=0, 'ALTER TABLE rc_ai_action_parameter ADD COLUMN agg_func VARCHAR(50) DEFAULT NULL COMMENT "聚合函数: sum/count/distinctCount/avg/max/min/first/last/percent/formula"', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='rc_ai_action_parameter' AND COLUMN_NAME='sort_order');
SET @sql = IF(@col_exists=0, 'ALTER TABLE rc_ai_action_parameter ADD COLUMN sort_order VARCHAR(4) DEFAULT NULL COMMENT "排序方式: asc/desc"', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 5. rc_ai_adapter 增加 request_mapper, response_mapper
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='rc_ai_adapter' AND COLUMN_NAME='request_mapper');
SET @sql = IF(@col_exists=0, 'ALTER TABLE rc_ai_adapter ADD COLUMN request_mapper VARCHAR(100) DEFAULT "passthrough" COMMENT "请求映射器: passthrough/beaver_dataset"', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='rc_ai_adapter' AND COLUMN_NAME='response_mapper');
SET @sql = IF(@col_exists=0, 'ALTER TABLE rc_ai_adapter ADD COLUMN response_mapper VARCHAR(100) DEFAULT "passthrough" COMMENT "响应映射器: passthrough/beaver_dataset"', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 6. rc_ai_execution_log 增加 domain_id, param_gaps, fallback_reason, confirm_status
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='rc_ai_execution_log' AND COLUMN_NAME='domain_id');
SET @sql = IF(@col_exists=0, 'ALTER TABLE rc_ai_execution_log ADD COLUMN domain_id BIGINT DEFAULT NULL COMMENT "命中的 Domain", ADD INDEX idx_domain (domain_id)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='rc_ai_execution_log' AND COLUMN_NAME='param_gaps');
SET @sql = IF(@col_exists=0, 'ALTER TABLE rc_ai_execution_log ADD COLUMN param_gaps JSON DEFAULT NULL COMMENT "参数缺口（自发现用）"', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='rc_ai_execution_log' AND COLUMN_NAME='fallback_reason');
SET @sql = IF(@col_exists=0, 'ALTER TABLE rc_ai_execution_log ADD COLUMN fallback_reason VARCHAR(500) DEFAULT NULL COMMENT "fallback 原因"', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='rc_ai_execution_log' AND COLUMN_NAME='confirm_status');
SET @sql = IF(@col_exists=0, 'ALTER TABLE rc_ai_execution_log ADD COLUMN confirm_status VARCHAR(16) DEFAULT "not_needed" COMMENT "确认状态: not_needed/pending/confirmed/cancelled"', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 7. 更新河狸云 adapter 的 request_mapper 和 response_mapper
UPDATE rc_ai_adapter SET request_mapper = 'beaver_dataset', response_mapper = 'beaver_dataset'
WHERE name = '河狸云' AND (request_mapper IS NULL OR request_mapper = 'passthrough');

SELECT 'Migration v2 completed successfully' AS result;
