import { useEffect, useState } from 'react';
import { Table, Button, Modal, Form, Input, Select, message, Space, Tag, Popconfirm } from 'antd';
import { PlusOutlined, PlayCircleOutlined } from '@ant-design/icons';
import { getConnectors, createConnector, updateConnector, deleteConnector, testConnector } from '../api/admin';

interface Connector {
  id: number;
  tenant_id: number;
  name: string;
  type: string;
  base_url: string;
  auth_type: string;
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
    if (editingId) {
      await updateConnector(editingId, values);
      message.success('更新成功');
    } else {
      await createConnector(values);
      message.success('创建成功');
    }
    setModalOpen(false);
    form.resetFields();
    setEditingId(null);
    load();
  };

  const handleTest = async (id: number) => {
    try {
      const res = await testConnector(id);
      if (res.data.data?.reachable) {
        message.success('连接测试成功');
      } else {
        message.warning('连接测试失败: ' + (res.data.data?.error || '未知错误'));
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
        { title: '类型', dataIndex: 'type', render: (t: string) => <Tag>{t}</Tag> },
        { title: 'Base URL', dataIndex: 'base_url' },
        { title: '认证方式', dataIndex: 'auth_type' },
        { title: '状态', dataIndex: 'status', render: (s: string) => <Tag color={s === 'active' ? 'green' : 'default'}>{s}</Tag> },
        {
          title: '操作', render: (_: unknown, record: Connector) => (
            <Space>
              <Button size="small" icon={<PlayCircleOutlined />} onClick={() => handleTest(record.id)}>测试</Button>
              <Button size="small" onClick={() => { setEditingId(record.id); form.setFieldsValue(record); setModalOpen(true); }}>编辑</Button>
              <Popconfirm title="确认删除?" onConfirm={() => deleteConnector(record.id).then(load)}>
                <Button size="small" danger>删除</Button>
              </Popconfirm>
            </Space>
          ),
        },
      ]} />

      <Modal title={editingId ? '编辑连接器' : '新建连接器'} open={modalOpen} onOk={handleSubmit} onCancel={() => setModalOpen(false)} width={600}>
        <Form form={form} layout="vertical" initialValues={{ type: 'beaver_cloud', auth_type: 'api_key', tenant_id: 1 }}>
          <Form.Item name="tenant_id" label="租户ID" rules={[{ required: true }]}>
            <Input type="number" />
          </Form.Item>
          <Form.Item name="name" label="名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="type" label="类型" rules={[{ required: true }]}>
            <Select options={[{ value: 'beaver_cloud', label: '河狸云' }, { value: 'custom_api', label: '自定义API' }]} />
          </Form.Item>
          <Form.Item name="base_url" label="Base URL" rules={[{ required: true }]}>
            <Input placeholder="https://api.example.com/v1" />
          </Form.Item>
          <Form.Item name="auth_type" label="认证方式">
            <Select options={[
              { value: 'api_key', label: 'API Key' },
              { value: 'oauth2', label: 'OAuth2' },
              { value: 'jwt_pass', label: 'JWT Password' },
            ]} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
