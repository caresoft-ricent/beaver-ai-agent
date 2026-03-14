import { useEffect, useState } from 'react';
import { Table, Button, Modal, Form, Input, Select, Switch, message, Space, Tag, Popconfirm } from 'antd';
import { PlusOutlined, PlayCircleOutlined } from '@ant-design/icons';
import { getConnectors, createConnector, updateConnector, deleteConnector, testConnector } from '../api/admin';

interface Connector {
  id: number;
  tenant_id: number;
  name: string;
  type: string;
  base_url: string;
  auth_type: string;
  mock_enabled: string;
  status: string;
}

export default function ConnectorList() {
  const [data, setData] = useState<Connector[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      const res = await getConnectors();
      setData(res.data.data?.items || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleSubmit = async () => {
    const values = await form.validateFields();
    // 将 auth header/key 组装成 auth_config
    const { auth_header_name, auth_key_value, mock_switch, ...rest } = values;
    rest.mock_enabled = mock_switch ? '1' : '0';
    if (auth_header_name || auth_key_value) {
      rest.auth_config = {
        header_name: auth_header_name || 'Authorization',
        key_value: auth_key_value || '',
      };
    }
    if (editingId) {
      await updateConnector(editingId, rest);
      message.success('更新成功');
    } else {
      await createConnector(rest);
      message.success('创建成功');
    }
    setModalOpen(false);
    form.resetFields();
    setEditingId(null);
    load();
  };

  const handleEdit = (record: Connector) => {
    setEditingId(record.id);
    const formData: Record<string, unknown> = { ...record, mock_switch: record.mock_enabled === '1' };
    // 解析 auth_config 到表单字段
    const authConfig = (record as Record<string, unknown>).auth_config as Record<string, string> | undefined;
    if (authConfig) {
      formData.auth_header_name = authConfig.header_name;
      formData.auth_key_value = authConfig.key_value;
    }
    form.setFieldsValue(formData);
    setModalOpen(true);
  };

  const handleTest = async (id: number) => {
    try {
      const res = await testConnector(id);
      const d = res.data.data;
      if (d?.mock) {
        message.info(d.message || 'Mock模式');
      } else if (d?.reachable) {
        message.success(`连接成功 (${d.response_time_ms}ms)`);
      } else {
        message.warning('连接失败: ' + (d?.error || '未知错误'));
      }
    } catch {
      message.error('连接测试出错');
    }
  };

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>连接器管理</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditingId(null); form.resetFields(); setModalOpen(true); }}>
          新建连接器
        </Button>
      </div>

      <Table dataSource={data} rowKey="id" loading={loading} columns={[
        { title: '名称', dataIndex: 'name' },
        { title: '类型', dataIndex: 'type', render: (t: string) => <Tag color="blue">{t === 'beaver_cloud' ? '河狸云' : t}</Tag> },
        { title: 'Base URL', dataIndex: 'base_url', ellipsis: true },
        { title: '认证', dataIndex: 'auth_type' },
        {
          title: 'Mock', dataIndex: 'mock_enabled',
          render: (v: string) => v === '1' ? <Tag color="orange">Mock</Tag> : <Tag color="green">真实</Tag>,
        },
        { title: '状态', dataIndex: 'status', render: (s: string) => <Tag color={s === 'active' ? 'green' : 'default'}>{s}</Tag> },
        {
          title: '操作', render: (_: unknown, record: Connector) => (
            <Space>
              <Button size="small" icon={<PlayCircleOutlined />} onClick={() => handleTest(record.id)}>测试</Button>
              <Button size="small" onClick={() => handleEdit(record)}>编辑</Button>
              <Popconfirm title="确认删除?" onConfirm={() => deleteConnector(record.id).then(load)}>
                <Button size="small" danger>删除</Button>
              </Popconfirm>
            </Space>
          ),
        },
      ]} />

      <Modal title={editingId ? '编辑连接器' : '新建连接器'} open={modalOpen} onOk={handleSubmit} onCancel={() => setModalOpen(false)} width={640}>
        <Form form={form} layout="vertical" initialValues={{ type: 'beaver_cloud', auth_type: 'api_key', tenant_id: 1, mock_switch: false }}>
          <Form.Item name="tenant_id" label="租户ID" rules={[{ required: true }]}>
            <Input type="number" />
          </Form.Item>
          <Form.Item name="name" label="名称" rules={[{ required: true }]}>
            <Input placeholder="如: 河狸云生产环境" />
          </Form.Item>
          <Form.Item name="type" label="类型" rules={[{ required: true }]}>
            <Select options={[{ value: 'beaver_cloud', label: '河狸云' }, { value: 'custom_api', label: '自定义API' }]} />
          </Form.Item>
          <Form.Item name="base_url" label="API Base URL" rules={[{ required: true }]}>
            <Input placeholder="https://openapi.beavercloud.com/v1" />
          </Form.Item>
          <Form.Item name="auth_type" label="认证方式">
            <Select options={[
              { value: 'api_key', label: 'API Key' },
              { value: 'oauth2', label: 'OAuth2' },
              { value: 'jwt_pass', label: 'JWT Token' },
            ]} />
          </Form.Item>
          <Form.Item name="auth_header_name" label="认证 Header 名">
            <Input placeholder="Authorization" />
          </Form.Item>
          <Form.Item name="auth_key_value" label="认证 Key / Token">
            <Input.Password placeholder="Bearer your-api-key-here" />
          </Form.Item>
          <Form.Item name="health_check_path" label="健康检查路径">
            <Input placeholder="health（可选，用于连接测试）" />
          </Form.Item>
          <Form.Item name="mock_switch" label="启用 Mock 模式" valuePropName="checked">
            <Switch checkedChildren="Mock" unCheckedChildren="真实" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
