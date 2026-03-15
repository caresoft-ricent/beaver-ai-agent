import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Table, Button, Modal, Form, Input, Select, message, Space, Tag, Popconfirm,
  Alert, Card, Descriptions, Collapse, InputNumber, Typography, Divider, Empty,
  Switch, Tooltip, Tabs,
} from 'antd';
import {
  PlusOutlined, SendOutlined, DeleteOutlined, InfoCircleOutlined,
  ApiOutlined, DatabaseOutlined, ExperimentOutlined, SettingOutlined,
  SearchOutlined, EditOutlined, EyeOutlined,
} from '@ant-design/icons';
import {
  getEntities, getEntity, createEntity, updateEntity, deleteEntity, publishEntity,
  getConnectors, createAction, deleteAction, createEntityProperty, deleteEntityProperty,
  updateEntityProperty, getAction, updateAction, getActionParameters,
  createActionParameter, deleteActionParameter,
} from '../api/admin';

const { Text } = Typography;

interface Entity {
  id: number;
  tenant_id: number;
  entity_code: string;
  entity_name: string;
  entity_mode: string;
  category?: string;
  entity_description?: string;
  connector_id?: number;
  status: string;
  version: number;
}

interface ConnectorItem { id: number; name: string; }
interface PropertyItem {
  id: number;
  entity_id: number;
  name: string;
  title?: string;
  type: string;
  is_input: boolean;
  is_output: boolean;
  is_required: boolean;
  property_description?: string;
  llm_description?: string;
  extract_expression?: string;
  normalization_config?: Record<string, unknown>;
  mapping_config?: Record<string, unknown>;
}
interface ActionItem { id: number; entity_id?: number; tenant_id: number; connector_id?: number; action_code: string; action_name: string; action_description?: string; category?: string; http_method: string; api_path?: string; request_template?: Record<string, unknown>; response_mapping?: Record<string, unknown>; cache_ttl?: number; mock_response?: Record<string, unknown>; tags?: string[]; }
interface ActionParameterItem { id: number; action_id: number; property_id?: number; name: string; source_property?: string; type: string; title?: string; direction: string; is_required: boolean; }

const modeIcon: Record<string, React.ReactNode> = {
  api: <ApiOutlined />,
  database: <DatabaseOutlined />,
  mock: <ExperimentOutlined />,
};

const modeColor: Record<string, string> = { api: 'blue', database: 'purple', mock: 'orange' };
const modeLabel: Record<string, string> = { api: 'API调用', database: '数据库', mock: 'Mock' };

