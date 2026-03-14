import { useEffect, useState, useCallback } from 'react';
import {
  Table, Button, Modal, Form, Input, Select, message, Space, Tag, Popconfirm,
  Alert, Card, Descriptions, Collapse, InputNumber, Typography, Divider, Empty,
  Switch,
} from 'antd';
import {
  PlusOutlined, SendOutlined, DeleteOutlined, InfoCircleOutlined,
  ApiOutlined, DatabaseOutlined, ExperimentOutlined, SettingOutlined,
} from '@ant-design/icons';
import {
  getEntities, getEntity, createEntity, updateEntity, deleteEntity, publishEntity,
  getConnectors, createAction, deleteAction, createEntityProperty, deleteEntityProperty,
} from '../api/admin';

const { Text } = Typography;

interface Entity {
  id: number;
  tenant_id: number;
  entity_code: string;
  entity_name: string;
  entity_mode: string;
  entity_description?: string;
  connector_id?: number;
  status: string;
  version: number;
}

interface ConnectorItem { id: number; name: string; }
interface PropertyItem { id: number; entity_id: number; name: string; title?: string; type: string; is_input: boolean; is_output: boolean; is_required: boolean; }
interface ActionItem { id: number; entity_id: number; action_code: string; action_name: string; http_method: string; api_path?: string; }

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

  // Detail panel state
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailEntity, setDetailEntity] = useState<Entity | null>(null);
  const [properties, setProperties] = useState<PropertyItem[]>([]);
  const [actions, setActions] = useState<ActionItem[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  // Sub-forms
  const [propForm] = Form.useForm();
  const [actionForm] = Form.useForm();

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

  const handleSubmit = async () => {
    const values = await form.validateFields();
    if (editingId) {
      await updateEntity(editingId, values);
      message.success('更新成功');
    } else {
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

  const handleAddAction = async () => {
    if (!detailEntity) return;
    const values = await actionForm.validateFields();
    await createAction(detailEntity.id, { ...values, entity_id: detailEntity.id });
    message.success('操作已添加');
    actionForm.resetFields();
    openDetail(detailEntity);
  };

  const handleDeleteAction = async (actionId: number) => {
    await deleteAction(actionId);
    message.success('已删除');
    if (detailEntity) openDetail(detailEntity);
  };

  const columns = [
    { title: '编码', dataIndex: 'entity_code', width: 160 },
    { title: '名称', dataIndex: 'entity_name', width: 120 },
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
      title: '状态', dataIndex: 'status', width: 80,
      render: (s: string) => <Tag color={s === 'published' ? 'green' : 'orange'}>{s === 'published' ? '已发布' : '草稿'}</Tag>,
    },
    {
      title: '操作', width: 300,
      render: (_: unknown, record: Entity) => (
        <Space>
          <Button size="small" icon={<SettingOutlined />} onClick={() => openDetail(record)}>属性/操作</Button>
          {record.status === 'draft' && (
            <Button size="small" type="primary" icon={<SendOutlined />} onClick={() => handlePublish(record.id)}>发布</Button>
          )}
          <Button size="small" onClick={() => { setEditingId(record.id); form.setFieldsValue(record); setModalOpen(true); }}>编辑</Button>
          <Popconfirm title="确认删除? 将同时删除所有属性和操作" onConfirm={() => deleteEntity(record.id).then(load)}>
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

      <Table dataSource={data} rowKey="id" loading={loading} columns={columns}
        expandable={{
          expandedRowRender: (record: Entity) => (
            <Descriptions size="small" column={2} bordered>
              <Descriptions.Item label="描述" span={2}>{record.entity_description || '—'}</Descriptions.Item>
            </Descriptions>
          ),
        }}
      />

      {/* 新建/编辑本体 Modal */}
      <Modal title={editingId ? '编辑本体' : '新建本体'} open={modalOpen} onOk={handleSubmit} onCancel={() => setModalOpen(false)} width={600} destroyOnClose>
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
                      title: '', width: 50,
                      render: (_: unknown, record: PropertyItem) => (
                        <Popconfirm title="删除此属性?" onConfirm={() => handleDeleteProperty(record.id)}>
                          <Button size="small" danger icon={<DeleteOutlined />} />
                        </Popconfirm>
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
                <Form.Item>
                  <Button type="primary" icon={<PlusOutlined />} onClick={handleAddProperty}>添加</Button>
                </Form.Item>
              </Form>
            </Card>

            {/* 操作管理 */}
            <Card size="small" title="操作列表"
              extra={<Text type="secondary">操作=可调用的API接口，技能工具链会引用这些操作</Text>}>
              {actions.length === 0 ? (
                <Empty description="暂无操作" style={{ margin: '8px 0' }} />
              ) : (
                <Table dataSource={actions} rowKey="id" size="small" pagination={false} style={{ marginBottom: 12 }}
                  columns={[
                    { title: '编码', dataIndex: 'action_code', width: 160 },
                    { title: '名称', dataIndex: 'action_name', width: 120 },
                    { title: '方法', dataIndex: 'http_method', width: 70, render: (m: string) => <Tag color={m === 'GET' ? 'green' : 'blue'}>{m}</Tag> },
                    { title: 'API路径', dataIndex: 'api_path', ellipsis: true },
                    {
                      title: '', width: 50,
                      render: (_: unknown, record: ActionItem) => (
                        <Popconfirm title="删除此操作?" onConfirm={() => handleDeleteAction(record.id)}>
                          <Button size="small" danger icon={<DeleteOutlined />} />
                        </Popconfirm>
                      ),
                    },
                  ]}
                />
              )}
              <Divider plain style={{ margin: '8px 0' }}>添加操作</Divider>
              <Form form={actionForm} layout="inline" style={{ flexWrap: 'wrap', gap: 8 }}>
                <Form.Item name="action_code" rules={[{ required: true, message: '编码' }]}>
                  <Input placeholder="操作编码" style={{ width: 140 }} />
                </Form.Item>
                <Form.Item name="action_name" rules={[{ required: true, message: '名称' }]}>
                  <Input placeholder="操作名称" style={{ width: 120 }} />
                </Form.Item>
                <Form.Item name="http_method" initialValue="GET">
                  <Select style={{ width: 90 }} options={[
                    { value: 'GET', label: 'GET' },
                    { value: 'POST', label: 'POST' },
                    { value: 'PUT', label: 'PUT' },
                  ]} />
                </Form.Item>
                <Form.Item name="api_path">
                  <Input placeholder="API路径" style={{ width: 180 }} />
                </Form.Item>
                <Form.Item>
                  <Button type="primary" icon={<PlusOutlined />} onClick={handleAddAction}>添加</Button>
                </Form.Item>
              </Form>
            </Card>
          </>
        )}
      </Modal>
    </>
  );
}
