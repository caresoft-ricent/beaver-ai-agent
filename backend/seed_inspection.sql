-- =============================================
-- 样板域种子数据：inspection（工序验收）
-- Phase 2：打穿 Domain → Entity → Action → Parameter 全链路
-- =============================================

-- 1. 创建 Domain: inspection
INSERT INTO rc_ai_domain (tenant_id, code, name, description, version, status, generated_by, confidence, default_risk_level, requires_scope_check, response_style)
VALUES (1, 'inspection', '工序验收',
    '负责工序验收相关的查询与管理，包括验收记录查询、验收统计、验收详情等。关键词：验收、工序、检查、巡检',
    1, 'published', 'manual', 1.00, 'low', TRUE, 'table');

SET @domain_id = LAST_INSERT_ID();

-- 2. 创建 Entity: inspection_record（工序验收记录）
INSERT INTO rc_ai_entity (tenant_id, entity_mode, entity_code, entity_name, category, entity_description, connector_id, status, domain_id)
VALUES (1, 'api', 'inspection_record', '工序验收记录', '质量管理',
    '工序验收记录，包含项目、工序名称、验收结果、验收人、验收时间等信息', 2, 'published', @domain_id);

SET @entity_id = LAST_INSERT_ID();

-- 3. 创建 Entity Properties
INSERT INTO rc_ai_entity_property (entity_id, name, type, title, property_description, is_input, is_output) VALUES
(@entity_id, 'project_id', 'number', '项目ID', '工程项目的唯一标识', TRUE, FALSE),
(@entity_id, 'project_name', 'string', '项目名称', '项目名称，支持模糊搜索', TRUE, TRUE),
(@entity_id, 'inspection_status', 'string', '验收状态', '验收状态：1=待验收 2=已通过 3=不通过 4=整改中', TRUE, TRUE),
(@entity_id, 'inspector_name', 'string', '验收人', '执行验收的人员姓名', TRUE, TRUE),
(@entity_id, 'process_name', 'string', '工序名称', '被验收的工序名称', FALSE, TRUE),
(@entity_id, 'inspection_date', 'date', '验收日期', '验收执行日期', TRUE, TRUE),
(@entity_id, 'inspection_result', 'string', '验收结论', '验收结论：合格/不合格/有条件通过', FALSE, TRUE);

-- 4. 创建 Action: inspection_list（查询验收列表）
INSERT INTO rc_ai_action (tenant_id, entity_id, connector_id, action_code, action_name, action_description,
    http_method, api_path, action_type, risk_level, response_type, domain_id, discovery_status)
VALUES (1, @entity_id, 2, 'inspection_list', '查询工序验收列表',
    '查询工序验收记录列表，支持按项目、状态、日期、验收人等条件筛选',
    'POST', '/api/dataset/query', 'query', 'low', 'table', @domain_id, 'published');

SET @action_list_id = LAST_INSERT_ID();

-- 5. 创建 Action: inspection_statistics（验收统计）
INSERT INTO rc_ai_action (tenant_id, entity_id, connector_id, action_code, action_name, action_description,
    http_method, api_path, action_type, risk_level, response_type, domain_id, discovery_status)
VALUES (1, @entity_id, 2, 'inspection_statistics', '工序验收统计',
    '统计工序验收数据，包括通过率、各状态数量、按项目汇总等',
    'POST', '/api/dataset/query', 'query', 'low', 'table', @domain_id, 'published');

SET @action_stat_id = LAST_INSERT_ID();

-- 6. ActionParameter — inspection_list 输入参数
INSERT INTO rc_ai_action_parameter (action_id, name, source_property, type, title, param_description,
    is_input, is_output, is_required, default_value,
    filter_type, filter_condition, value_mode) VALUES
-- 项目ID
(@action_list_id, 'project_id', 'project_id', 'number', '项目ID', '项目唯一标识',
    TRUE, FALSE, FALSE, NULL,
    'Long', 'equals', 'filter'),
-- 项目名称（模糊搜索 → 用 keyword）
(@action_list_id, 'keyword', 'project_name', 'string', '关键字', '按项目名称/工序名称模糊搜索',
    TRUE, FALSE, FALSE, NULL,
    NULL, NULL, 'filter'),
