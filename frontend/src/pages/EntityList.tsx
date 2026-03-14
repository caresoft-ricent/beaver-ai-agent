import { useEffect, useState } from 'react';
import { Table, Button, Modal, Form, Input, Select, message, Space, Tag, Popconfirm } from 'antd';
import { PlusOutlined, SendOutlined } from '@ant-design/icons';
import { getEntities, createEntity, updateEntity, deleteEntity, publishEntity } from '../api/admin';

interface Entity {
  id: number;
  tenant_id: number;
  entity_code: string;
  entity_name: string;
  entity_mode: string;
  entity_description?: string;
  status: string;
  version: number;
}

export default function EntityList() {
  const [data, setData] = useState<Entity[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      const res = await getEntities();
      setData(res.data.data?.items || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

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

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>业务本体管理</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditingId(null); form.resetFields(); setModalOpen(true); }}>
          新建本体
        </Button>
      </div>

      <Table dataSource={data} rowKey="id" loading={loading} columns={[
        { title: '编码', dataIndex: 'entity_code' },
        { title: '名称', dataIndex: 'entity_name' },
        { title: '调用方式', dataIndex: 'entity_mode', render: (m: string) => <Tag>{m}</Tag> },
        { title: '版本', dataIndex: 'version' },
        { title: '状态', dataIndex: 'status', render: (s: string) => <Tag color={s === 'published' ? 'green' : 'orange'}>{s}</Tag> },
        {
          title: '操作', render: (_: unknown, record: Entity) => (
            <Space>
              {record.status === 'draft' && (
                <Button size="small" type="primary" icon={<SendOutlined />} onClick={() => handlePublish(record.id)}>发布</Button>
              )}
              <Button size="small" onClick={() => { setEditingId(record.id); form.setFieldsValue(record); setModalOpen(true); }}>编辑</Button>
              <Popconfirm title="确认删除?" onConfirm={() => deleteEntity(record.id).then(load)}>
                <Button size="small" danger>删除</Button>
              </Popconfirm>
            </Space>
          ),
        },
      ]} />

      <Modal title={editingId ? '编辑本体' : '新建本体'} open={modalOpen} onOk={handleSubmit} onCancel={() => setModalOpen(false)} width={600}>
        <Form form={form} layout="vertical" initialValues={{ entity_mode: 'api', tenant_id: 1 }}>
          <Form.Item name="tenant_id" label="租户ID" rules={[{ required: true }]}>
            <Input type="number" />
          </Form.Item>
          <Form.Item name="entity_code" label="编码" rules={[{ required: true }]}>
            <Input placeholder="如 production_line" disabled={!!editingId} />
          </Form.Item>
          <Form.Item name="entity_name" label="名称" rules={[{ required: true }]}>
            <Input placeholder="如 产线" />
          </Form.Item>
          <Form.Item name="entity_mode" label="调用方式">
            <Select options={[
              { value: 'api', label: 'API调用' },
              { value: 'database', label: '数据库查询' },
              { value: 'mock', label: 'Mock数据' },
            ]} />
          </Form.Item>
          <Form.Item name="entity_description" label="描述">
            <Input.TextArea />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
