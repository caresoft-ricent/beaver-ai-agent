import { useState, useEffect, useCallback } from 'react';
import {
  Table, Button, Modal, Form, Input, Select, Space, Tag, Card, message,
  Descriptions, Switch, Popconfirm, Typography, Badge,
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, EyeOutlined,
  RocketOutlined, SearchOutlined, AppstoreOutlined,
} from '@ant-design/icons';
import {
  getDomains, createDomain, updateDomain, deleteDomain, publishDomain, getDomain,
} from '../api/admin';

const { Text } = Typography;

interface DomainItem {
  id: number;
  tenant_id: number;
  code: string;
  name: string;
  description?: string;
  version: number;
  status: string;
  generated_by: string;
  confidence: number;
  default_risk_level: string;
  requires_scope_check: boolean;
  response_style: string;
  entity_count?: number;
  action_count?: number;
  created_at?: string;
  updated_at?: string;
}

interface DomainDetail extends DomainItem {
  entities?: { id: number; entity_code: string; entity_name: string; status: string }[];
  actions?: { id: number; action_code: string; action_name: string; action_type: string }[];
}

const statusColors: Record<string, string> = {
  draft: 'default', reviewed: 'processing', published: 'success', deprecated: 'warning',
};
const riskColors: Record<string, string> = { low: 'green', medium: 'orange', high: 'red' };

