import { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Table, Button, Modal, Form, Input, Select, message, Space, Tag, Popconfirm,
  Alert, Card, Descriptions, Collapse, InputNumber, Typography, Divider, Empty,
  Switch,
} from 'antd';
import {
  PlusOutlined, SendOutlined, ThunderboltOutlined, DeleteOutlined,
  InfoCircleOutlined, LinkOutlined, SearchOutlined, ApartmentOutlined,
} from '@ant-design/icons';
import {
  getSkills, createSkill, updateSkill, deleteSkill, publishSkill,
  getSkillTools, createSkillTool, deleteSkillTool,
  getEntities, getActions, getLLMConfigs,
} from '../api/admin';

const { Text } = Typography;

interface Skill {
  id: number;
  tenant_id: number;
  skill_code: string;
  skill_name: string;
  category?: string;
  skill_description?: string;
  match_keywords?: string[];
  match_patterns?: string[];
  response_template?: string;
  response_prompt?: string;
  intent_prompt?: string;
  entity_extract_prompt?: string;
  max_response_tokens?: number;
  max_tool_calls?: number;
  summary_threshold?: number;
  llm_config_id?: number;
  flow_type?: string;
  workflow_config?: Record<string, unknown> | null;
  sort_order: number;
  status: string;
  version: number;
}

interface SkillToolItem {
  id: number;
  skill_id: number;
  tools_mode: string;
  entity_id?: number;
  action_id?: number;
  order_no: number;
}

interface EntityItem { id: number; entity_code: string; entity_name: string; }
interface ActionItem { id: number; action_code: string; action_name: string; }

