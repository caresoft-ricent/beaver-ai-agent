import { useEffect, useState, useMemo } from 'react';
import { Table, Button, Modal, Form, Input, Select, message, Space, Tag, Popconfirm, Switch } from 'antd';
import { PlusOutlined, PlayCircleOutlined, SearchOutlined } from '@ant-design/icons';
import { getLLMConfigs, createLLMConfig, updateLLMConfig, deleteLLMConfig, testLLMConfig } from '../api/admin';

interface LLMConfig {
  id: number;
  tenant_id: number;
  name: string;
  provider: string;
  model_name: string;
  api_url: string;
  api_key?: string;
  usage: string;
  status: string;
}

export default function LLMConfigList() {
  const [data, setData] = useState<LLMConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form] = Form.useForm();
  const [searchText, setSearchText] = useState('');

  const filteredData = useMemo(() => {
    if (!searchText) return data;
    const s = searchText.toLowerCase();
    return data.filter(r => r.name?.toLowerCase().includes(s) || r.provider?.toLowerCase().includes(s) || r.model_name?.toLowerCase().includes(s) || r.usage?.toLowerCase().includes(s));
  }, [data, searchText]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await getLLMConfigs();
      setData(res.data.data?.items || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleSubmit = async () => {
    const values = await form.validateFields();
    if (values._status_switch !== undefined) {
      values.status = values._status_switch ? 'active' : 'disabled';
      delete values._status_switch;
    }
    if (editingId) {
      await updateLLMConfig(editingId, values);
      message.success('更新成功');
    } else {
      await createLLMConfig(values);
      message.success('创建成功');
    }
    setModalOpen(false);
    form.resetFields();
    setEditingId(null);
    load();
  };

  const handleTest = async (id: number) => {
    try {
      const res = await testLLMConfig(id);
      if (res.data.code !== 0) {
        message.warning('测试失败: ' + (res.data.message || '未知错误'));
      } else if (res.data.data?.content) {
        message.success('测试成功: ' + res.data.data.content.slice(0, 80));
      } else {
        message.warning('测试失败: 无回复内容');
      }
    } catch {
      message.error('测试出错');
    }
  };

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>大模型配置</h2>
        <Space>
          <Input placeholder="搜索名称/厂商/模型" prefix={<SearchOutlined />} allowClear style={{ width: 220 }}
            value={searchText} onChange={e => setSearchText(e.target.value)} />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditingId(null); form.resetFields(); setModalOpen(true); }}>
            新建配置
          </Button>
        </Space>
      </div>

      <Table dataSource={filteredData} rowKey="id" loading={loading} columns={[
        { title: '名称', dataIndex: 'name' },
        { title: '厂商', dataIndex: 'provider', render: (p: string) => <Tag color="blue">{p}</Tag> },
        { title: '模型', dataIndex: 'model_name' },
        { title: '用途', dataIndex: 'usage', render: (u: string) => {
          const colorMap: Record<string, string> = { intent: 'purple', response: 'green', entity: 'orange', general: 'default' };
          return <Tag color={colorMap[u] || 'default'}>{u}</Tag>;
        }},
        { title: '状态', dataIndex: 'status', render: (s: string, record: LLMConfig) => (
          <Switch
            checked={s === 'active'}
            checkedChildren="启用"
            unCheckedChildren="停用"
            onChange={async (checked) => {
              await updateLLMConfig(record.id, { status: checked ? 'active' : 'disabled' });
              message.success('状态已更新');
              load();
            }}
          />
        )},
        {
          title: '操作', render: (_: unknown, record: LLMConfig) => (
            <Space>
              <Button size="small" icon={<PlayCircleOutlined />} onClick={() => handleTest(record.id)}>测试</Button>
              <Button size="small" onClick={() => {
                setEditingId(record.id);
                form.setFieldsValue({ ...record, _status_switch: record.status === 'active' });
                setModalOpen(true);
              }}>编辑</Button>
              <Popconfirm title="确认删除?" okText="确认" cancelText="取消" onConfirm={() => deleteLLMConfig(record.id).then(load)}>
                <Button size="small" danger>删除</Button>
              </Popconfirm>
            </Space>
          ),
        },
      ]} />

      <Modal title={editingId ? '编辑配置' : '新建配置'} open={modalOpen} onOk={handleSubmit} onCancel={() => setModalOpen(false)} width={600}
        okText="确认" cancelText="取消">
        <Form form={form} layout="vertical" initialValues={{ provider: 'doubao', usage: 'general', tenant_id: 1, _status_switch: true }}>
          <Form.Item name="tenant_id" label="租户ID" rules={[{ required: true }]}>
            <Input type="number" />
          </Form.Item>
          <Form.Item name="name" label="配置名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="provider" label="厂商" rules={[{ required: true }]}>
            <Select options={[
              { value: 'doubao', label: '豆包(字节)' },
              { value: 'glm', label: '智谱GLM' },
              { value: 'qwen', label: '通义千问' },
              { value: 'minimax', label: 'MiniMax' },
              { value: 'lmstudio', label: 'LM Studio(本地)' },
              { value: 'custom', label: '自定义兼容' },
            ]} />
          </Form.Item>
          <Form.Item name="model_name" label="模型名称" rules={[{ required: true }]}>
            <Input placeholder="如 MiniMax-Text-01, qwen3.5-122b-a10b" />
          </Form.Item>
          <Form.Item name="api_url" label="API地址" rules={[{ required: true }]}>
            <Input placeholder="https://ark.cn-beijing.volces.com/api/v3" />
          </Form.Item>
          <Form.Item name="api_key" label="API Key" rules={[{ required: true }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item name="usage" label="用途">
            <Select options={[
              { value: 'general', label: '通用' },
              { value: 'intent', label: '意图识别' },
              { value: 'response', label: '回答生成' },
              { value: 'entity', label: '实体抽取' },
            ]} />
          </Form.Item>
          <Form.Item name="_status_switch" label="启用状态" valuePropName="checked">
            <Switch checkedChildren="启用" unCheckedChildren="停用" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
