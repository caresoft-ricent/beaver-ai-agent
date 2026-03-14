import { useEffect, useState } from 'react';
import { Table, Button, Modal, Form, Input, Select, message, Space, Tag, Popconfirm } from 'antd';
import { PlusOutlined, SendOutlined } from '@ant-design/icons';
import { getSkills, createSkill, updateSkill, deleteSkill, publishSkill } from '../api/admin';

interface Skill {
  id: number;
  tenant_id: number;
  skill_code: string;
  skill_name: string;
  skill_description?: string;
  status: string;
  version: number;
}

export default function SkillList() {
  const [data, setData] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      const res = await getSkills();
      setData(res.data.data?.items || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleSubmit = async () => {
    const values = await form.validateFields();
    // 将逗号分隔的关键词转为数组
    if (typeof values.match_keywords === 'string') {
      values.match_keywords = values.match_keywords.split(',').map((k: string) => k.trim()).filter(Boolean);
    }
    if (editingId) {
      await updateSkill(editingId, values);
      message.success('更新成功');
    } else {
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

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>技能/意图管理</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditingId(null); form.resetFields(); setModalOpen(true); }}>
          新建技能
        </Button>
      </div>

      <Table dataSource={data} rowKey="id" loading={loading} columns={[
        { title: '编码', dataIndex: 'skill_code' },
        { title: '名称', dataIndex: 'skill_name' },
        { title: '描述', dataIndex: 'skill_description', ellipsis: true },
        { title: '版本', dataIndex: 'version' },
        { title: '状态', dataIndex: 'status', render: (s: string) => <Tag color={s === 'published' ? 'green' : 'orange'}>{s}</Tag> },
        {
          title: '操作', render: (_: unknown, record: Skill) => (
            <Space>
              {record.status === 'draft' && (
                <Button size="small" type="primary" icon={<SendOutlined />} onClick={() => handlePublish(record.id)}>发布</Button>
              )}
              <Button size="small" onClick={() => {
                const formData = { ...record, match_keywords: (record as Record<string, unknown>).match_keywords };
                setEditingId(record.id);
                form.setFieldsValue(formData);
                setModalOpen(true);
              }}>编辑</Button>
              <Popconfirm title="确认删除?" onConfirm={() => deleteSkill(record.id).then(load)}>
                <Button size="small" danger>删除</Button>
              </Popconfirm>
            </Space>
          ),
        },
      ]} />

      <Modal title={editingId ? '编辑技能' : '新建技能'} open={modalOpen} onOk={handleSubmit} onCancel={() => setModalOpen(false)} width={640}>
        <Form form={form} layout="vertical" initialValues={{ tenant_id: 1 }}>
          <Form.Item name="tenant_id" label="租户ID" rules={[{ required: true }]}>
            <Input type="number" />
          </Form.Item>
          <Form.Item name="skill_code" label="技能编码" rules={[{ required: true }]}>
            <Input placeholder="如 query_production_progress" disabled={!!editingId} />
          </Form.Item>
          <Form.Item name="skill_name" label="技能名称" rules={[{ required: true }]}>
            <Input placeholder="如 查询产线进度" />
          </Form.Item>
          <Form.Item name="skill_description" label="描述">
            <Input.TextArea placeholder="当用户询问产线/交货进度时触发" />
          </Form.Item>
          <Form.Item name="match_keywords" label="匹配关键词(逗号分隔)">
            <Input placeholder="进度,产线,交货,生产" />
          </Form.Item>
          <Form.Item name="intent_prompt" label="意图识别提示词">
            <Input.TextArea rows={3} placeholder="可选：自定义意图识别的提示词" />
          </Form.Item>
          <Form.Item name="response_template" label="回答模板">
            <Input.TextArea rows={3} placeholder="可选：如 '产线{line_name}的进度为{progress}%'" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