export default function EntityList() {
  const [data, setData] = useState<Entity[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form] = Form.useForm();
  const [guideVisible, setGuideVisible] = useState(true);
  const [connectors, setConnectors] = useState<ConnectorItem[]>([]);
  const [searchText, setSearchText] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');

  // Detail panel state
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailEntity, setDetailEntity] = useState<Entity | null>(null);
  const [properties, setProperties] = useState<PropertyItem[]>([]);
  const [actions, setActions] = useState<ActionItem[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  // Sub-forms
  const [propForm] = Form.useForm();
  const [actionForm] = Form.useForm();
  const [propEditForm] = Form.useForm();
  const [propEditOpen, setPropEditOpen] = useState(false);
  const [editingProp, setEditingProp] = useState<PropertyItem | null>(null);

  // Action detail/edit state
  const [actionDetailOpen, setActionDetailOpen] = useState(false);
  const [actionDetailData, setActionDetailData] = useState<ActionItem | null>(null);
  const [actionParams, setActionParams] = useState<ActionParameterItem[]>([]);
  const [actionDetailLoading, setActionDetailLoading] = useState(false);
  const [actionEditForm] = Form.useForm();
  const [actionParamForm] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getEntities();
      setData(res.data.data?.items || []);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadConnectors = useCallback(async () => {
    try {
      const res = await getConnectors();
      setConnectors(res.data.data?.items || []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { load(); loadConnectors(); }, [load, loadConnectors]);

  const categories = useMemo(() => {
    const cats = new Set(data.map(d => d.category).filter(Boolean));
    return Array.from(cats) as string[];
  }, [data]);

  const filteredData = useMemo(() => {
    let list = data;
    if (categoryFilter) list = list.filter(r => r.category === categoryFilter);
    if (searchText) {
      const s = searchText.toLowerCase();
      list = list.filter(r => r.entity_code?.toLowerCase().includes(s) || r.entity_name?.toLowerCase().includes(s) || r.entity_description?.toLowerCase().includes(s));
    }
    return list;
  }, [data, searchText, categoryFilter]);

  const handleSubmit = async () => {
    const values = await form.validateFields();
    if (editingId) {
      const val = values.category;
      values.category = Array.isArray(val) ? val[0] || '' : val || '';
      await updateEntity(editingId, values);
      message.success('更新成功');
    } else {
      const val = values.category;
      values.category = Array.isArray(val) ? val[0] || '' : val || '';
      await createEntity(values);
      message.success('创建成功');
    }
    setModalOpen(false);
    form.resetFields();
    setEditingId(null);
    load();
  };

  const handlePublish = async (id: number) => {
    await publishEntity(id);
    message.success('发布成功');
    load();
  };

  const openDetail = async (record: Entity) => {
    setDetailEntity(record);
    setDetailOpen(true);
    setDetailLoading(true);
    try {
      const res = await getEntity(record.id);
      const d = res.data.data;
      setProperties(d?.properties || []);
      setActions(d?.actions || []);
    } catch { setProperties([]); setActions([]); }
    finally { setDetailLoading(false); }
  };

  const handleAddProperty = async () => {
    if (!detailEntity) return;
    const values = await propForm.validateFields();
    await createEntityProperty(detailEntity.id, { ...values, entity_id: detailEntity.id });
    message.success('属性已添加');
    propForm.resetFields();
    openDetail(detailEntity);
  };

  const handleDeleteProperty = async (propId: number) => {
    await deleteEntityProperty(propId);
    message.success('已删除');
    if (detailEntity) openDetail(detailEntity);
  };

  const openPropEdit = (record: PropertyItem) => {
    setEditingProp(record);
    propEditForm.setFieldsValue({
      ...record,
      normalization_config: record.normalization_config ? JSON.stringify(record.normalization_config, null, 2) : '',
      mapping_config: record.mapping_config ? JSON.stringify(record.mapping_config, null, 2) : '',
    });
    setPropEditOpen(true);
  };

  const handlePropEditSave = async () => {
    if (!editingProp) return;
    const values = await propEditForm.validateFields();
    if (values.normalization_config && typeof values.normalization_config === 'string') {
      try { values.normalization_config = JSON.parse(values.normalization_config); } catch { message.error('归一化配置JSON格式错误'); return; }
    }
    if (values.mapping_config && typeof values.mapping_config === 'string') {
      try { values.mapping_config = JSON.parse(values.mapping_config); } catch { message.error('映射配置JSON格式错误'); return; }
    }
    await updateEntityProperty(editingProp.id, values);
    message.success('属性已更新');
    setPropEditOpen(false);
    setEditingProp(null);
    if (detailEntity) openDetail(detailEntity);
  };

  const handleAddAction = async () => {
    if (!detailEntity) return;
    const values = await actionForm.validateFields();
    await createAction(detailEntity.id, { ...values, entity_id: detailEntity.id, tenant_id: detailEntity.tenant_id });
    message.success('操作已添加');
    actionForm.resetFields();
    openDetail(detailEntity);
  };

  const handleDeleteAction = async (actionId: number) => {
    await deleteAction(actionId);
    message.success('已删除');
    if (detailEntity) openDetail(detailEntity);
  };

  const openActionDetail = async (action: ActionItem) => {
    setActionDetailOpen(true);
    setActionDetailLoading(true);
    try {
      const res = await getAction(action.id);
      const d = res.data.data;
      setActionDetailData(d);
      setActionParams(d?.parameters || []);
      actionEditForm.setFieldsValue({
        ...d,
        request_template: d?.request_template ? JSON.stringify(d.request_template, null, 2) : '',
        response_mapping: d?.response_mapping ? JSON.stringify(d.response_mapping, null, 2) : '',
        mock_response: d?.mock_response ? JSON.stringify(d.mock_response, null, 2) : '',
      });
    } catch { setActionDetailData(null); setActionParams([]); }
    finally { setActionDetailLoading(false); }
  };

  const handleActionEditSave = async () => {
    if (!actionDetailData) return;
    const values = await actionEditForm.validateFields();
    const payload = { ...values };
    for (const key of ['request_template', 'response_mapping', 'mock_response'] as const) {
      if (payload[key] && typeof payload[key] === 'string') {
        try { payload[key] = JSON.parse(payload[key]); } catch { message.error(`${key} JSON格式错误`); return; }
      } else if (!payload[key]) {
        payload[key] = null;
      }
    }
    await updateAction(actionDetailData.id, payload);
    message.success('操作已更新');
    if (detailEntity) openDetail(detailEntity);
    // refresh detail
    const res = await getAction(actionDetailData.id);
    const d = res.data.data;
    setActionDetailData(d);
    setActionParams(d?.parameters || []);
    actionEditForm.setFieldsValue({
      ...d,
      request_template: d?.request_template ? JSON.stringify(d.request_template, null, 2) : '',
      response_mapping: d?.response_mapping ? JSON.stringify(d.response_mapping, null, 2) : '',
      mock_response: d?.mock_response ? JSON.stringify(d.mock_response, null, 2) : '',
    });
  };

  const handleAddActionParam = async () => {
    if (!actionDetailData) return;
    const values = await actionParamForm.validateFields();
    await createActionParameter(actionDetailData.id, { ...values, action_id: actionDetailData.id });
    message.success('参数已添加');
    actionParamForm.resetFields();
    // refresh params
    const res = await getActionParameters(actionDetailData.id);
    setActionParams(res.data.data || []);
  };

  const handleDeleteActionParam = async (paramId: number) => {
    if (!actionDetailData) return;
    await deleteActionParameter(paramId);
    message.success('已删除');
    const res = await getActionParameters(actionDetailData.id);
    setActionParams(res.data.data || []);
  };

  const columns = [
    { title: '编码', dataIndex: 'entity_code', width: 160 },
    { title: '名称', dataIndex: 'entity_name', width: 120 },
    { title: '分类', dataIndex: 'category', width: 100,
      render: (c: string) => c ? <Tag>{c}</Tag> : <Text type="secondary">未分类</Text>,
    },
    {
      title: '调用方式', dataIndex: 'entity_mode', width: 110,
      render: (m: string) => <Tag icon={modeIcon[m]} color={modeColor[m]}>{modeLabel[m] || m}</Tag>,
    },
    {
      title: '连接器', dataIndex: 'connector_id', width: 140,
      render: (id: number) => {
        const c = connectors.find(c => c.id === id);
        return c ? <Tag color="cyan">{c.name}</Tag> : <Text type="secondary">未关联</Text>;
      },
    },
    { title: '版本', dataIndex: 'version', width: 60, align: 'center' as const },
    {
      title: '状态', dataIndex: 'status', width: 100,
      render: (s: string, record: Entity) => (
        <Switch
          checked={s === 'published'}
          checkedChildren="已发布"
          unCheckedChildren="草稿"
          onChange={async (checked) => {
            if (checked) {
              await publishEntity(record.id);
              message.success('发布成功');
            } else {
              await updateEntity(record.id, { status: 'draft' });
              message.success('已取消发布');
            }
            load();
          }}
        />
      ),
    },
    {
      title: '操作', width: 300,
      render: (_: unknown, record: Entity) => (
        <Space>
          <Button size="small" icon={<SettingOutlined />} onClick={() => openDetail(record)}>属性/操作</Button>
          <Button size="small" onClick={() => { setEditingId(record.id); form.setFieldsValue({ ...record, category: record.category ? [record.category] : [] }); setModalOpen(true); }}>编辑</Button>
          <Popconfirm title="确认删除? 将同时删除所有属性和操作" okText="确认" cancelText="取消" onConfirm={() => deleteEntity(record.id).then(load)}>
            <Button size="small" danger>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>业务本体管理</h2>
        <Space>
          <Input placeholder="搜索编码/名称" prefix={<SearchOutlined />} allowClear style={{ width: 180 }}
            value={searchText} onChange={e => setSearchText(e.target.value)} />
          <Select placeholder="分类筛选" allowClear style={{ width: 140 }} value={categoryFilter || undefined}
            onChange={v => setCategoryFilter(v || '')} options={categories.map(c => ({ value: c, label: c }))} />
          <Button icon={<InfoCircleOutlined />} onClick={() => setGuideVisible(!guideVisible)}>
            {guideVisible ? '收起引导' : '使用说明'}
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditingId(null); form.resetFields(); setModalOpen(true); }}>
            新建本体
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
          message="业务本体说明"
          description={
            <div>
              <p style={{ margin: '4px 0' }}>本体 = 业务实体（如产线、人员、订单）。每个本体包含<b>属性</b>（字段定义）和<b>操作</b>（API调用配置），通过<b>连接器</b>访问外部系统数据。</p>
              <Collapse size="small" ghost items={[{
                key: '1',
                label: '📖 完整配置流程 (点击展开)',
                children: (
                  <ol style={{ paddingLeft: 20, margin: 0 }}>
                    <li><b>新建本体</b> — 编码、名称、选择调用方式（API/数据库/Mock），关联连接器</li>
                    <li><b>配置属性</b> — 点击「属性/操作」按钮，定义实体字段（如 line_name、progress）</li>
                    <li><b>配置操作</b> — 添加 API 操作（如 GET production/lines），配置 Mock 响应</li>
                    <li><b>关联技能</b> — 在技能管理中将此本体添加到工具链</li>
                    <li><b>发布</b> — 发布后才能在对话引擎中生效</li>
                  </ol>
                ),
              }]} />
            </div>
          }
        />
      )}

      <Table dataSource={filteredData} rowKey="id" loading={loading} columns={columns}
        expandable={{
          expandedRowRender: (record: Entity) => (
            <Descriptions size="small" column={2} bordered>
              <Descriptions.Item label="描述" span={2}>{record.entity_description || '—'}</Descriptions.Item>
            </Descriptions>
          ),
        }}
      />

      {/* 新建/编辑本体 Modal */}
      <Modal title={editingId ? '编辑本体' : '新建本体'} open={modalOpen} onOk={handleSubmit} onCancel={() => setModalOpen(false)} width={600} destroyOnClose
        okText="确认" cancelText="取消">
        <Form form={form} layout="vertical" initialValues={{ entity_mode: 'api', tenant_id: 1 }}>
          <Form.Item name="tenant_id" hidden><Input /></Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Form.Item name="entity_code" label="编码" rules={[{ required: true, message: '请输入编码' }]}
              tooltip="唯一标识，如 production_line">
              <Input placeholder="如 production_line" disabled={!!editingId} />
            </Form.Item>
            <Form.Item name="entity_name" label="名称" rules={[{ required: true, message: '请输入名称' }]}>
              <Input placeholder="如 产线" />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Form.Item name="category" label="分类" tooltip="用于归类管理，如：生产管理、人员管理、订单管理">
              <Select allowClear placeholder="选择或输入分类" mode="tags" maxCount={1}
                options={categories.map(c => ({ value: c, label: c }))} />
            </Form.Item>
            <Form.Item name="entity_mode" label="调用方式" tooltip="API=调用外部接口, Mock=使用模拟数据">
              <Select options={[
                { value: 'api', label: '🔗 API调用（连接器）' },
                { value: 'database', label: '🗃️ 数据库查询' },
                { value: 'mock', label: '🧪 Mock数据' },
              ]} />
            </Form.Item>
            <Form.Item name="connector_id" label="关联连接器" tooltip="选择此本体使用的连接器">
              <Select allowClear placeholder="选择连接器"
                options={connectors.map(c => ({ value: c.id, label: c.name }))}
              />
            </Form.Item>
          </div>

          <Form.Item name="entity_description" label="描述" tooltip="帮助 AI 理解此本体代表什么">
            <Input.TextArea rows={2} placeholder="描述此本体的业务含义，如：代表工厂产线，包含编号、进度、状态等信息" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 属性/操作详情 Modal */}
      <Modal
        title={<>{detailEntity?.entity_name} — 属性与操作</>}
        open={detailOpen}
        onCancel={() => setDetailOpen(false)}
        footer={null}
        width={800}
        destroyOnClose
      >
        {detailLoading ? <div style={{ textAlign: 'center', padding: 24 }}>加载中...</div> : (
          <>
            {/* 属性管理 */}
            <Card size="small" title="属性列表" style={{ marginBottom: 16 }}
              extra={<Text type="secondary">输入参数=用户提供，输出参数=API返回</Text>}>
              {properties.length === 0 ? (
                <Empty description="暂无属性" style={{ margin: '8px 0' }} />
              ) : (
                <Table dataSource={properties} rowKey="id" size="small" pagination={false} style={{ marginBottom: 12 }}
                  columns={[
                    { title: '字段名', dataIndex: 'name', width: 120 },
                    { title: '标题', dataIndex: 'title', width: 100 },
                    { title: '类型', dataIndex: 'type', width: 80, render: (t: string) => <Tag>{t}</Tag> },
                    { title: '输入', dataIndex: 'is_input', width: 50, align: 'center' as const, render: (v: boolean) => v ? <Tag color="blue">是</Tag> : '—' },
                    { title: '输出', dataIndex: 'is_output', width: 50, align: 'center' as const, render: (v: boolean) => v ? <Tag color="green">是</Tag> : '—' },
                    { title: '必填', dataIndex: 'is_required', width: 50, align: 'center' as const, render: (v: boolean) => v ? <Tag color="red">是</Tag> : '—' },
                    {
                      title: <Tooltip title="增强字段在对话引擎中用于：LLM描述→精确理解参数含义，提取规则→从消息中抽取参数，归一化→同义词/日期转换，映射→参数值转换(如名称→ID)。点击标签或编辑按钮可维护。">增强 <InfoCircleOutlined style={{fontSize:12}} /></Tooltip>,
                      width: 120, align: 'center' as const,
                      render: (_: unknown, record: PropertyItem) => {
                        const hasTags = record.llm_description || record.extract_expression || record.normalization_config || record.mapping_config;
                        return (
                          <Space size={2} style={{ cursor: 'pointer' }} onClick={() => openPropEdit(record)}>
                            {record.llm_description && <Tag color="purple" style={{margin:0}}>描述</Tag>}
                            {record.extract_expression && <Tag color="cyan" style={{margin:0}}>提取</Tag>}
                            {record.normalization_config && <Tag color="blue" style={{margin:0}}>归一</Tag>}
                            {record.mapping_config && <Tag color="orange" style={{margin:0}}>映射</Tag>}
                            {!hasTags && <Tag style={{margin:0, cursor:'pointer'}}>点击配置</Tag>}
                          </Space>
                        );
                      },
                    },
                    {
                      title: '', width: 90,
                      render: (_: unknown, record: PropertyItem) => (
                        <Space size="small">
                          <Button size="small" type="link" onClick={() => openPropEdit(record)}>编辑</Button>
                          <Popconfirm title="删除此属性?" okText="确认" cancelText="取消" onConfirm={() => handleDeleteProperty(record.id)}>
                            <Button size="small" danger icon={<DeleteOutlined />} />
                          </Popconfirm>
                        </Space>
                      ),
                    },
                  ]}
                />
              )}
              <Divider plain style={{ margin: '8px 0' }}>添加属性</Divider>
              <Form form={propForm} layout="inline" style={{ flexWrap: 'wrap', gap: 8 }}>
                <Form.Item name="name" rules={[{ required: true, message: '字段名' }]}>
                  <Input placeholder="字段名 (英文)" style={{ width: 120 }} />
                </Form.Item>
                <Form.Item name="title">
                  <Input placeholder="标题 (中文)" style={{ width: 100 }} />
                </Form.Item>
                <Form.Item name="type" initialValue="string" rules={[{ required: true }]}>
                  <Select style={{ width: 100 }} options={[
                    { value: 'string', label: 'string' },
                    { value: 'number', label: 'number' },
                    { value: 'date', label: 'date' },
                    { value: 'boolean', label: 'boolean' },
                    { value: 'json', label: 'json' },
                  ]} />
                </Form.Item>
                <Form.Item name="is_input" valuePropName="checked" initialValue={false}>
                  <Switch checkedChildren="输入" unCheckedChildren="输入" />
                </Form.Item>
                <Form.Item name="is_output" valuePropName="checked" initialValue={true}>
                  <Switch checkedChildren="输出" unCheckedChildren="输出" />
                </Form.Item>
                <Form.Item name="is_required" valuePropName="checked" initialValue={false}>
                  <Switch checkedChildren="必填" unCheckedChildren="必填" />
                </Form.Item>
                <Form.Item>
                  <Button type="primary" icon={<PlusOutlined />} onClick={handleAddProperty}>添加</Button>
                </Form.Item>
              </Form>
            </Card>

            {/* 操作管理 */}
            <Card size="small" title="操作列表"
              extra={<Text type="secondary">操作=可调用的API接口。点击详情可编辑操作并管理参数映射</Text>}>
              {actions.length === 0 ? (
                <Empty description="暂无操作" style={{ margin: '8px 0' }} />
              ) : (
                <Table dataSource={actions} rowKey="id" size="small" pagination={false} style={{ marginBottom: 12 }}
                  columns={[
                    { title: '编码', dataIndex: 'action_code', width: 130 },
                    { title: '名称', dataIndex: 'action_name', width: 100 },
                    { title: '方法', dataIndex: 'http_method', width: 65, render: (m: string) => <Tag color={m === 'GET' ? 'green' : 'blue'}>{m}</Tag> },
                    { title: 'API路径', dataIndex: 'api_path', width: 160, ellipsis: true },
                    { title: '分类', dataIndex: 'category', width: 80, render: (c: string) => c ? <Tag>{c}</Tag> : '—' },
                    {
                      title: '连接器', dataIndex: 'connector_id', width: 100,
                      render: (id: number) => {
                        if (!id) return <Text type="secondary">继承本体</Text>;
                        const c = connectors.find(c => c.id === id);
                        return c ? <Tag color="cyan">{c.name}</Tag> : <Text type="secondary">#{id}</Text>;
                      },
                    },
                    {
                      title: '', width: 100,
                      render: (_: unknown, record: ActionItem) => (
                        <Space size="small">
                          <Button size="small" type="link" icon={<EditOutlined />} onClick={() => openActionDetail(record)}>详情</Button>
                          <Popconfirm title="删除此操作及其所有参数?" okText="确认" cancelText="取消" onConfirm={() => handleDeleteAction(record.id)}>
                            <Button size="small" danger icon={<DeleteOutlined />} />
                          </Popconfirm>
                        </Space>
                      ),
                    },
                  ]}
                />
              )}
              <Divider plain style={{ margin: '8px 0' }}>添加操作</Divider>
              <Form form={actionForm} layout="inline" style={{ flexWrap: 'wrap', gap: 8 }}>
                <Form.Item name="action_code" rules={[{ required: true, message: '编码' }]}>
                  <Input placeholder="操作编码" style={{ width: 130 }} />
                </Form.Item>
                <Form.Item name="action_name" rules={[{ required: true, message: '名称' }]}>
                  <Input placeholder="操作名称" style={{ width: 110 }} />
                </Form.Item>
                <Form.Item name="http_method" initialValue="GET">
                  <Select style={{ width: 85 }} options={[
                    { value: 'GET', label: 'GET' },
                    { value: 'POST', label: 'POST' },
                    { value: 'PUT', label: 'PUT' },
                    { value: 'DELETE', label: 'DELETE' },
                  ]} />
                </Form.Item>
                <Form.Item name="api_path">
                  <Input placeholder="API路径" style={{ width: 160 }} />
                </Form.Item>
                <Form.Item name="connector_id">
                  <Select allowClear placeholder="连接器(可选)" style={{ width: 130 }}
                    options={connectors.map(c => ({ value: c.id, label: c.name }))} />
                </Form.Item>
                <Form.Item name="category">
                  <Input placeholder="分类(可选)" style={{ width: 100 }} />
                </Form.Item>
                <Form.Item>
                  <Button type="primary" icon={<PlusOutlined />} onClick={handleAddAction}>添加</Button>
                </Form.Item>
              </Form>
            </Card>
          </>
        )}
      </Modal>

      {/* 属性编辑 Modal */}
      <Modal
        title={`编辑属性 — ${editingProp?.name || ''}`}
        open={propEditOpen}
        onOk={handlePropEditSave}
        onCancel={() => { setPropEditOpen(false); setEditingProp(null); }}
        width={680}
        destroyOnClose
        okText="确认" cancelText="取消"
      >
        <Form form={propEditForm} layout="vertical" style={{ marginTop: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Form.Item name="title" label="标题(中文)">
              <Input placeholder="如: 产线名称" />
            </Form.Item>
            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end' }}>
              <Form.Item name="is_input" valuePropName="checked" label="输入"><Switch /></Form.Item>
              <Form.Item name="is_output" valuePropName="checked" label="输出"><Switch /></Form.Item>
              <Form.Item name="is_required" valuePropName="checked" label="必填"><Switch /></Form.Item>
            </div>
          </div>
          <Form.Item name="llm_description" label="LLM描述" tooltip="给大模型看的参数含义描述，帮助精确理解此字段">
            <Input.TextArea rows={2} placeholder="如: 生产线的唯一名称标识，通常格式为字母+数字组合如 25B1339-G" />
          </Form.Item>
          <Form.Item name="extract_expression" label="提取规则(express)" tooltip="正则表达式或规则，用于从用户消息中兜底提取此参数">
            <Input placeholder="如: (?P<line_name>[A-Z0-9]{2,}[-][A-Z0-9]+)" />
          </Form.Item>
          <Form.Item name="normalization_config" label="归一化配置(normalization)" tooltip="同义词映射、日期转换等归一化规则 (JSON)">
            <Input.TextArea rows={3} placeholder={'如: {"synonyms": {"一号线": "LINE-001"}, "domain": "order_status"}'} />
          </Form.Item>
          <Form.Item name="mapping_config" label="映射转换配置(mapping)" tooltip="参数值转换规则，如产线名称→产线ID，需调用业务接口 (JSON)">
            <Input.TextArea rows={3} placeholder={'如: {"lookup_entity": "production_line", "lookup_action": "list", "match_field": "line_name", "return_field": "line_code", "strategy": "semantic"}'} />
          </Form.Item>
          <Form.Item name="property_description" label="属性描述">
            <Input.TextArea rows={2} placeholder="一般描述，非LLM专用" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 操作详情/编辑 Modal */}
      <Modal
        title={<>{actionDetailData?.action_name || '操作详情'} — 编辑与参数管理</>}
        open={actionDetailOpen}
        onCancel={() => { setActionDetailOpen(false); setActionDetailData(null); setActionParams([]); }}
        footer={null}
        width={900}
        destroyOnClose
      >
        {actionDetailLoading ? <div style={{ textAlign: 'center', padding: 24 }}>加载中...</div> : (
          <Tabs items={[
            {
              key: 'basic',
              label: '基本信息',
              children: (
                <Form form={actionEditForm} layout="vertical" style={{ marginTop: 8 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <Form.Item name="action_code" label="操作编码" rules={[{ required: true }]}>
                      <Input placeholder="如 get_production_lines" />
                    </Form.Item>
                    <Form.Item name="action_name" label="操作名称" rules={[{ required: true }]}>
                      <Input placeholder="如 查询产线" />
                    </Form.Item>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
                    <Form.Item name="http_method" label="HTTP方法">
                      <Select options={[
                        { value: 'GET', label: 'GET' },
                        { value: 'POST', label: 'POST' },
                        { value: 'PUT', label: 'PUT' },
                        { value: 'DELETE', label: 'DELETE' },
                      ]} />
                    </Form.Item>
                    <Form.Item name="connector_id" label="连接器" tooltip="不选则继承本体的连接器">
                      <Select allowClear placeholder="继承本体连接器"
                        options={connectors.map(c => ({ value: c.id, label: c.name }))} />
                    </Form.Item>
                    <Form.Item name="category" label="分类">
                      <Input placeholder="如 生产管理" />
                    </Form.Item>
                  </div>
                  <Form.Item name="api_path" label="API路径" tooltip="连接器BaseURL之后的路径">
                    <Input placeholder="如 /api/production/lines" />
                  </Form.Item>
                  <Form.Item name="action_description" label="操作描述" tooltip="帮助AI理解此操作的用途">
                    <Input.TextArea rows={2} placeholder="描述此操作的业务用途" />
                  </Form.Item>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <Form.Item name="cache_ttl" label="缓存TTL(秒)" tooltip="0=不缓存">
                      <InputNumber min={0} style={{ width: '100%' }} placeholder="0" />
                    </Form.Item>
                  </div>
                  <Form.Item name="request_template" label="请求模板(JSON)" tooltip="请求体模板，用于POST/PUT方法">
                    <Input.TextArea rows={3} placeholder={'如: {"page": 1, "pageSize": 100}'} />
                  </Form.Item>
                  <Form.Item name="response_mapping" label="响应映射(JSON)" tooltip="将API响应字段映射到本体属性">
                    <Input.TextArea rows={3} placeholder={'如: {"items": "data.records", "name": "lineName"}'} />
                  </Form.Item>
                  <Form.Item name="mock_response" label="Mock响应(JSON)" tooltip="Mock模式下返回的模拟数据">
                    <Input.TextArea rows={3} placeholder={'如: {"code": 200, "data": [{"id":1, "name":"产线1"}]}'} />
                  </Form.Item>
                  <div style={{ textAlign: 'right' }}>
                    <Button type="primary" onClick={handleActionEditSave}>保存操作信息</Button>
                  </div>
                </Form>
              ),
            },
            {
              key: 'params',
              label: `参数映射 (${actionParams.length})`,
              children: (
                <div style={{ marginTop: 8 }}>
                  <Alert type="info" showIcon style={{ marginBottom: 12 }}
                    message="参数映射说明"
                    description="每个参数定义了操作的API调用参数。「API参数名」是实际发送到外部接口的字段名，「来源属性(source_property)」是本体属性中的语义字段名。引擎会自动将语义字段映射到API参数。"
                  />
                  {actionParams.length > 0 && (
                    <Table dataSource={actionParams} rowKey="id" size="small" pagination={false} style={{ marginBottom: 12 }}
                      columns={[
                        { title: 'API参数名', dataIndex: 'name', width: 120 },
                        {
                          title: <Tooltip title="本体属性中的语义字段名，引擎自动映射">来源属性 <InfoCircleOutlined style={{fontSize:11}} /></Tooltip>,
                          dataIndex: 'source_property', width: 120,
                          render: (v: string) => v ? <Tag color="purple">{v}</Tag> : <Text type="secondary">同名</Text>,
                        },
                        { title: '标题', dataIndex: 'title', width: 80 },
                        { title: '类型', dataIndex: 'type', width: 70, render: (t: string) => <Tag>{t}</Tag> },
                        { title: '方向', dataIndex: 'direction', width: 60, render: (d: string) => <Tag color={d === 'input' ? 'blue' : 'green'}>{d === 'input' ? '输入' : '输出'}</Tag> },
                        { title: '必填', dataIndex: 'is_required', width: 50, align: 'center' as const, render: (v: boolean) => v ? <Tag color="red">是</Tag> : '—' },
                        {
                          title: '', width: 50,
                          render: (_: unknown, record: ActionParameterItem) => (
                            <Popconfirm title="删除此参数?" okText="确认" cancelText="取消" onConfirm={() => handleDeleteActionParam(record.id)}>
                              <Button size="small" danger icon={<DeleteOutlined />} />
                            </Popconfirm>
                          ),
                        },
                      ]}
                    />
                  )}
                  <Divider plain style={{ margin: '8px 0' }}>添加参数</Divider>
                  <Form form={actionParamForm} layout="inline" style={{ flexWrap: 'wrap', gap: 8 }}>
                    <Form.Item name="name" rules={[{ required: true, message: 'API参数名' }]}>
                      <Input placeholder="API参数名" style={{ width: 110 }} />
                    </Form.Item>
                    <Form.Item name="source_property">
                      <Input placeholder="来源属性(可选)" style={{ width: 120 }} />
                    </Form.Item>
                    <Form.Item name="title">
                      <Input placeholder="标题" style={{ width: 80 }} />
                    </Form.Item>
                    <Form.Item name="type" initialValue="string" rules={[{ required: true }]}>
                      <Select style={{ width: 90 }} options={[
                        { value: 'string', label: 'string' },
                        { value: 'number', label: 'number' },
                        { value: 'date', label: 'date' },
                        { value: 'boolean', label: 'boolean' },
                        { value: 'json', label: 'json' },
                      ]} />
                    </Form.Item>
                    <Form.Item name="direction" initialValue="input">
                      <Select style={{ width: 80 }} options={[
                        { value: 'input', label: '输入' },
                        { value: 'output', label: '输出' },
                      ]} />
                    </Form.Item>
                    <Form.Item name="is_required" valuePropName="checked" initialValue={false}>
                      <Switch checkedChildren="必填" unCheckedChildren="可选" />
                    </Form.Item>
                    <Form.Item>
                      <Button type="primary" icon={<PlusOutlined />} onClick={handleAddActionParam}>添加</Button>
                    </Form.Item>
                  </Form>
                </div>
              ),
            },
          ]} />
        )}
      </Modal>
    </>
  );
}