export default function DomainList() {
  const [data, setData] = useState<DomainItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [editing, setEditing] = useState<DomainItem | null>(null);
  const [detail, setDetail] = useState<DomainDetail | null>(null);
  const [form] = Form.useForm();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getDomains({ tenant_id: 1, keyword: keyword || undefined, status: statusFilter, page, page_size: 20 });
      setData(res.data.data.items);
      setTotal(res.data.data.total);
    } catch { message.error('加载失败'); }
    setLoading(false);
  }, [page, keyword, statusFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ default_risk_level: 'low', response_style: 'mixed', requires_scope_check: true });
    setEditModalOpen(true);
  };

  const openEdit = (record: DomainItem) => {
    setEditing(record);
    form.setFieldsValue(record);
    setEditModalOpen(true);
  };

  const openDetail = async (id: number) => {
    try {
      const res = await getDomain(id);
      setDetail(res.data.data);
      setDetailModalOpen(true);
    } catch { message.error('加载详情失败'); }
  };

  const handleSave = async () => {
    const values = await form.validateFields();
    try {
      if (editing) {
        await updateDomain(editing.id, values);
        message.success('更新成功');
      } else {
        await createDomain({ ...values, tenant_id: 1 });
        message.success('创建成功');
      }
      setEditModalOpen(false);
      fetchData();
    } catch (e: any) {
      message.error(e?.response?.data?.detail || '操作失败');
    }
  };

  const handleDelete = async (id: number) => {
    await deleteDomain(id);
    message.success('删除成功');
    fetchData();
  };

  const handlePublish = async (id: number) => {
    await publishDomain(id);
    message.success('发布成功');
    fetchData();
  };

  const columns = [
    {
      title: '域编码', dataIndex: 'code', width: 140,
      render: (v: string) => <Text code>{v}</Text>,
    },
    { title: '域名称', dataIndex: 'name', width: 160 },
    {
      title: '状态', dataIndex: 'status', width: 100,
      render: (v: string) => <Tag color={statusColors[v]}>{v}</Tag>,
    },
    {
      title: '风险等级', dataIndex: 'default_risk_level', width: 100,
      render: (v: string) => <Tag color={riskColors[v]}>{v}</Tag>,
    },
    {
      title: '输出风格', dataIndex: 'response_style', width: 100,
      render: (v: string) => <Tag>{v}</Tag>,
    },
    { title: '版本', dataIndex: 'version', width: 60, align: 'center' as const },
    {
      title: '实体/操作', width: 100, align: 'center' as const,
      render: (_: unknown, r: DomainItem) => (
        <Space size={4}>
          <Badge count={r.entity_count || 0} showZero color="#1677ff" overflowCount={99} />
          <Text type="secondary">/</Text>
          <Badge count={r.action_count || 0} showZero color="#52c41a" overflowCount={99} />
        </Space>
      ),
    },
    {
      title: '操作', width: 200, fixed: 'right' as const,
      render: (_: unknown, r: DomainItem) => (
        <Space size="small">
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => openDetail(r.id)}>详情</Button>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(r)}>编辑</Button>
          {r.status !== 'published' && (
            <Button type="link" size="small" icon={<RocketOutlined />} onClick={() => handlePublish(r.id)}>发布</Button>
          )}
          <Popconfirm title="确定删除？关联的实体/操作将解除绑定。" onConfirm={() => handleDelete(r.id)}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Card
      title={<><AppstoreOutlined /> 业务域管理 (Domain Studio)</>}
      extra={
        <Space>
          <Input
            placeholder="搜索编码/名称" allowClear prefix={<SearchOutlined />}
            style={{ width: 200 }} value={keyword}
            onChange={e => { setKeyword(e.target.value); setPage(1); }}
          />
          <Select
            placeholder="状态" allowClear style={{ width: 120 }} value={statusFilter}
            onChange={v => { setStatusFilter(v); setPage(1); }}
            options={[
              { value: 'draft', label: '草稿' },
              { value: 'reviewed', label: '已审核' },
              { value: 'published', label: '已发布' },
              { value: 'deprecated', label: '已废弃' },
            ]}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新建域</Button>
        </Space>
      }
    >
      <Table
        rowKey="id" columns={columns} dataSource={data} loading={loading}
        pagination={{ current: page, total, pageSize: 20, onChange: setPage, showTotal: t => `共 ${t} 条` }}
        scroll={{ x: 1000 }} size="middle"
      />

      {/* 编辑/创建 Modal */}
      <Modal
        title={editing ? '编辑业务域' : '新建业务域'}
        open={editModalOpen} onCancel={() => setEditModalOpen(false)}
        onOk={handleSave} width={600} destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item name="code" label="域编码" rules={[{ required: true }, { pattern: /^[a-z_][a-z0-9_]*$/, message: '小写字母+下划线' }]}>
            <Input placeholder="inspection" disabled={!!editing} />
          </Form.Item>
          <Form.Item name="name" label="域名称" rules={[{ required: true }]}>
            <Input placeholder="工序验收" />
          </Form.Item>
          <Form.Item name="description" label="域描述">
            <Input.TextArea rows={3} placeholder="负责工序验收相关的查询与管理……" />
          </Form.Item>
          <Space size="large">
            <Form.Item name="default_risk_level" label="默认风险等级">
              <Select style={{ width: 120 }} options={[
                { value: 'low', label: '低' }, { value: 'medium', label: '中' }, { value: 'high', label: '高' },
              ]} />
            </Form.Item>
            <Form.Item name="response_style" label="输出风格">
              <Select style={{ width: 120 }} options={[
                { value: 'text', label: '文本' }, { value: 'card', label: '卡片' },
                { value: 'table', label: '表格' }, { value: 'mixed', label: '混合' },
              ]} />
            </Form.Item>
            <Form.Item name="requires_scope_check" label="Scope校验" valuePropName="checked">
              <Switch />
            </Form.Item>
          </Space>
        </Form>
      </Modal>

      {/* 详情 Modal */}
      <Modal
        title={`域详情: ${detail?.name || ''}`}
        open={detailModalOpen} onCancel={() => setDetailModalOpen(false)}
        footer={null} width={700}
      >
        {detail && (
          <>
            <Descriptions bordered size="small" column={2}>
              <Descriptions.Item label="编码"><Text code>{detail.code}</Text></Descriptions.Item>
              <Descriptions.Item label="名称">{detail.name}</Descriptions.Item>
              <Descriptions.Item label="状态"><Tag color={statusColors[detail.status]}>{detail.status}</Tag></Descriptions.Item>
              <Descriptions.Item label="版本">{detail.version}</Descriptions.Item>
              <Descriptions.Item label="风险等级"><Tag color={riskColors[detail.default_risk_level]}>{detail.default_risk_level}</Tag></Descriptions.Item>
              <Descriptions.Item label="输出风格"><Tag>{detail.response_style}</Tag></Descriptions.Item>
              <Descriptions.Item label="Scope校验">{detail.requires_scope_check ? '是' : '否'}</Descriptions.Item>
              <Descriptions.Item label="来源">{detail.generated_by}</Descriptions.Item>
              <Descriptions.Item label="描述" span={2}>{detail.description || '-'}</Descriptions.Item>
            </Descriptions>

            {detail.entities && detail.entities.length > 0 && (
              <Card size="small" title="关联实体" style={{ marginTop: 16 }}>
                <Table
                  rowKey="id" size="small" pagination={false}
                  dataSource={detail.entities}
                  columns={[
                    { title: '编码', dataIndex: 'entity_code' },
                    { title: '名称', dataIndex: 'entity_name' },
                    { title: '状态', dataIndex: 'status', render: (v: string) => <Tag color={statusColors[v]}>{v}</Tag> },
                  ]}
                />
              </Card>
            )}

            {detail.actions && detail.actions.length > 0 && (
              <Card size="small" title="关联操作" style={{ marginTop: 12 }}>
                <Table
                  rowKey="id" size="small" pagination={false}
                  dataSource={detail.actions}
                  columns={[
                    { title: '编码', dataIndex: 'action_code' },
                    { title: '名称', dataIndex: 'action_name' },
                    { title: '类型', dataIndex: 'action_type', render: (v: string) => <Tag>{v}</Tag> },
                  ]}
                />
              </Card>
            )}
          </>
        )}
      </Modal>
    </Card>
  );
}
