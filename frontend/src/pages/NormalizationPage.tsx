import { useState, useEffect, useCallback } from 'react';
import { Table, Button, Space, Modal, Form, Input, Select, Switch, message, Tabs, Popconfirm, Tag, Card } from 'antd';
import { PlusOutlined, DatabaseOutlined } from '@ant-design/icons';
import {
  getNormalizationRules,
  createNormalizationRule,
  updateNormalizationRule,
  deleteNormalizationRule,
  initNormalizationRules,
} from '../api/admin';

const CATEGORY_OPTIONS = [
  { value: 'date_phrase', label: '日期短语归一化', color: 'blue' },
  { value: 'status_mapping', label: '状态枚举映射', color: 'green' },
  { value: 'param_converter', label: '参数转换器', color: 'purple' },
];

const categoryLabel = (cat: string) => CATEGORY_OPTIONS.find(c => c.value === cat)?.label || cat;
const categoryColor = (cat: string) => CATEGORY_OPTIONS.find(c => c.value === cat)?.color || 'default';

interface Rule {
  id: number;
  tenant_id: number;
  category: string;
  rule_code: string;
  rule_name: string;
  pattern?: string;
  domain?: string;
  source_value?: string;
  target_value?: string;
  config?: Record<string, unknown>;
  sort_order: number;
  is_active: boolean;
  description?: string;
  created_at?: string;
  updated_at?: string;
}

