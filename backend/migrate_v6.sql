-- v6 Migration: ALTER TABLE + CREATE TABLE + UPDATE
-- MySQL 8.0 compatible (no IF NOT EXISTS for ADD COLUMN)
-- Only adds columns verified as missing from information_schema

-- rc_ai_entity: add generated_by, confidence, discovery_status (version already exists)
ALTER TABLE rc_ai_entity
    ADD COLUMN generated_by ENUM('manual','llm','api_sync','domain_auto') DEFAULT 'manual' COMMENT '数据来源',
    ADD COLUMN confidence DECIMAL(3,2) DEFAULT 1.00 COMMENT '可信度',
    ADD COLUMN discovery_status ENUM('draft','reviewed','published') DEFAULT 'published' COMMENT '审核状态';

-- rc_ai_entity_property: add semantic_role, enum_values, generated_by
ALTER TABLE rc_ai_entity_property
    ADD COLUMN semantic_role ENUM('identifier','status','scope','timestamp','metric','label','content') DEFAULT NULL COMMENT '语义角色',
    ADD COLUMN enum_values JSON DEFAULT NULL COMMENT '枚举值',
    ADD COLUMN generated_by ENUM('manual','llm') DEFAULT 'manual' COMMENT '数据来源';

-- rc_ai_entity_relation: add join_property, generated_by (relation_type already exists)
ALTER TABLE rc_ai_entity_relation
    ADD COLUMN join_property VARCHAR(200) DEFAULT NULL COMMENT '关联字段',
    ADD COLUMN generated_by ENUM('manual','llm') DEFAULT 'manual' COMMENT '数据来源';

-- rc_ai_action: add action_type, risk_level, generated_by, discovery_status (requires_confirmation already exists)
ALTER TABLE rc_ai_action
    ADD COLUMN action_type ENUM('query','mutation') DEFAULT 'query' COMMENT '查询/写操作',
    ADD COLUMN risk_level ENUM('low','medium','high') DEFAULT 'low' COMMENT '风险等级',
    ADD COLUMN generated_by ENUM('manual','llm','api_sync') DEFAULT 'manual' COMMENT '数据来源',
    ADD COLUMN discovery_status ENUM('draft','reviewed','published') DEFAULT 'published' COMMENT '审核状态';

-- rc_ai_action_parameter: add enum_values, semantic_role, generated_by (default_value already exists)
ALTER TABLE rc_ai_action_parameter
    ADD COLUMN enum_values JSON DEFAULT NULL COMMENT '枚举值',
    ADD COLUMN semantic_role ENUM('identifier','status','scope','timestamp','metric','label','content') DEFAULT NULL COMMENT '语义角色',
    ADD COLUMN generated_by ENUM('manual','llm') DEFAULT 'manual' COMMENT '数据来源';

-- rc_ai_adapter: add adapter_type, db_config, openapi_url (base_url, status already exist)
ALTER TABLE rc_ai_adapter
    ADD COLUMN adapter_type ENUM('webapi','database') DEFAULT 'webapi' COMMENT '适配器类型',
    ADD COLUMN db_config JSON DEFAULT NULL COMMENT '数据库配置',
    ADD COLUMN openapi_url VARCHAR(500) DEFAULT NULL COMMENT 'OpenAPI文档地址';

-- rc_ai_skill: add generated_by, discovery_status, test_cases (match_keywords already exists)
ALTER TABLE rc_ai_skill
    ADD COLUMN generated_by ENUM('manual','llm','domain_auto') DEFAULT 'manual' COMMENT '数据来源',
    ADD COLUMN discovery_status ENUM('draft','reviewed','published') DEFAULT 'published' COMMENT '审核状态',
    ADD COLUMN test_cases JSON DEFAULT NULL COMMENT '测试用例';

-- rc_ai_tool: add generated_by
ALTER TABLE rc_ai_tool
    ADD COLUMN generated_by ENUM('manual','llm') DEFAULT 'manual' COMMENT '数据来源';

-- New table: rc_ai_execution_log
CREATE TABLE IF NOT EXISTS rc_ai_execution_log (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    session_id VARCHAR(100) DEFAULT NULL COMMENT 'Redis Session ID',
    conversation_id BIGINT DEFAULT NULL COMMENT '对话ID',
    user_input TEXT COMMENT '用户原始输入',
    skill_id BIGINT DEFAULT NULL,
    tool_id BIGINT DEFAULT NULL,
    entity_id BIGINT DEFAULT NULL,
    action_id BIGINT DEFAULT NULL,
    adapter_id BIGINT DEFAULT NULL,
    input_params JSON COMMENT '打平的输入参数',
    output_data JSON COMMENT '打平的输出结果',
    user_context JSON COMMENT '用户上下文（不含headers）',
    success BOOLEAN COMMENT '是否成功',
    error_message TEXT DEFAULT NULL,
    duration_ms INT DEFAULT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_session (session_id),
    INDEX idx_action (action_id),
    INDEX idx_success_created (success, created_at)
) COMMENT='执行日志（证据链 + 自发现反馈 + 小模型训练数据）';

-- Data supplement: fill adapter base_url
UPDATE rc_ai_adapter SET
    adapter_type = 'webapi',
    base_url = 'https://beaver.ricent.com',
    status = 'active'
WHERE name = '河狸云';
