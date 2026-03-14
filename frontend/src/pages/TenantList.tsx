import { useEffect, useState, useMemo } from 'react';
import { Table, Button, Modal, Form, Input, Switch, message, Space, Tag, Popconfirm } from 'antd';
import { PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { getTenants, createTenant, updateTenant, deleteTenant } from '../api/admin';

interface Tenant {
  id: number;
  name: string;
  code: string;
  description?: string;
  status: string;
  created_at: string;
}

export default function TenantList() {
  const [data, setData] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form] = Form.useForm();
  const [searchText, setSearchText] = useState('');

  const filteredData = useMemo(() => {
    if (!searchText) return data;
    const s = searchText.toLowerCase();
    return data.filter(r => r.name?.toLowerCase().includes(s) || r.code?.toLowerCase().includes(s) || r.description?.toLowerCase().includes(s));
  }, [data, searchText]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await getTenants();
      setData(res.data.data?.items || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleSubmit = async () => {
    const values = await form.validateFields();
    const { _status_switch, ...rest } = values;
    rest.status = _status_switch ? 'active' : 'inactive';
    if (editingId) {
      await updateTenant(editingId, rest);
      message.success('更新成功');
    } else {
      await createTenant(rest);
      message.success('创建成功');
    }
    setModalOpen(false);
    form.resetFields();
    setEditingId(null);
    load();
  };

  const handleEdit = (record: Tenant) => {
    setEditingId(record.id);
    form.setFieldsValue({ ...record, _status_switch: record.status === 'active' });
    setModalOpen(true);
  };

  const handleDelete = async (id: number) => {
    await deleteTenant(id);
    message.success('删除成功');
    load();
  };

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>租户管理</h2>
        <Space>
          <Input placeholder="搜索名称/编码" prefix={<SearchOutlined />} allowClear style={{ width: 200 }}
            value={searchText} onChange={e => setSearchText(e.target.value)} />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditingId(null); form.resetFields(); setModalOpen(true); }}>
            新建租户
          </Button>
        </Space>
      </div>

      <Table dataSource={filteredData} rowKey="id" loading={loading} columns={[
        { title: '名称', dataIndex: 'name' },
        { title: '编码', dataIndex: 'code' },
        { title: '描述', dataIndex: 'description' },
        {
          title: '状态', dataIndex: 'status',
          render: (s: string, record: Tenant) => (
            <Switch checked={s === 'active'} checkedChildren="启用" unCheckedChildren="停用"
              onChange={async (checked) => {
                await updateTenant(record.id, { status: checked ? 'active' : 'inactive' });
                message.success(checked ? '已启用' : '已停用');
                load();
              }}
            />
          ),
        },
        { title: '创建时间', dataIndex: 'created_at' },
        {
          title: '操作', render: (_: unknown, record: Tenant) => (
            <Space>
              <Button size="small" onClick={() => handleEdit(record)}>编辑</Button>
              <Popconfirm title="确认删除?" okText="确认" cancelText="取消" onConfirm={() => handleDelete(record.id)}>
                <Button size="small" danger>删除</Button>
              </Popconfirm>
            </Space>
          ),
        },
      ]} />

      <Modal title={editingId ? '编辑租户' : '新建租户'} open={modalOpen} onOk={handleSubmit} onCancel={() => setModalOpen(false)}
        okText="确认" cancelText="取消">
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="code" label="编码" rules={[{ required: true }]}>
            <Input disabled={!!editingId} />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea />
          </Form.Item>
          <Form.Item name="_status_switch" label="状态" valuePropName="checked" initialValue={true}>
            <Switch checkedChildren="启用" unCheckedChildren="停用" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