export default function NormalizationPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [category, setCategory] = useState<string>('date_phrase');
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Rule | null>(null);
  const [form] = Form.useForm();

  const fetchRules = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getNormalizationRules({ category, page, size: 50 });
      const d = res.data?.data;
      setRules(d?.items || []);
      setTotal(d?.total || 0);
    } finally {
      setLoading(false);
    }
  }, [category, page]);

  useEffect(() => { fetchRules(); }, [fetchRules]);

  const handleSave = async () => {
    const values = await form.validateFields();
    if (values.config && typeof values.config === 'string') {
      try { values.config = JSON.parse(values.config); } catch { message.error('config 格式错误'); return; }
    }
    if (editing) {
      await updateNormalizationRule(editing.id, values);
      message.success('更新成功');
    } else {
      values.category = category;
      await createNormalizationRule(values);
      message.success('创建成功');
    }
    setModalOpen(false);
    form.resetFields();
    setEditing(null);
    fetchRules();
  };

  const handleDelete = async (id: number) => {
    await deleteNormalizationRule(id);
    message.success('已删除');
    fetchRules();
  };

  const handleInit = async () => {
    const res = await initNormalizationRules(0);
    message.success(res.data?.message || '初始化完成');
    fetchRules();
  };

  const openEdit = (record: Rule) => {
    setEditing(record);
    form.setFieldsValue({
      ...record,
      config: record.config ? JSON.stringify(record.config, null, 2) : '',
    });
    setModalOpen(true);
  };

  const openAdd = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ category, is_active: true, sort_order: 0 });
    setModalOpen(true);
  };

  const dateColumns = [
    { title: '编码', dataIndex: 'rule_code', width: 140 },
    { title: '名称', dataIndex: 'rule_name', width: 160 },
    { title: '匹配正则', dataIndex: 'pattern', ellipsis: true },
    { title: '说明', dataIndex: 'description', width: 200, ellipsis: true },
    { title: '排序', dataIndex: 'sort_order', width: 70 },
    { title: '启用', dataIndex: 'is_active', width: 70, render: (v: boolean) => v ? <Tag color="green">是</Tag> : <Tag>否</Tag> },
    {
      title: '操作', width: 130,
      render: (_: unknown, record: Rule) => (
        <Space size="small">
          <Button type="link" size="small" onClick={() => openEdit(record)}>编辑</Button>
          <Popconfirm title="确认删除？" okText="确认" cancelText="取消" onConfirm={() => handleDelete(record.id)}>
            <Button type="link" size="small" danger>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const statusColumns = [
    { title: '编码', dataIndex: 'rule_code', width: 140 },
    { title: '名称', dataIndex: 'rule_name', width: 140 },
    { title: '业务域', dataIndex: 'domain', width: 120, render: (v: string) => <Tag>{v}</Tag> },
    { title: '中文值', dataIndex: 'source_value', width: 100 },
    { title: '标准值', dataIndex: 'target_value', width: 100 },
    { title: '排序', dataIndex: 'sort_order', width: 70 },
    { title: '启用', dataIndex: 'is_active', width: 70, render: (v: boolean) => v ? <Tag color="green">是</Tag> : <Tag>否</Tag> },
    {
      title: '操作', width: 130,
      render: (_: unknown, record: Rule) => (
        <Space size="small">
          <Button type="link" size="small" onClick={() => openEdit(record)}>编辑</Button>
          <Popconfirm title="确认删除？" okText="确认" cancelText="取消" onConfirm={() => handleDelete(record.id)}>
            <Button type="link" size="small" danger>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const converterColumns = [
    { title: '编码', dataIndex: 'rule_code', width: 140 },
    { title: '名称', dataIndex: 'rule_name', width: 160 },
    { title: '配置', dataIndex: 'config', ellipsis: true, render: (v: unknown) => v ? JSON.stringify(v) : '-' },
    { title: '说明', dataIndex: 'description', width: 200, ellipsis: true },
    { title: '排序', dataIndex: 'sort_order', width: 70 },
    { title: '启用', dataIndex: 'is_active', width: 70, render: (v: boolean) => v ? <Tag color="green">是</Tag> : <Tag>否</Tag> },
    {
      title: '操作', width: 130,
      render: (_: unknown, record: Rule) => (
        <Space size="small">
          <Button type="link" size="small" onClick={() => openEdit(record)}>编辑</Button>
          <Popconfirm title="确认删除？" okText="确认" cancelText="取消" onConfirm={() => handleDelete(record.id)}>
            <Button type="link" size="small" danger>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const columnsMap: Record<string, typeof dateColumns> = {
    date_phrase: dateColumns,
    status_mapping: statusColumns,
    param_converter: converterColumns,
  };

  return (
    <div>
      <Card
        title="归一化规则管理"
        extra={
          <Space>
            <Button icon={<DatabaseOutlined />} onClick={handleInit}>初始化默认规则</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>新增规则</Button>
          </Space>
        }
      >
        <Tabs
          activeKey={category}
          onChange={(k) => { setCategory(k); setPage(1); }}
          items={CATEGORY_OPTIONS.map(c => ({
            key: c.value,
            label: <span><Tag color={c.color}>{c.label}</Tag></span>,
          }))}
        />
        <Table
          rowKey="id"
          loading={loading}
          columns={columnsMap[category] || dateColumns}
          dataSource={rules}
          size="small"
          pagination={{ current: page, total, pageSize: 50, onChange: setPage, showTotal: (t) => `共 ${t} 条` }}
        />
      </Card>

      <Modal
        title={editing ? '编辑规则' : '新增规则'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => { setModalOpen(false); setEditing(null); form.resetFields(); }}
        destroyOnClose
        width={600}
        okText="确认" cancelText="取消"
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="category" label="类别" hidden={!editing}>
            <Select options={CATEGORY_OPTIONS} disabled />
          </Form.Item>
          <Form.Item name="rule_code" label="规则编码" rules={[{ required: true }]}>
            <Input placeholder="如: today, order_pending" disabled={!!editing} />
          </Form.Item>
          <Form.Item name="rule_name" label="规则名称" rules={[{ required: true }]}>
            <Input placeholder="如: 今天/今日" />
          </Form.Item>

          {category === 'date_phrase' && (
            <Form.Item name="pattern" label="匹配正则" rules={[{ required: true }]}>
              <Input placeholder="如: 今天|今日" />
            </Form.Item>
          )}

          {category === 'status_mapping' && (
            <>
              <Form.Item name="domain" label="业务域" rules={[{ required: true }]}>
                <Select placeholder="选择业务域" options={[
                  { value: 'order_status', label: '工单状态' },
                  { value: 'bill_status', label: '账单状态' },
                  { value: 'ticket_status', label: '工单/问题状态' },
                ]} />
              </Form.Item>
              <Form.Item name="source_value" label="中文值(原值)" rules={[{ required: true }]}>
                <Input placeholder="如: 未完成" />
              </Form.Item>
              <Form.Item name="target_value" label="标准值(映射后)" rules={[{ required: true }]}>
                <Input placeholder="如: pending" />
              </Form.Item>
            </>
          )}

          {category === 'param_converter' && (
            <Form.Item name="config" label="转换配置(JSON)">
              <Input.TextArea rows={4} placeholder='{"source": "line_name", "target": "line_id", ...}' />
            </Form.Item>
          )}

          <Form.Item name="sort_order" label="排序">
            <Input type="number" />
          </Form.Item>
          <Form.Item name="is_active" label="启用" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="description" label="说明">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