export default function SkillList() {
  const navigate = useNavigate();
  const [data, setData] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form] = Form.useForm();
  const [guideVisible, setGuideVisible] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');

  // Tool chain state
  const [toolModalOpen, setToolModalOpen] = useState(false);
  const [toolSkillId, setToolSkillId] = useState<number | null>(null);
  const [toolList, setToolList] = useState<SkillToolItem[]>([]);
  const [toolLoading, setToolLoading] = useState(false);

  // Entity/Action options for tool chain
  const [entityOptions, setEntityOptions] = useState<EntityItem[]>([]);
  const [actionOptions, setActionOptions] = useState<ActionItem[]>([]);
  const [toolForm] = Form.useForm();
  const [llmOptions, setLlmOptions] = useState<{id: number; name: string}[]>([]);
  const [flowType, setFlowType] = useState<string>('simple');
  const [workflowConfig, setWorkflowConfig] = useState<Record<string, unknown> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getSkills();
      setData(res.data.data?.items || []);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadEntities = useCallback(async () => {
    try {
      const res = await getEntities();
      setEntityOptions(res.data.data?.items || []);
    } catch { /* ignore */ }
  }, []);

  const loadLLMConfigs = useCallback(async () => {
    try {
      const res = await getLLMConfigs();
      setLlmOptions((res.data.data?.items || []).map((c: Record<string, unknown>) => ({ id: c.id as number, name: c.name as string })));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { load(); loadEntities(); loadLLMConfigs(); }, [load, loadEntities, loadLLMConfigs]);

  const categories = useMemo(() => {
    const cats = new Set(data.map(d => d.category).filter(Boolean));
    return Array.from(cats) as string[];
  }, [data]);

  const filteredData = useMemo(() => {
    let list = data;
    if (categoryFilter) list = list.filter(r => r.category === categoryFilter);
    if (searchText) {
      const s = searchText.toLowerCase();
      list = list.filter(r => r.skill_code?.toLowerCase().includes(s) || r.skill_name?.toLowerCase().includes(s)
        || r.skill_description?.toLowerCase().includes(s) || r.match_keywords?.some(k => k.toLowerCase().includes(s)));
    }
    return list;
  }, [data, searchText, categoryFilter]);

  const handleEntityChangeForTool = async (entityId: number) => {
    toolForm.setFieldValue('action_id', undefined);
    setActionOptions([]);
    if (entityId) {
      try {
        const res = await getActions(entityId);
        setActionOptions(res.data.data || []);
      } catch { /* ignore */ }
    }
  };

  const handleSubmit = async () => {
    const values = await form.validateFields();
    if (typeof values.match_keywords === 'string') {
      values.match_keywords = values.match_keywords.split(',').map((k: string) => k.trim()).filter(Boolean);
    }
    if (typeof values.match_patterns === 'string') {
      values.match_patterns = values.match_patterns.split('\n').map((k: string) => k.trim()).filter(Boolean);
    }
    if (editingId) {
      const val = values.category;
      values.category = Array.isArray(val) ? val[0] || '' : val || '';
      values.flow_type = flowType;
      values.workflow_config = flowType === 'workflow' ? workflowConfig : null;
      await updateSkill(editingId, values);
      message.success('更新成功');
    } else {
      const val = values.category;
      values.category = Array.isArray(val) ? val[0] || '' : val || '';
      values.flow_type = flowType;
      values.workflow_config = flowType === 'workflow' ? workflowConfig : null;
      await createSkill(values);
      message.success('创建成功');
    }
    setModalOpen(false);
    form.resetFields();
    setEditingId(null);
    load();
  };

  const handlePublish = async (id: number) => {
    await publishSkill(id);
    message.success('发布成功');
    load();
  };

  // Tool chain operations
  const openToolChain = async (skillId: number) => {
    setToolSkillId(skillId);
    setToolModalOpen(true);
    setToolLoading(true);
    try {
      const res = await getSkillTools(skillId);
      setToolList(res.data.data?.tools || []);
    } catch { setToolList([]); }
    finally { setToolLoading(false); }
  };

  const handleAddTool = async () => {
    const values = await toolForm.validateFields();
    if (!toolSkillId) return;
    await createSkillTool(toolSkillId, {
      ...values,
      skill_id: toolSkillId,
    });
    message.success('工具已添加');
    toolForm.resetFields();
    // reload
    const res = await getSkillTools(toolSkillId);
    setToolList(res.data.data?.tools || []);
  };

  const handleDeleteTool = async (toolId: number) => {
    await deleteSkillTool(toolId);
    message.success('已删除');
    if (toolSkillId) {
      const res = await getSkillTools(toolSkillId);
      setToolList(res.data.data?.tools || []);
    }
  };

  const openEdit = (record: Skill) => {
    setEditingId(record.id);
    setFlowType(record.flow_type || 'simple');
    setWorkflowConfig(record.workflow_config || null);
    form.setFieldsValue({
      ...record,
      category: record.category ? [record.category] : [],
      match_keywords: Array.isArray(record.match_keywords) ? record.match_keywords.join(', ') : '',
      match_patterns: Array.isArray(record.match_patterns) ? record.match_patterns.join('\n') : '',
    });
    setModalOpen(true);
  };

  const columns = [
    { title: '编码', dataIndex: 'skill_code', width: 180 },
    { title: '名称', dataIndex: 'skill_name', width: 140 },
    { title: '模式', dataIndex: 'flow_type', width: 80, align: 'center' as const,
      render: (v: string) => v === 'workflow'
        ? <Tag color="purple" icon={<ApartmentOutlined />}>编排</Tag>
        : <Tag>简单</Tag>,
    },
    { title: '分类', dataIndex: 'category', width: 100,
      render: (c: string) => c ? <Tag>{c}</Tag> : <Text type="secondary">未分类</Text>,
    },
    {
      title: '关键词', dataIndex: 'match_keywords', width: 200,
      render: (kws: string[]) => kws?.length ? (
        <Space wrap size={[4, 4]}>{kws.map((k, i) => <Tag key={i} color="blue">{k}</Tag>)}</Space>
      ) : <Text type="secondary">未配置</Text>,
    },
    {
      title: '优先级', dataIndex: 'sort_order', width: 70, align: 'center' as const,
      render: (v: number) => <Tag>{v}</Tag>,
    },
    { title: '版本', dataIndex: 'version', width: 60, align: 'center' as const },
    {
      title: '状态', dataIndex: 'status', width: 100,
      render: (s: string, record: Skill) => (
        <Switch
          checked={s === 'published'}
          checkedChildren="已发布"
          unCheckedChildren="草稿"
          onChange={async (checked) => {
            if (checked) {
              await publishSkill(record.id);
              message.success('发布成功');
            } else {
              await updateSkill(record.id, { status: 'draft' });
              message.success('已取消发布');
            }
            load();
          }}
        />
      ),
    },
    {
      title: '操作', width: 280,
      render: (_: unknown, record: Skill) => (
        <Space>
          {record.flow_type === 'workflow' ? (
            <Button size="small" icon={<ApartmentOutlined />} onClick={() => navigate(`/intents/${record.id}/workflow`)}>
              编排
            </Button>
          ) : (
            <Button size="small" icon={<LinkOutlined />} onClick={() => openToolChain(record.id)}>
              工具链
            </Button>
          )}
          <Button size="small" onClick={() => openEdit(record)}>编辑</Button>
          <Popconfirm title="确认删除?" okText="确认" cancelText="取消" onConfirm={() => deleteSkill(record.id).then(load)}>
            <Button size="small" danger>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>技能/意图管理</h2>
        <Space>
          <Input placeholder="搜索编码/名称/关键词" prefix={<SearchOutlined />} allowClear style={{ width: 200 }}
            value={searchText} onChange={e => setSearchText(e.target.value)} />
          <Select placeholder="分类筛选" allowClear style={{ width: 140 }} value={categoryFilter || undefined}
            onChange={v => setCategoryFilter(v || '')} options={categories.map(c => ({ value: c, label: c }))} />
          <Button icon={<InfoCircleOutlined />} onClick={() => setGuideVisible(!guideVisible)}>
            {guideVisible ? '收起引导' : '使用说明'}
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditingId(null); form.resetFields(); setFlowType('simple'); setWorkflowConfig(null); setModalOpen(true); }}>
            新建技能
          </Button>
        </Space>
      </div>

      {guideVisible && (
        <Alert
          type="info"
          showIcon
          closable
          onClose={() => setGuideVisible(false)}
          style={{ marginBottom: 16 }}
          message="技能配置说明"
          description={
            <div>
              <p style={{ margin: '4px 0' }}>技能 = 一种用户意图。当用户发送消息时，系统通过<b>关键词/正则匹配</b>识别到对应技能后，执行<b>工具链</b>获取数据，再用<b>回答模板</b>生成回复。</p>
              <Collapse size="small" ghost items={[{
                key: '1',
                label: '📖 完整配置流程 (点击展开)',
                children: (
                  <ol style={{ paddingLeft: 20, margin: 0 }}>
                    <li><b>新建技能</b> — 填写编码、名称、匹配关键词</li>
                    <li><b>配置工具链</b> — 点击「工具链」按钮，关联本体和操作（如：产线实体 → 查询进度操作）</li>
                    <li><b>设置回答模板</b> — 编辑回答模板，用 <code>{'{变量名}'}</code> 引用返回数据</li>
                    <li><b>发布</b> — 点击「发布」按钮使技能生效，发布后在对话中可触发</li>
                  </ol>
                ),
              }]} />
            </div>
          }
        />
      )}

      <Table dataSource={filteredData} rowKey="id" loading={loading} columns={columns}
        expandable={{
          expandedRowRender: (record: Skill) => (
            <Descriptions size="small" column={2} bordered>
              <Descriptions.Item label="描述" span={2}>{record.skill_description || '—'}</Descriptions.Item>
              <Descriptions.Item label="正则匹配">{record.match_patterns?.join(', ') || '—'}</Descriptions.Item>
              <Descriptions.Item label="大模型ID">{record.llm_config_id || '未关联'}</Descriptions.Item>
              <Descriptions.Item label="回答模板" span={2}>
                <Text code style={{ whiteSpace: 'pre-wrap' }}>{record.response_template || '—'}</Text>
              </Descriptions.Item>
            </Descriptions>
          ),
        }}
      />

      {/* 新建/编辑技能 Modal */}
      <Modal title={editingId ? '编辑技能' : '新建技能'} open={modalOpen} onOk={handleSubmit} onCancel={() => { setModalOpen(false); setFlowType('simple'); setWorkflowConfig(null); }}
        width={680} destroyOnClose
        okText="确认" cancelText="取消">
        <Form form={form} layout="vertical" initialValues={{ tenant_id: 1, sort_order: 0 }}>
          <Form.Item name="tenant_id" hidden><Input /></Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Form.Item name="skill_code" label="技能编码" rules={[{ required: true, message: '请输入技能编码' }]}
              tooltip="唯一标识，如 QUERY_PROGRESS">
              <Input placeholder="如 QUERY_PROGRESS" disabled={!!editingId} />
            </Form.Item>
            <Form.Item name="skill_name" label="技能名称" rules={[{ required: true, message: '请输入技能名称' }]}>
              <Input placeholder="如 查询产线进度" />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Form.Item name="category" label="分类" tooltip="用于归类管理，如：生产类、质量类、设备类">
              <Select allowClear placeholder="选择或输入分类" mode="tags" maxCount={1}
                options={categories.map(c => ({ value: c, label: c }))} />
            </Form.Item>
            <div />
          </div>

          <Divider orientation="left" plain>流程模式</Divider>

          <Form.Item label="流程类型" tooltip="简单模式: 线性工具链，适合单步查询；编排模式: 可视化流程，适合多步骤、条件分支、并行等复杂场景">
            <Select value={flowType} onChange={v => setFlowType(v)} style={{ width: 200 }}
              options={[
                { value: 'simple', label: '⚙️ 简单模式 - 线性工具链' },
                { value: 'workflow', label: '🗂️ 编排模式 - 可视化流程' },
              ]} />
          </Form.Item>

          {flowType === 'workflow' && editingId && (
            <Alert type="info" showIcon style={{ marginBottom: 16 }}
              message="编排模式已开启"
              description="保存技能后，点击列表中的「编排」按钮进入全屏流程编排器配置流程。"
            />
          )}
          {flowType === 'workflow' && !editingId && (
            <Alert type="info" showIcon style={{ marginBottom: 16 }}
              message="编排模式"
              description="请先保存技能，然后在列表中点击「编排」按钮进入全屏流程编排器。"
            />
          )}

          <Form.Item name="skill_description" label="描述" tooltip="帮助 AI 理解何时触发此技能">
            <Input.TextArea rows={2} placeholder="当用户询问产线进度、交货状态时触发此技能" />
          </Form.Item>

          <Divider orientation="left" plain>意图匹配</Divider>

          <Form.Item name="match_keywords" label="匹配关键词" tooltip="逗号分隔，命中越多得分越高"
            extra="多个关键词用逗号分隔。例: 进度, 产线, 交货, 生产。用户消息命中越多关键词，匹配分越高。">
            <Input placeholder="进度, 产线, 交货, 生产" />
          </Form.Item>

          <Form.Item name="match_patterns" label="正则匹配" tooltip="每行一条正则表达式"
            extra="每行一条正则。如: .*进度.* 匹配任何包含「进度」的句子。正则得分 0.9。">
            <Input.TextArea rows={2} placeholder="每行一条正则表达式，如: .*进度.*" />
          </Form.Item>

          <Form.Item name="sort_order" label="优先级" tooltip="越小越优先">
            <InputNumber min={0} max={999} style={{ width: '100%' }} />
          </Form.Item>

          <Divider orientation="left" plain>回复配置</Divider>

          <Form.Item name="response_template" label="回答模板" tooltip="使用 {字段名} 引用工具链返回的数据"
            extra="支持变量替换，如: 产线 {line_name} 的进度为 {progress}%。留空则由系统自动格式化数据。">
            <Input.TextArea rows={3} placeholder="产线 {line_name} 的进度为 {progress}%" />
          </Form.Item>

          <Form.Item name="intent_prompt" label="意图识别提示词 (LLM)" tooltip="关联大模型后，用此提示词做意图识别">
            <Input.TextArea rows={2} placeholder="可选：当关键词无法匹配时，由大模型判断是否命中此技能" />
          </Form.Item>

          <Form.Item name="entity_extract_prompt" label="实体抽取提示词" tooltip="自定义LLM实体抽取提示词，支持{intent_code},{entities_desc},{known_str},{context_str}变量">
            <Input.TextArea rows={2} placeholder="可选：自定义实体抽取提示词模板" />
          </Form.Item>

          <Form.Item name="response_prompt" label="回答生成提示词" tooltip="LLM生成回答时使用的系统提示词">
            <Input.TextArea rows={2} placeholder="可选：请根据以下数据，用友好的中文回答用户的问题。" />
          </Form.Item>

          <Divider orientation="left" plain>LLM 约束</Divider>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
            <Form.Item name="max_response_tokens" label="最大回复Token" tooltip="0表示使用默认值(512)">
              <InputNumber min={0} max={8192} placeholder="0=默认" style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="max_tool_calls" label="最大工具调用次数" tooltip="单轮对话中最多调用的工具数">
              <InputNumber min={1} max={50} placeholder="默认10" style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="summary_threshold" label="摘要触发轮次" tooltip="超过此轮次数后自动触发上下文摘要">
              <InputNumber min={5} max={100} placeholder="默认20" style={{ width: '100%' }} />
            </Form.Item>
          </div>

          <Form.Item name="llm_config_id" label="关联大模型">
            <Select placeholder="请选择大模型配置（可选）" allowClear style={{ width: '100%' }}
              options={llmOptions.map(c => ({ value: c.id, label: c.name }))} />
          </Form.Item>
        </Form>
      </Modal>

      {/* 工具链管理 Modal */}
      <Modal
        title={<><ThunderboltOutlined /> 工具链管理</>}
        open={toolModalOpen}
        onCancel={() => setToolModalOpen(false)}
        footer={null}
        width={700}
        destroyOnClose
      >
        <Alert type="info" showIcon style={{ marginBottom: 16 }}
          message="工具链定义了技能被触发后要调用的本体操作。按 order_no 顺序执行，每一步的结果可以传递给下一步。" />

        {toolLoading ? <div style={{ textAlign: 'center', padding: 24 }}>加载中...</div> : (
          <>
            {toolList.length === 0 ? (
              <Empty description="尚未配置工具链" style={{ margin: '16px 0' }} />
            ) : (
              <Table dataSource={toolList} rowKey="id" size="small" pagination={false} style={{ marginBottom: 16 }}
                columns={[
                  { title: '序号', dataIndex: 'order_no', width: 60 },
                  { title: '类型', dataIndex: 'tools_mode', width: 80, render: (m: string) => <Tag>{m}</Tag> },
                  {
                    title: '本体', dataIndex: 'entity_id', width: 140,
                    render: (id: number) => entityOptions.find(e => e.id === id)?.entity_name || id || '—',
                  },
                  {
                    title: '操作', dataIndex: 'action_id', width: 140,
                    render: (id: number) => id || '—',
                  },
                  {
                    title: '', width: 60,
                    render: (_: unknown, record: SkillToolItem) => (
                      <Popconfirm title="确认删除此工具?" okText="确认" cancelText="取消" onConfirm={() => handleDeleteTool(record.id)}>
                        <Button size="small" danger icon={<DeleteOutlined />} />
                      </Popconfirm>
                    ),
                  },
                ]}
              />
            )}

            <Card size="small" title="添加工具">
              <Form form={toolForm} layout="inline" style={{ flexWrap: 'wrap', gap: 8 }}>
                <Form.Item name="entity_id" label="本体" rules={[{ required: true, message: '请选择' }]}>
                  <Select style={{ width: 160 }} placeholder="选择本体"
                    options={entityOptions.map(e => ({ value: e.id, label: e.entity_name }))}
                    onChange={handleEntityChangeForTool}
                  />
                </Form.Item>
                <Form.Item name="action_id" label="操作">
                  <Select style={{ width: 160 }} placeholder="选择操作" allowClear
                    options={actionOptions.map(a => ({ value: a.id, label: a.action_name }))}
                  />
                </Form.Item>
                <Form.Item name="order_no" label="序号" initialValue={toolList.length}>
                  <InputNumber min={0} style={{ width: 70 }} />
                </Form.Item>
                <Form.Item>
                  <Button type="primary" icon={<PlusOutlined />} onClick={handleAddTool}>添加</Button>
                </Form.Item>
              </Form>
            </Card>
          </>
        )}
      </Modal>
    </>
  );
}