-- 验收状态（多值集合）
(@action_list_id, 'inspection_status', 'inspection_status', 'string', '验收状态', '验收状态筛选：1=待验收 2=已通过 3=不通过 4=整改中',
    TRUE, FALSE, FALSE, NULL,
    'set', NULL, 'values'),
-- 验收人
(@action_list_id, 'inspector_name', 'inspector_name', 'string', '验收人', '验收人姓名',
    TRUE, FALSE, FALSE, NULL,
    'String', 'contains', 'filter'),
-- 验收日期（日期范围）
(@action_list_id, 'inspection_date', 'inspection_date', 'date', '验收日期', '验收日期范围',
    TRUE, FALSE, FALSE, NULL,
    'Date', 'inRange', 'date_range'),
-- limit
(@action_list_id, 'limit', NULL, 'number', '数量限制', '返回记录数量上限',
    TRUE, FALSE, FALSE, '100',
    NULL, NULL, 'filter');

-- 7. ActionParameter — inspection_list 输出参数
INSERT INTO rc_ai_action_parameter (action_id, name, type, title, param_description,
    is_input, is_output, agg_func, sort_order) VALUES
(@action_list_id, 'project_name', 'string', '项目名称', '所属项目',
    FALSE, TRUE, NULL, NULL),
(@action_list_id, 'process_name', 'string', '工序名称', '验收工序',
    FALSE, TRUE, NULL, NULL),
(@action_list_id, 'inspection_status', 'string', '验收状态', '1=待验收 2=已通过 3=不通过 4=整改中',
    FALSE, TRUE, NULL, NULL),
(@action_list_id, 'inspector_name', 'string', '验收人', '验收执行人',
    FALSE, TRUE, NULL, NULL),
(@action_list_id, 'inspection_date', 'date', '验收日期', '验收执行日期',
    FALSE, TRUE, NULL, 'desc'),
(@action_list_id, 'inspection_result', 'string', '验收结论', '合格/不合格/有条件通过',
    FALSE, TRUE, NULL, NULL);

-- 8. ActionParameter — inspection_statistics 输入参数
INSERT INTO rc_ai_action_parameter (action_id, name, source_property, type, title, param_description,
    is_input, is_output, is_required, default_value,
    filter_type, filter_condition, value_mode) VALUES
(@action_stat_id, 'project_id', 'project_id', 'number', '项目ID', '项目唯一标识',
    TRUE, FALSE, FALSE, NULL,
    'Long', 'equals', 'filter'),
(@action_stat_id, 'inspection_date', 'inspection_date', 'date', '验收日期', '统计日期范围',
    TRUE, FALSE, FALSE, NULL,
    'Date', 'inRange', 'date_range'),
(@action_stat_id, 'inspection_status', 'inspection_status', 'string', '验收状态', '按状态筛选',
    TRUE, FALSE, FALSE, NULL,
    'set', NULL, 'values');

-- 9. ActionParameter — inspection_statistics 输出参数
INSERT INTO rc_ai_action_parameter (action_id, name, type, title, param_description,
    is_input, is_output, agg_func, sort_order) VALUES
-- 分组维度
(@action_stat_id, 'project_name', 'string', '项目名称', '按项目分组',
    FALSE, TRUE, NULL, NULL),
(@action_stat_id, 'inspection_status', 'string', '验收状态', '按状态分组',
    FALSE, TRUE, NULL, NULL),
-- 聚合指标
(@action_stat_id, 'total_count', 'number', '验收总数', '验收记录总数量',
    FALSE, TRUE, 'count', NULL),
(@action_stat_id, 'pass_count', 'number', '通过数量', '通过的验收数量',
    FALSE, TRUE, 'count', NULL),
(@action_stat_id, 'pass_rate', 'number', '通过率', '验收通过率百分比',
    FALSE, TRUE, 'percent', NULL);

-- 10. 更新河狸云生产 Adapter 的映射器为 beaver_dataset
UPDATE rc_ai_adapter SET request_mapper = 'beaver_dataset', response_mapper = 'beaver_dataset'
WHERE id = 2;
